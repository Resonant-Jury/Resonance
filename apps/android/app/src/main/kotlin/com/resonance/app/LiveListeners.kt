package com.resonance.app

import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Snapshot listeners that one failure doesn't end for good (the twin of iOS's LiveListeners).
 * Firestore rides out a dropped connection by itself; an error it does report ends that
 * listener. The failed one is remembered ([failed], for the screen's retry state) and attached
 * again when the app comes back to the foreground or the screen asks ([resume]) — no tight retry
 * loop of our own. Used on the main thread, where Firestore calls its listeners.
 */
class LiveListeners {
    /** How each listener is attached; it hands back how to detach it. */
    private val attachers = LinkedHashMap<String, () -> () -> Unit>()
    private val detachers = HashMap<String, () -> Unit>()
    private val _failed = MutableStateFlow<Set<String>>(emptySet())
    /** Listeners that reported an error and wait for [resume]. */
    val failed: StateFlow<Set<String>> = _failed

    /** Attaches `name` now (replacing one of that name). */
    fun add(name: String, attach: () -> () -> Unit) {
        detachers.remove(name)?.invoke()
        attachers[name] = attach
        _failed.value -= name
        detachers[name] = attach()
    }

    /** `name` reported an error: it is over until [resume]. */
    fun fail(name: String) {
        if (name !in attachers) return
        detachers.remove(name)?.invoke()
        _failed.value += name
    }

    /** Attaches again every listener that failed; returns whether there was one. */
    fun resume(): Boolean {
        val again = _failed.value
        _failed.value = emptySet()
        again.forEach { name -> attachers[name]?.let { detachers[name] = it() } }
        return again.isNotEmpty()
    }

    fun removeAll() {
        detachers.values.forEach { it() }
        detachers.clear()
        attachers.clear()
        _failed.value = emptySet()
    }
}

/** What a Firestore error says about the thing asked for. */
object FirestoreFailure {
    private val gone = setOf(FirebaseFirestoreException.Code.PERMISSION_DENIED, FirebaseFirestoreException.Code.NOT_FOUND)

    /**
     * Refused or not there: the thing is gone (or never was) for this reader. Anything else —
     * offline, a timeout, the backend busy — is passing, and worth asking again later.
     */
    fun isGone(error: Throwable): Boolean = (error as? FirebaseFirestoreException)?.code in gone
}
