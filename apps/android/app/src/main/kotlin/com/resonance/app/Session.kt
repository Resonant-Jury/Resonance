package com.resonance.app

import android.content.Context
import android.content.SharedPreferences
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.GoogleAuthProvider
import com.resonance.api.models.Me
import com.resonance.kit.api.AccountApi
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.HttpCaching
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.api.ProfileApi
import com.resonance.kit.api.PushApi
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.SafetyApi
import com.resonance.kit.api.WritingApi
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.reading.ApiCache
import com.resonance.kit.reading.CardCache
import com.resonance.kit.reading.CardPageLoader
import com.resonance.kit.reading.FeedLoader
import java.time.OffsetDateTime
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await
import okhttp3.OkHttpClient

/**
 * Who is signed in, and their profile as the API sees it (the twin of iOS's
 * SessionStore). Firebase Auth owns the sign-in state and renews the ID
 * token; every API call asks it for a fresh one.
 *
 * Every API call goes through `http`, which carries the API's HTTP cache
 * ([httpCaching]); [kept] holds what the screens a cold start opens on last
 * showed. Both belong to the account: they are emptied when it signs out
 * (deletion included) or another one signs in.
 */
class Session(
    val config: AppConfig,
    private val prefs: SharedPreferences,
    http: OkHttpClient = OkHttpClient(),
    private val httpCaching: HttpCaching = HttpCaching(null),
    private val kept: ApiCache? = null,
) {
    enum class Phase { Restoring, SignedOut, SignedIn }
    sealed interface Profile {
        data object Unknown : Profile
        data object Loading : Profile
        data class Loaded(val me: Me) : Profile
        data object Missing : Profile
        data object Failed : Profile
    }

    /**
     * What a signed-in person sees: the tabs, or first the pen-name step (a new
     * account), or — before this device knows which — the paper and a loader.
     * Only the API's own `not_found` for /me sends someone to onboarding; any
     * other failure lets them in (the card box offers the retry), so a bad
     * connection never traps an existing account there.
     */
    enum class Entry { Waiting, Onboarding, App }

    private val _phase = MutableStateFlow(Phase.Restoring)
    val phase: StateFlow<Phase> = _phase
    private val _profile = MutableStateFlow<Profile>(Profile.Unknown)
    val profile: StateFlow<Profile> = _profile
    private val _signingIn = MutableStateFlow(false)
    val signingIn: StateFlow<Boolean> = _signingIn
    private val _signInError = MutableStateFlow<String?>(null)
    val signInError: StateFlow<String?> = _signInError
    private val _entry = MutableStateFlow(Entry.Waiting)
    val entry: StateFlow<Entry> = _entry
    /** Set when this sign-in just finished onboarding: the tabs open the writer, as the web's signup goes to /write. */
    var justOnboarded = false

    val api = ApiConfiguration(config.origin) { force -> idToken(force) }
    val reading = ReadingApi(api, http)
    val account = AccountApi(api, http)
    val writing = WritingApi(api, http)
    val messaging = MessagingApi(api, http)
    val pushApi = PushApi(api, http)
    val profiles = ProfileApi(api, http)
    private val safetyApi = SafetyApi(api, http)
    val notifications = NotificationsStore()
    val conversations = ConversationsStore()
    /**
     * Cards this account has seen, drawn at once when a page opens and then read again
     * (per account: emptied when someone signs in or out, after the person's own card
     * changes, and whenever the blocks change).
     */
    val cardCache = CardCache()
    val cardPages = CardPageLoader(reading, cardCache)

    /** When a scheduled account deletion will run (the undo banner shows until then). */
    private val _deletionDate = MutableStateFlow<OffsetDateTime?>(null)
    val deletionDate: StateFlow<OffsetDateTime?> = _deletionDate
    /** Set when the app signed the person out because they scheduled deletion. */
    private val _signedOutForDeletion = MutableStateFlow(false)
    val signedOutForDeletion: StateFlow<Boolean> = _signedOutForDeletion
    /** Bumped when the interface language changes, so the whole UI re-renders. */
    private val _languageEpoch = MutableStateFlow(0)
    val languageEpoch: StateFlow<Int> = _languageEpoch

    /**
     * Counts the changes that may have moved a card: the writer closing (saved,
     * published, revised, discarded), a card's ⋯ (visibility, delete) and a
     * change to the blocks (which hides cards). The screens showing cards
     * watch it to read them again (iOS's WriteLauncher.changes) — from the
     * server, not the HTTP cache.
     */
    private val _cardChanges = MutableStateFlow(0)
    val cardChanges: StateFlow<Int> = _cardChanges

    fun noteCardChange() {
        cardCache.clear()
        httpCaching.invalidate()
        _cardChanges.update { it + 1 }
    }

    /** A write that goes straight to Firestore (a bookmark): what the API reads back is read afresh. */
    fun noteOwnWrite() = httpCaching.invalidate()

    /** When the app last came to the foreground (the screens read again then if what they hold is old). */
    private val _foregrounded = MutableStateFlow(0L)
    val foregrounded: StateFlow<Long> = _foregrounded
    private var meReadAt = 0L

    /** Whom the person has blocked as last read on this device, until Firestore says (a cold start). */
    private val _keptBlocks = MutableStateFlow<Set<String>>(emptySet())

    /** What the signed-in account's screens last showed (the feed's store, the published shelf). */
    fun kept(uid: String): ApiCache.Account? = kept?.of(uid)

    var uid: String? = null
        private set
    /** [uid] as state: the tabs (their stacks, pages and ViewModels) belong to one account and start afresh for another. */
    private val _signedInUid = MutableStateFlow<String?>(null)
    val signedInUid: StateFlow<String?> = _signedInUid

    val safety: SafetyService? get() = uid?.let { SafetyService(it, safetyApi) }
    val bookmarks: BookmarkService? get() = uid?.let(::BookmarkService)
    val drafts: DraftService? get() = uid?.let(::DraftService)
    val hints: HintService? get() = uid?.let { HintService(it, prefs) }
    /** The signed-in profile once loaded (the publish panel's card head). */
    val me: Me? get() = (_profile.value as? Profile.Loaded)?.me
    /** The sign-in email and phone, shown read-only on the account screen. */
    val email: String? get() = auth.currentUser?.email
    val phoneNumber: String? get() = auth.currentUser?.phoneNumber

    private val auth: FirebaseAuth get() = AppFirebase.auth
    private val scope = MainScope()

    /**
     * Whom the person has blocked: live once Firestore has said, until then as last read. Lists
     * drawn from what the app kept are filtered by it before they show, and again when it changes.
     */
    val blocked: StateFlow<Set<String>> =
        combine(conversations.blockedIds, _keptBlocks) { live, kept -> live ?: kept }.stateIn(scope, SharingStarted.Eagerly, emptySet())

    init {
        // Each new FCM token is registered under whoever is signed in.
        PushCenter.onToken = { scope.launch { registerPush() } }
        // A block (from any device) hides cards: the screens showing cards read them again, past the caches.
        conversations.onBlocksChanged = { noteCardChange() }
        // The block list as Firestore says it, kept for the next cold start's lists.
        scope.launch {
            conversations.blockedIds.collect { ids ->
                val who = uid
                if (ids != null && who != null) kept?.of(who)?.saveBlocked(ids)
            }
        }
    }

    fun start(onSignedIn: suspend () -> Unit) {
        auth.addAuthStateListener { a ->
            val next = a.currentUser?.uid
            if (next == uid && _phase.value != Phase.Restoring) return@addAuthStateListener
            val previous = uid
            uid = next
            _signedInUid.value = next
            cardCache.clear()
            // Signed out (deletion signs out too) or someone else signed in: nothing of the account stays.
            // Its listeners stop first; the next account's start once Firestore's copy of it is gone.
            notifications.stop()
            conversations.stop()
            val forgetting = previous?.let(::forget)
            _keptBlocks.value = emptySet()
            meReadAt = 0L
            _profile.value = Profile.Unknown
            // A profile this device has already seen lets the tabs open at once; otherwise wait for /me.
            _entry.value = if (next != null && prefs.getBoolean(profileKey(next), false)) Entry.App else Entry.Waiting
            justOnboarded = false
            _deletionDate.value = null
            _phase.value = if (next == null) Phase.SignedOut else Phase.SignedIn
            if (next != null) {
                _signedOutForDeletion.value = false
                val listen = {
                    if (uid == next) {
                        notifications.start(next)
                        conversations.start(next)
                    }
                }
                if (forgetting == null) listen() else scope.launch { forgetting.join(); listen() }
                scope.launch { restoreKept(next) }
                scope.launch { runCatching { onSignedIn() } }
                scope.launch { refreshDeletion() }
                scope.launch { registerPush() }
            }
        }
    }

    /** The ID token; a forced refresh that fails for good signs the person out. */
    private suspend fun idToken(forceRefresh: Boolean): String? {
        val user = auth.currentUser ?: return null
        return try {
            user.getIdToken(forceRefresh).await().token
        } catch (e: FirebaseAuthInvalidUserException) {
            if (forceRefresh) auth.signOut()
            null
        }
    }

    /** The account's profile and blocks as this device last read them: the card box draws at once. */
    private suspend fun restoreKept(who: String) {
        val account = kept?.of(who) ?: return
        account.blocked()?.let { if (uid == who) _keptBlocks.value = it }
        val me = account.me() ?: return
        val now = _profile.value
        if (uid == who && (now == Profile.Unknown || now == Profile.Loading || now == Profile.Failed)) _profile.value = Profile.Loaded(me)
    }

    /**
     * Empties what the account left on the device: the HTTP cache and what the screens kept. Its
     * calls still running stop at once, before the next account's first call goes out.
     */
    private fun forget(who: String): Job {
        httpCaching.cancelCalls()
        scope.launch(NonCancellable + Dispatchers.IO) {
            httpCaching.evict()
            kept?.clear(who)
        }
        // The pushes it got, still in the shade, and the mark that it has a profile.
        PushCenter.clearDelivered()
        prefs.edit().remove(profileKey(who)).apply()
        // Firestore's own copy of it: messages, notifications, drafts, writes not yet sent.
        return scope.launch(NonCancellable) { AppFirebase.clearLocalData() }
    }

    /** The app came back to the foreground: a profile read long ago is read again (it stays on screen meanwhile). */
    fun enteredForeground(now: Long = System.currentTimeMillis()) {
        _foregrounded.value = now
        // Live lists whose listener failed (or whose people couldn't be read) listen again.
        if (_phase.value == Phase.SignedIn) {
            notifications.resume()
            conversations.resume()
        }
        if (_phase.value == Phase.SignedIn && meReadAt != 0L && now - meReadAt > FeedLoader.STALE_AFTER.inWholeMilliseconds) {
            scope.launch { loadMe() }
        }
    }

    suspend fun loadMe() {
        val asked = uid ?: return
        // What is on screen (the profile as last read) stays while it is read again.
        val shown = _profile.value as? Profile.Loaded
        if (shown == null) _profile.value = Profile.Loading
        meReadAt = System.currentTimeMillis()
        val result = try {
            Profile.Loaded(reading.me())
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiFailure) {
            // Only the contract's "this account has no profile yet" — not a bare 404 from a proxy.
            if (e.isNotFound) Profile.Missing else Profile.Failed
        } catch (e: Exception) {
            Profile.Failed
        }
        // Someone else signed in meanwhile: their own load decides.
        if (uid != asked) return
        when (result) {
            is Profile.Loaded -> setMe(result.me)
            Profile.Missing -> {
                _profile.value = Profile.Missing
                prefs.edit().remove(profileKey(asked)).apply()
                scope.launch(Dispatchers.IO) { kept?.clear(asked) }
                _entry.value = Entry.Onboarding
            }
            else -> {
                // A failed read keeps the profile already on screen; with none, the card box offers the retry.
                if (_profile.value !is Profile.Loaded) _profile.value = result
                if (_entry.value == Entry.Waiting) _entry.value = Entry.App
            }
        }
    }

    /**
     * Onboarding: the new account's pen name, region and writing language
     * (POST /api/v1/me). An account that already had a profile gets it back
     * unchanged; a name taken meanwhile throws a conflict [ApiFailure].
     */
    suspend fun createProfile(handle: String, region: String, primaryLocale: String) {
        val me = profiles.create(handle, region, primaryLocale)
        justOnboarded = true
        setMe(me)
    }

    /** Settings' profile fields (PATCH /api/v1/me): null leaves one as it is. */
    suspend fun updateProfile(handle: String? = null, bio: String? = null, region: String? = null): Me {
        val me = profiles.update(handle, bio, region)
        setMe(me)
        return me
    }

    /** The profile as the API returned it; the device remembers the account has one (and the profile, for the next cold start). */
    private fun setMe(me: Me) {
        _profile.value = Profile.Loaded(me)
        uid?.let { who ->
            prefs.edit().putBoolean(profileKey(who), true).apply()
            scope.launch { kept?.of(who)?.saveMe(me) }
        }
        _entry.value = Entry.App
    }

    private fun profileKey(uid: String) = "hasProfile:$uid"

    /**
     * The "Continue with Google" button: Sign in with Google's own button flow
     * (GetSignInWithGoogleOption) — the account chooser, which can also add an
     * account — rather than the bottom sheet of accounts already on the
     * device, which fails outright on a phone without one.
     */
    suspend fun signInWithGoogle(context: Context) = signIn {
        val option = GetSignInWithGoogleOption.Builder(context.getString(R.string.default_web_client_id)).build()
        val result = CredentialManager.create(context).getCredential(context, GetCredentialRequest.Builder().addCredentialOption(option).build())
        val credential = result.credential
        check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            "unexpected credential ${credential.type}"
        }
        val google = GoogleIdTokenCredential.createFrom(credential.data)
        auth.signInWithCredential(GoogleAuthProvider.getCredential(google.idToken, null)).await()
    }

    /** Email and password — emulator builds only, for the seeded test accounts. */
    suspend fun signIn(email: String, password: String) = signIn { auth.signInWithEmailAndPassword(email, password).await() }

    /**
     * This install stops getting the account's pushes: ask with the ID token the person still has
     * (usually cached), then sign out without waiting for the answer (iOS's SessionStore.signOut).
     * By installation id, always — whether or not this run has fetched its FCM token yet, the
     * server may hold one from an earlier run.
     */
    fun signOut() {
        val user = auth.currentUser ?: return auth.signOut()
        scope.launch {
            val token = runCatching { user.getIdToken(false).await().token }.getOrNull()
            auth.signOut()
            if (token == null) return@launch
            // Its own client: signing out cancels the calls of the shared one.
            val signedOut = PushApi(ApiConfiguration(config.origin) { token })
            runCatching { signedOut.unregister(PushCenter.installationId) }
        }
    }

    fun setLanguage(language: Strings.Language) {
        Strings.language = language
        prefs.edit().putString(LANGUAGE_KEY, language.tag).apply()
        _languageEpoch.value += 1
        // Pushes are written in the app's language, and the channel is named in it.
        PushCenter.createChannel()
        scope.launch { registerPush() }
    }

    // Push

    /** This install gets the signed-in person's pushes (again, whenever the token or the language changes). */
    suspend fun registerPush() {
        val token = PushCenter.token
        if (_phase.value != Phase.SignedIn || token == null || !PushCenter.canNotify) return
        try {
            pushApi.register(PushCenter.installationId, token, Strings.language, BuildConfig.VERSION_NAME)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            android.util.Log.w("Session", "push registration failed", e)
        }
    }

    // Account deletion

    suspend fun refreshDeletion() {
        _deletionDate.value = runCatching { account.deletion() }.getOrNull()
    }

    /**
     * Schedules deletion; the server revokes every session, so sign out here too. This install
     * stops getting the account's pushes first, while its token is still good (after the
     * revocation the server would refuse the request); should the scheduling fail, it registers
     * again.
     */
    suspend fun scheduleDeletion() {
        runCatching { pushApi.unregister(PushCenter.installationId) }
        try {
            account.scheduleDeletion()
        } catch (e: Exception) {
            registerPush()
            throw e
        }
        _signedOutForDeletion.value = true
        auth.signOut()
    }

    suspend fun cancelDeletion() {
        account.cancelDeletion()
        _deletionDate.value = null
    }

    companion object {
        const val LANGUAGE_KEY = "appLanguage"
    }

    private suspend fun signIn(work: suspend () -> Unit) {
        _signingIn.value = true
        _signInError.value = null
        try {
            work()
        } catch (e: GetCredentialCancellationException) {
            // The person closed the sheet.
        } catch (e: Exception) {
            android.util.Log.w("Session", "sign-in failed", e)
            _signInError.value = L10n.Auth.signInError
        } finally {
            _signingIn.value = false
        }
    }
}
