package com.resonance.kit.reading

import com.resonance.api.infrastructure.Serializer
import com.resonance.api.models.FeedCard
import com.resonance.api.models.FeedPage
import com.resonance.api.models.Me
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.SetSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.security.MessageDigest
import java.time.Clock
import java.time.LocalDate

/**
 * What the app last read for the screens a cold start opens on, kept on the device so they draw
 * at once instead of from a skeleton (then read again): the latest feed's first page, today's
 * picks, the profile, the card box's published shelf — and the block list as last read, which
 * filters them all before they show. One folder per account; the session empties it when
 * someone signs out or schedules deletion. Picks are the day's (UTC, as the server builds
 * them): yesterday's are never shown.
 */
class ApiCache(private val root: File, private val clock: Clock = Clock.systemUTC()) {
    private val accounts = HashMap<String, Account>()

    /** The account's cache (one instance per uid, so its in-memory copy is shared). */
    @Synchronized
    fun of(uid: String): Account = accounts.getOrPut(uid) { Account(File(root, folder(uid))) }

    /** Forgets the account (blocking: call it off the main thread). */
    fun clear(uid: String) {
        synchronized(this) { accounts.remove(uid) }?.forget()
        File(root, folder(uid)).deleteRecursively()
    }

    /** Forgets every account on the device (blocking). */
    fun clearAll() {
        synchronized(this) {
            accounts.values.forEach { it.forget() }
            accounts.clear()
        }
        root.deleteRecursively()
    }

    /** A uid as a folder name that can't be anything but one. */
    private fun folder(uid: String): String =
        MessageDigest.getInstance("SHA-256").digest(uid.toByteArray()).take(12).joinToString("") { "%02x".format(it) }

    inner class Account internal constructor(private val dir: File) : FeedStore {
        private val lock = Mutex()
        private val memory = HashMap<String, Any?>()
        @Volatile private var forgotten = false

        /** The latest cards' first page, without the blocked authors (null: never read). */
        override suspend fun latest(): FeedPage? =
            read(LATEST, FeedPage.serializer())?.let { page -> page.copy(cards = page.cards.withoutAuthors(blocked().orEmpty())) }

        /** Today's picks (UTC), without the blocked authors; null when the day's haven't been read. */
        override suspend fun picks(): List<FeedCard>? =
            read(PICKS, ListSerializer(FeedCard.serializer()), today = true)?.withoutAuthors(blocked().orEmpty())

        /** The card box's published shelf. */
        suspend fun published(): List<FeedCard>? = read(PUBLISHED, ListSerializer(FeedCard.serializer()))

        suspend fun me(): Me? = read(ME, Me.serializer())

        /** Whom the person has blocked, as last read (null: never read on this device). */
        suspend fun blocked(): Set<String>? = read(BLOCKED, SetSerializer(String.serializer()))

        override suspend fun saveLatest(page: FeedPage) = write(LATEST, FeedPage.serializer(), page)
        override suspend fun savePicks(cards: List<FeedCard>) = write(PICKS, ListSerializer(FeedCard.serializer()), cards)
        suspend fun savePublished(cards: List<FeedCard>) = write(PUBLISHED, ListSerializer(FeedCard.serializer()), cards)
        suspend fun saveMe(me: Me) = write(ME, Me.serializer(), me)
        suspend fun saveBlocked(ids: Set<String>) = write(BLOCKED, SetSerializer(String.serializer()), ids)

        internal fun forget() {
            forgotten = true
        }

        @Suppress("UNCHECKED_CAST")
        private suspend fun <T> read(name: String, serializer: KSerializer<T>, today: Boolean = false): T? = lock.withLock {
            if (forgotten) return@withLock null
            val entry = memory.getOrPut(name) { withContext(Dispatchers.IO) { load(name) } } as Entry?
            if (entry == null || (today && entry.day != LocalDate.now(clock).toString())) return@withLock null
            runCatching { json.decodeFromJsonElement(serializer, entry.data) }.getOrNull()
        }

        private suspend fun <T> write(name: String, serializer: KSerializer<T>, value: T) = lock.withLock {
            if (forgotten) return@withLock
            val entry = Entry(LocalDate.now(clock).toString(), json.encodeToJsonElement(serializer, value))
            memory[name] = entry
            withContext(Dispatchers.IO) {
                runCatching {
                    dir.mkdirs()
                    // Whole or not at all: a half-written file would read as nothing.
                    val tmp = File(dir, "$name.tmp")
                    tmp.writeText(JsonObject(mapOf("day" to JsonPrimitive(entry.day), "data" to entry.data)).toString())
                    if (!tmp.renameTo(File(dir, "$name.json"))) tmp.delete()
                    // Signed out while this was being written: it goes too.
                    if (forgotten) dir.deleteRecursively()
                }
            }
            Unit
        }

        private fun load(name: String): Entry? = runCatching {
            val o = json.parseToJsonElement(File(dir, "$name.json").readText()).jsonObject
            Entry(o.getValue("day").jsonPrimitive.content, o.getValue("data"))
        }.getOrNull()
    }

    private class Entry(val day: String, val data: kotlinx.serialization.json.JsonElement)

    private companion object {
        const val LATEST = "latest"
        const val PICKS = "picks"
        const val PUBLISHED = "published"
        const val ME = "me"
        const val BLOCKED = "blocked"
        /** The API client's own JSON (its dates have their own adapters). */
        val json get() = Serializer.kotlinxSerializationJson
    }
}

/**
 * Where [FeedLoader] keeps the feed it last read and finds it again on a cold start; its answers
 * are already filtered by the reader's blocks.
 */
interface FeedStore {
    suspend fun latest(): FeedPage?
    suspend fun picks(): List<FeedCard>?
    suspend fun saveLatest(page: FeedPage)
    suspend fun savePicks(cards: List<FeedCard>)
}

/** Without the cards of people the reader has blocked (an anonymous card names no one, so it stays). */
fun List<FeedCard>.withoutAuthors(blocked: Set<String>): List<FeedCard> =
    if (blocked.isEmpty()) this else filter { it.author?.id !in blocked }
