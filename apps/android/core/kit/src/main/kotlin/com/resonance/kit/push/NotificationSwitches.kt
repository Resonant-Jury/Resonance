package com.resonance.kit.push

import com.resonance.api.models.NotificationSettings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** The two pushes a person can ask for beyond the ones answering them (Settings → Notifications). */
enum class NotificationSwitch {
    /** "A card for tonight": one of their picks, some evenings. */
    Picks,

    /** A new public card under a pen name from someone they're connected with. */
    ConnectionCards,
}

operator fun NotificationSettings.get(switch: NotificationSwitch): Boolean = when (switch) {
    NotificationSwitch.Picks -> picks
    NotificationSwitch.ConnectionCards -> connectionCards
}

fun NotificationSettings.with(switch: NotificationSwitch, on: Boolean): NotificationSettings = when (switch) {
    NotificationSwitch.Picks -> copy(picks = on)
    NotificationSwitch.ConnectionCards -> copy(connectionCards = on)
}

/**
 * Settings → Notifications' switches as the screen shows them (the twin of the web's
 * useNotificationSettings): read once the section opens; a flip shows at once and is sent, and
 * undone — back to what the server last said, with [State.saveFailed] — when it doesn't save.
 * Each flip sends only its own switch, one write at a time in the order they were made, so the
 * server ends where the screen does; a flip overtaken by a later one of the same switch before it
 * went out isn't sent at all, and only the latest flip of a switch decides what it shows. The
 * writes run on [scope], which outlives the screen, so a flip made just before leaving still saves.
 */
class NotificationSwitches(
    private val scope: CoroutineScope,
    private val read: suspend () -> NotificationSettings,
    private val write: suspend (NotificationSwitch, Boolean) -> NotificationSettings,
) {
    data class State(
        /** The switches as the server has them, or as just flipped; null until read. */
        val settings: NotificationSettings? = null,
        /** Reading them failed (and nothing was read before): the section offers a retry. */
        val loadFailed: Boolean = false,
        /** The last flip didn't save, and was undone. */
        val saveFailed: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /** Per switch, the latest flip (its number): only that one is sent once its turn comes, and only its outcome shows. */
    private val latest = mutableMapOf<NotificationSwitch, Int>()
    /** The switches as the server last answered them: what a failed flip goes back to. */
    @Volatile private var confirmed: NotificationSettings? = null
    private val writes = Mutex()

    /** Reads the switches (again, after a failure). */
    suspend fun load() {
        _state.update { it.copy(loadFailed = false) }
        try {
            val settings = read()
            confirmed = settings
            _state.update { it.copy(settings = settings) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(loadFailed = it.settings == null) }
        }
    }

    /** Flips [switch] to [on]: shown at once, undone if it doesn't save. Nothing before the switches are read. */
    fun set(switch: NotificationSwitch, on: Boolean): Job? {
        if (_state.value.settings == null) return null
        val flip = synchronized(latest) { (latest[switch] ?: 0).plus(1).also { latest[switch] = it } }
        _state.update { it.copy(settings = it.settings?.with(switch, on), saveFailed = false) }
        return scope.launch {
            writes.withLock {
                // Flipped again meanwhile: the later flip says what the switch should be.
                if (!isLatest(switch, flip)) return@withLock
                try {
                    val saved = write(switch, on)
                    confirmed = saved
                    if (isLatest(switch, flip)) _state.update { it.copy(settings = it.settings?.with(switch, saved[switch])) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val back = confirmed?.get(switch) ?: !on
                    if (isLatest(switch, flip)) _state.update { it.copy(settings = it.settings?.with(switch, back), saveFailed = true) }
                }
            }
        }
    }

    private fun isLatest(switch: NotificationSwitch, flip: Int) = synchronized(latest) { latest[switch] == flip }
}
