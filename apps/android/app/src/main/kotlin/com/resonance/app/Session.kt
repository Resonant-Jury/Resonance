package com.resonance.app

import android.content.Context
import android.content.SharedPreferences
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.GoogleAuthProvider
import com.resonance.api.models.Me
import com.resonance.kit.api.AccountApi
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.WritingApi
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.time.OffsetDateTime
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await

/**
 * Who is signed in, and their profile as the API sees it (the twin of iOS's
 * SessionStore). Firebase Auth owns the sign-in state and renews the ID
 * token; every API call asks it for a fresh one.
 */
class Session(val config: AppConfig, private val prefs: SharedPreferences) {
    enum class Phase { Restoring, SignedOut, SignedIn }
    sealed interface Profile {
        data object Unknown : Profile
        data object Loading : Profile
        data class Loaded(val me: Me) : Profile
        data object Missing : Profile
        data object Failed : Profile
    }

    private val _phase = MutableStateFlow(Phase.Restoring)
    val phase: StateFlow<Phase> = _phase
    private val _profile = MutableStateFlow<Profile>(Profile.Unknown)
    val profile: StateFlow<Profile> = _profile
    private val _signingIn = MutableStateFlow(false)
    val signingIn: StateFlow<Boolean> = _signingIn
    private val _signInError = MutableStateFlow<String?>(null)
    val signInError: StateFlow<String?> = _signInError

    val api = ApiConfiguration(config.origin) { force -> idToken(force) }
    val reading = ReadingApi(api)
    val account = AccountApi(api)
    val writing = WritingApi(api)
    val notifications = NotificationsStore()

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
     * published, revised, discarded) and a card's ⋯ (visibility, delete). The
     * screens showing cards watch it to read them again (iOS's WriteLauncher.changes).
     */
    private val _cardChanges = MutableStateFlow(0)
    val cardChanges: StateFlow<Int> = _cardChanges

    fun noteCardChange() = _cardChanges.update { it + 1 }

    /** Asks the site to refresh its cached pages, without waiting on it (a card's page after a visibility change or a delete). */
    fun revalidate(paths: List<String>) {
        scope.launch { writing.revalidate(paths) }
    }

    var uid: String? = null
        private set

    val safety: SafetyService? get() = uid?.let(::SafetyService)
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

    fun start(onSignedIn: suspend () -> Unit) {
        auth.addAuthStateListener { a ->
            val next = a.currentUser?.uid
            if (next == uid && _phase.value != Phase.Restoring) return@addAuthStateListener
            uid = next
            _profile.value = Profile.Unknown
            _deletionDate.value = null
            _phase.value = if (next == null) Phase.SignedOut else Phase.SignedIn
            if (next != null) {
                _signedOutForDeletion.value = false
                notifications.start(next)
                scope.launch { runCatching { onSignedIn() } }
                scope.launch { refreshDeletion() }
            } else {
                notifications.stop()
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

    suspend fun loadMe() {
        _profile.value = Profile.Loading
        _profile.value = try {
            Profile.Loaded(reading.me())
        } catch (e: ApiFailure) {
            if (e.isNotFound) Profile.Missing else Profile.Failed
        } catch (e: Exception) {
            Profile.Failed
        }
    }

    suspend fun signInWithGoogle(context: Context) = signIn {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(context.getString(R.string.default_web_client_id))
            .setFilterByAuthorizedAccounts(false)
            .build()
        val result = CredentialManager.create(context).getCredential(context, GetCredentialRequest.Builder().addCredentialOption(option).build())
        val credential = result.credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            val google = GoogleIdTokenCredential.createFrom(credential.data)
            auth.signInWithCredential(GoogleAuthProvider.getCredential(google.idToken, null)).await()
        }
    }

    /** Email and password — emulator builds only, for the seeded test accounts. */
    suspend fun signIn(email: String, password: String) = signIn { auth.signInWithEmailAndPassword(email, password).await() }

    fun signOut() = auth.signOut()

    fun setLanguage(language: Strings.Language) {
        Strings.language = language
        prefs.edit().putString(LANGUAGE_KEY, language.tag).apply()
        _languageEpoch.value += 1
    }

    // Account deletion

    suspend fun refreshDeletion() {
        _deletionDate.value = runCatching { account.deletion() }.getOrNull()
    }

    /** Schedules deletion; the server revokes every session, so sign out here too. */
    suspend fun scheduleDeletion() {
        account.scheduleDeletion()
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
