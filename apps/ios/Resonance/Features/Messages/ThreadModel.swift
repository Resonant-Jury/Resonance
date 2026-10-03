import FirebaseFirestore
import Foundation
import Observation
import ResonanceKit

/// One conversation (ThreadView.tsx): who it's with, whether you may write, its messages — the
/// newest 50 live, older ones paged in as the thread is scrolled or searched — and sending
/// through the API. The twin of Android's ThreadModel.
///
/// **Messages** (`messages`, oldest first; `rows` lays them out in runs) are the conversation's
/// `MessageHistory` followed by this person's own messages still on their way (the
/// conversation's `Outbox`); a message sent from here is drawn the moment it is sent and the
/// document replaces it in place, under the same `ChatMessage.key`.
///
/// **Sending** (`send`) takes what the composer holds and frees the composer at once; the outbox
/// sends in order and a failure stays in the thread as a failed message (`retry`, `discard`). The
/// outbox belongs to the session, not to this model, so a send carries on when the thread is
/// covered by a profile or left.
///
/// Opened with the other person's uid (from Messages, a notification, their page), it listens to
/// the conversation by its pair id at once and asks for their profile alongside — only for their
/// face and whether you may write. Opened by pen name alone (an older link), it asks who they are
/// first. A conversation exists only after its first message: until then reading it is refused,
/// which here means "no messages yet".
///
/// It is read — its unread count reset, its pushes taken out of Notification Center — only while
/// the screen says it is on show (`setOnScreen`).
///
/// **Letters.** A note left on a card connects no one: the card's author answering it does. The
/// conversation says whose letter waits (`request.from`), and `access` what the thread's foot
/// offers — the composer, the wait for an answer, the answer that connects, or nothing to write.
/// Opened for a note (`?note=`, a bell or an older push), the thread goes to it once it is read and
/// sets up a reply to it; a note too old to be in the thread is answered with the chip instead.
@MainActor @Observable
final class ThreadModel {
    /// `failed`: who they are couldn't be asked (offline, a server error) — not
    /// "nobody by that name", which is `missing`.
    enum Phase: Equatable { case loading, missing, failed, ready }

    /// What a message may hold at most (ThreadView's limit, and the contract's).
    static let maxLength = 2000

    /// The pen name the route named them by (it may have changed since).
    let handle: String
    private(set) var phase: Phase = .loading
    /// Who the conversation is with, when known (from the start, when the route carried it).
    private(set) var otherId: String?
    private(set) var other: Author?
    /// Whether you may write (connected, no block). Nil until known — the composer shows meanwhile.
    private(set) var connected: Bool?
    private(set) var isBlocked = false
    private(set) var conversationExists = false
    /// Who wrote the letter waiting for an answer here (the conversation's `request.from`), if one waits.
    private(set) var requestFrom: String?
    /// The conversation has been read once (or found not to exist): whether a letter waits is known.
    private(set) var conversationRead = false
    /// The note the thread was opened for, found in it: the screen takes the thread there (once).
    private(set) var noteToShow: String?

    /// The conversation as the thread draws it, oldest first: every message held (the live window
    /// and the older pages read), then this person's own still on their way. A list keeps its rows
    /// by `ChatMessage.key`.
    private(set) var messages: [ChatMessage] = []
    /// `messages` laid out in Messenger's runs, with the day and time labels that lead them.
    private(set) var rows: [ThreadRow] = []
    /// The first snapshot of messages has arrived (or there is no conversation yet).
    private(set) var threadReady = false
    /// The listeners failed (not "no conversation"): what was read stays; they listen again on `resume()`.
    private(set) var listenFailed = false
    /// Shared cards (by the button or by a link to their page), as the viewer may see them, read together.
    let sharedCards: CardSummaries

    // MARK: Paging state

    /// There may be messages older than the oldest held: `loadOlder` reads the next page. False at
    /// the beginning of the conversation.
    private(set) var hasOlder = false
    /// A page of older messages (or the whole history, for a search) is being read.
    private(set) var loadingOlder = false
    /// The last read of older messages failed; `loadOlder` tries again.
    private(set) var olderError = false

    // MARK: Composer state

    var draft = ""
    var pendingCard: FeedCard?
    var noteRef: MessagingAPI.NoteRef?
    /// The message the next one answers (set by `reply(to:)`, cleared by sending and `cancelReply`).
    private(set) var replyingTo: ReplyQuote?
    var error: String?

    // MARK: Search state

    /// What is being searched for (`search`); empty when not searching.
    private(set) var searchQuery = ""
    /// The messages that match, newest first, each with the stretches of its text to highlight.
    private(set) var searchHits: [SearchHit] = []
    /// The whole history was read as far as the cap allows and there is still more: older matches may exist.
    private(set) var searchCapped = false
    /// Every message of the conversation is held, so `searchHits` is complete.
    var searchComplete: Bool { !hasOlder }
    /// Older messages are being read for the search: `searchHits` may still grow.
    var searchLoading: Bool { loadingOlder && !searchQuery.isBlank }

    @ObservationIgnored private let session: SessionStore
    @ObservationIgnored private var listeners: [ListenerRegistration] = []
    /// Which `attach` the live listeners belong to (a late callback of a removed one is ignored).
    @ObservationIgnored private var listening = 0
    @ObservationIgnored private var history = MessageHistory<DocumentSnapshot>()
    @ObservationIgnored private var thread = ThreadMessages()
    /// Which life of the conversation's history a page read belongs to (a reset makes a late page void).
    @ObservationIgnored private var epoch = 0
    /// Refusals met while the conversation list already had it (a creation racing the first read).
    @ObservationIgnored private var refusals = 0
    @ObservationIgnored private var paging: Task<Void, Never>?
    @ObservationIgnored private var pagesPending = 0
    @ObservationIgnored private var allRequested = false
    @ObservationIgnored private var searching: Task<Void, Never>?
    @ObservationIgnored private var unreadForMe = 0
    @ObservationIgnored private var onScreen = false
    @ObservationIgnored private var watchedOutbox: Outbox?
    @ObservationIgnored private var rebuilding = false
    /// The note the route named, until the thread is read and it is looked for.
    @ObservationIgnored private var openedFor: MessagingAPI.NoteRef?
    /// Each message's shared card, worked out once per version of the message.
    @ObservationIgnored private var shares: [String: (message: ChatMessage, share: CardShare?)] = [:]

    init(handle: String, uid: String?, noteRef: MessagingAPI.NoteRef?, session: SessionStore) {
        self.handle = handle
        openedFor = noteRef
        self.session = session
        sharedCards = CardSummaries(api: session.reading)
        let previews = session.cardPreviews
        sharedCards.onLoaded = { previews.remember($0) }
        if let uid, uid != session.uid {
            otherId = uid
            // Someone Messages already shows: their face and current pen name at once.
            other = session.conversations.person(uid).map(Author.init(person:))
        }
    }

    var me: String? { session.uid }
    var pairId: String? {
        guard let me, let otherId else { return nil }
        return Self.pairId(me, otherId)
    }

    /// Their pen name as shown: the current one, once known.
    var displayHandle: String { other?.handle ?? handle }

    /// What the thread's foot offers: the composer, or a word in its place (the letter states).
    var access: ThreadAccess {
        ThreadAccess.of(connected: connected, blocked: isBlocked, requestFrom: requestFrom, me: me)
    }

    /// Whether what the foot offers is known: not before the conversation is read when the two aren't connected.
    var accessKnown: Bool { connected != false || conversationRead }

    /// A message can be answered: delivered, and the thread has a composer to answer it from.
    func canReply(_ message: ChatMessage) -> Bool { message.canReply && access.canWrite }

    /// Whether `message` is the viewer's own (drawn on the right).
    func isMine(_ message: ChatMessage) -> Bool { message.senderId == me }

    /// The message with this id or key, if the thread holds it.
    func message(_ idOrKey: String) -> ChatMessage? {
        messages.last { $0.id == idOrKey || $0.key == idOrKey }
    }

    // MARK: - Who it is with

    func load() async {
        if phase == .failed { phase = .loading }
        if otherId != nil {
            phase = .ready
            attach()
            await refreshConnection()
        } else if await refreshConnection() {
            phase = .ready
            attach()
        }
    }

    /// Re-reads who they are and whether you may still write (after a block,
    /// or coming back). True when their profile arrived.
    @discardableResult
    func refreshConnection() async -> Bool {
        do {
            if let profile = try await currentProfile() {
                other = profile.author
                otherId = profile.author.id
                isBlocked = profile.isBlocked
                connected = profile.isConnected && !profile.isBlocked
                return true
            }
            // Nobody by that name or uid (any more), or it's you.
            stop()
            phase = .missing
        } catch {
            // Offline or a server error: keep what's known. By pen name alone there is nothing to open yet —
            // which is a retry, not "nobody by that name".
            if otherId == nil, !Task.isCancelled { phase = .failed }
        }
        return false
    }

    /// Their profile as you see it. With their uid known, a pen name they've
    /// since changed (or that someone else has since taken) is looked up afresh.
    private func currentProfile() async throws -> Profile? {
        let asked = displayHandle
        if let profile = try await profile(asked), otherId == nil || profile.author.id == otherId {
            return profile.isSelf ? nil : profile
        }
        guard let otherId, let current = try await currentHandle(of: otherId),
              current.caseInsensitiveCompare(asked) != .orderedSame,
              let profile = try await profile(current), profile.author.id == otherId else { return nil }
        return profile
    }

    private func profile(_ handle: String) async throws -> Profile? {
        do {
            return try await session.reading.profile(handle)
        } catch let failure as APIFailure where failure.isNotFound {
            return nil
        }
    }

    /// Their pen name now (users/{uid} is public); nil for an account that's gone.
    private func currentHandle(of uid: String) async throws -> String? {
        let data = try await FirebaseBootstrap.db.collection("users").document(uid).getDocument().data()
        return Person(id: uid, data: data)?.handle
    }

    // MARK: - Listening

    /// Back on screen (from a page pushed over the thread), or the conversation
    /// just appeared in Messages: listening again if the listeners stopped.
    func resume() {
        guard phase == .ready, listeners.isEmpty else { return }
        listenFailed = false
        attach()
    }

    /// Listens to the conversation and its newest 50 messages, by pair id.
    private func attach() {
        guard let pairId, listeners.isEmpty else { return }
        watchOutbox()
        syncViewing()
        listening += 1
        let run = listening
        let origin = session.config.origin
        let ref = FirebaseBootstrap.db.collection("conversations").document(pairId)
        listeners.append(ref.addSnapshotListener { [weak self] snap, error in
            MainActor.assumeIsolated {
                guard let self, run == self.listening else { return }
                if let error { return self.listenerFailed(error, pair: pairId) }
                guard let snap, snap.exists else { return self.letterChanged(nil) }
                self.conversationExists = true
                self.refusals = 0
                self.unreadForMe = ((snap.get("unread") as? [String: Any])?[self.me ?? ""] as? NSNumber)?.intValue ?? 0
                self.letterChanged(ThreadAccess.requestFrom(snap.data()))
                self.markReadIfNeeded()
            }
        })
        // With the metadata changes, a window first read from the cache is followed by the server's word on it
        // (which settles whether there is anything older).
        listeners.append(ref.collection("messages").order(by: "sentAt", descending: true).limit(to: ChatPaging.liveLimit)
            .addSnapshotListener(includeMetadataChanges: true) { [weak self] snap, error in
                MainActor.assumeIsolated {
                    guard let self, run == self.listening else { return }
                    if let error { return self.listenerFailed(error, pair: pairId) }
                    guard let snap else { return }
                    // The newest 50 join what is held; the ones that slid out of the window stay.
                    let window = snap.documents.map { MessageHistory<DocumentSnapshot>.Entry(Self.message($0, origin: origin), cursor: $0) }
                    let merged = self.history.mergeWindow(window, authoritative: !snap.metadata.isFromCache)
                    // Held nothing in common with the window: it started afresh, and a page being read for the old one is void.
                    if merged == .restarted { self.forgetPaging() }
                    guard merged != .unchanged || !self.threadReady || self.hasOlder != self.history.hasOlder else { return }
                    self.threadReady = true
                    self.historyChanged()
                    self.markReadIfNeeded()
                    self.lookForOpenedNote()
                }
            })
    }

    /// A listener that fails is over; `resume()` starts them again. Refused
    /// means there is no conversation (yet, or any more): no messages, not an error —
    /// unless Messages already lists it (it was created while this read was on its
    /// way), which is worth a few more tries. Anything else (offline for good, the
    /// backend busy) keeps what was read, says so while there is nothing
    /// (`listenFailed`), and listens again when the screen or the app comes back.
    private func listenerFailed(_ error: Error, pair: String) {
        stop()
        threadReady = true
        guard Self.isNoConversation(error) else {
            listenFailed = true
            return
        }
        conversationExists = false
        unreadForMe = 0
        letterChanged(nil)
        resetHistory()
        lookForOpenedNote()
        if refusals < 3, session.conversations.conversations.contains(where: { $0.id == pair }) {
            refusals += 1
            attach()
        }
    }

    /// The letter waiting here, as the conversation now says. One that is gone while the two weren't
    /// connected was answered (the answer connected them) or taken back: who may write is asked again.
    private func letterChanged(_ from: String?) {
        conversationRead = true
        guard from != requestFrom else { return }
        let settled = requestFrom != nil && from == nil
        requestFrom = from
        guard settled, connected == false else { return }
        // Their answer is their write, not ours: a profile kept from a moment ago would still say "not connected".
        session.httpCache.freshness.invalidate()
        Task { await refreshConnection() }
    }

    /// The note the thread was opened for, once the thread has been read: in the thread (a note the
    /// server copied there), the screen goes to it and sets up a reply to it. One that isn't — an
    /// older note, never copied — is answered with the chip, unless the card it was left on is
    /// anonymous: an answer tied to that note would tell its writer who wrote the card (and so would
    /// a card that can't be read now, which then gets no chip either).
    private func lookForOpenedNote() {
        guard let note = openedFor, let pairId else { return }
        openedFor = nil
        Task {
            let ref = FirebaseBootstrap.db.collection("conversations").document(pairId).collection("messages").document(note.noteId)
            if (try? await ref.getDocument())?.exists == true {
                noteToShow = note.noteId
                return
            }
            // Asked on its own: the thread's cards may still be on their way.
            let card = try? await session.reading.cards(keys: [note.cardId]).first { $0.id == note.cardId }
            if let card, !card.anonymous { noteRef = note }
        }
    }

    /// The note was shown.
    func noteShown() {
        noteToShow = nil
    }

    /// Reading a conversation that doesn't exist is refused by the rules (PERMISSION_DENIED).
    nonisolated static func isNoConversation(_ error: Error) -> Bool {
        let e = error as NSError
        return e.domain == FirestoreErrorDomain && e.code == FirestoreErrorCode.permissionDenied.rawValue
    }

    /// Connections and conversations share the sorted `uid1_uid2` pair id.
    nonisolated static func pairId(_ a: String, _ b: String) -> String {
        [a, b].sorted().joined(separator: "_")
    }

    /// Stops listening (the screen is covered or going away, or the conversation is being deleted).
    /// What was read stays; messages still sending carry on (they belong to the session).
    func stop() {
        listening += 1
        listeners.forEach { $0.remove() }
        listeners = []
    }

    // MARK: - Reading

    /// Whether the thread is on screen with the app in the foreground — the screen says so as it
    /// appears and disappears, and as the app comes and goes. Only then is the conversation read: its
    /// unread count reset, its pushes taken out of Notification Center and kept quiet while it shows
    /// (`PushCenter.viewing`). A message that arrives behind another page, the lock screen or with the
    /// app in the background stays unread, its push in place, until the thread is on show again.
    func setOnScreen(_ visible: Bool) {
        guard visible != onScreen else { return }
        onScreen = visible
        syncViewing()
        markReadIfNeeded()
    }

    /// Tells the push center whether this conversation is the one on show (once its pair id is known).
    private func syncViewing() {
        guard let pairId else { return }
        if !onScreen {
            PushCenter.shared.stoppedViewing(pairId)
        } else if PushCenter.shared.viewingConversation != pairId {
            PushCenter.shared.viewing(pairId)
        }
    }

    /// The unread count the conversation keeps for the viewer goes back to nothing — while the thread is on show.
    private func markReadIfNeeded() {
        guard onScreen, let pairId, let me, unreadForMe > 0 else { return }
        // Not again for each snapshot until the conversation's own count says so.
        unreadForMe = 0
        FirebaseBootstrap.db.collection("conversations").document(pairId).updateData(["unread.\(me)": 0])
    }

    // MARK: - History

    /// The documents or the outbox changed: what the thread draws, what paging and search know, the cards to look up.
    private func historyChanged() {
        if hasOlder != history.hasOlder { hasOlder = history.hasOlder }
        rebuild()
        loadCards()
        if !searchQuery.isBlank {
            loadAll()
            runSearch()
        }
    }

    /// History and what is on its way, as one list; a message on its way whose document has arrived
    /// leaves the outbox (whose change calls back here: once is enough).
    private func rebuild() {
        guard !rebuilding else { return }
        rebuilding = true
        defer { rebuilding = false }
        let box = outbox
        let held = history
        box?.reconcile { $0.isIn(held) }
        let built = thread.build(held, onItsWay: box?.entries ?? [])
        guard built != messages else { return }
        messages = built
        rows = ThreadRows.build(built)
    }

    /// Everything held is forgotten (the conversation is gone, or the listener lost track of it).
    private func resetHistory() {
        history.clear()
        forgetPaging()
        thread.clear()
        shares = [:]
        historyChanged()
    }

    /// Pages being read belong to a history that is no more: they stop, and the next read starts from the new one.
    private func forgetPaging() {
        epoch += 1
        paging?.cancel()
        paging = nil
        olderError = false
        allRequested = false
        searchCapped = false
    }

    /// Reads the next page of older messages (50) into the thread. Does nothing at the beginning
    /// of the conversation or while a page is already being read. Prepends: nothing already held moves.
    func loadOlder() {
        guard history.hasOlder, pagesPending == 0 else { return }
        page { await $0.fetchOlder(ChatPaging.olderPage) }
    }

    /// Reads older pages until the message with `id` is held (a quote's original, a search hit), at
    /// most `maxPages` of 100; false if it isn't (it isn't in this conversation, the beginning came
    /// first, a read failed).
    func ensureLoaded(_ id: String, maxPages: Int = 20) async -> Bool {
        // A read that failed before is tried again: the person asked for this one.
        olderError = false
        var pages = 0
        while !history.contains(id) {
            guard history.hasOlder, pages < maxPages else { return false }
            pages += 1
            if pagesPending > 0, let running = paging {
                await running.value
            } else {
                await page { await $0.fetchOlder(ChatPaging.jumpPage) }.value
            }
            if olderError { return false }
        }
        return true
    }

    /// Reads the whole conversation, 200 at a time, up to `cap` messages (the search needs all of
    /// them); once per start of a search. `searchCapped` says whether the cap cut it short.
    func loadAll(cap: Int = ChatPaging.loadAllCap) {
        guard !allRequested else { return }
        allRequested = true
        page { model in
            while model.history.hasOlder, model.history.count < cap {
                guard await model.fetchOlder(ChatPaging.allPage) else { break }
            }
            model.searchCapped = model.history.hasOlder && model.history.count >= cap
            // Done only once it reached the beginning or the cap: a read that failed, or one that found no
            // window to page back from yet (a search before the first snapshot), is asked again as the
            // history changes or by the next search.
            model.allRequested = !model.olderError && (!model.history.hasOlder || model.searchCapped) && !model.history.isEmpty
        }
    }

    /// One paging job at a time: `work` runs after the one before it. `loadingOlder` holds while any is pending.
    @discardableResult
    private func page(_ work: @escaping @MainActor (ThreadModel) async -> Void) -> Task<Void, Never> {
        let before = paging
        pagesPending += 1
        loadingOlder = true
        let task = Task { [weak self] in
            await before?.value
            if let self, !Task.isCancelled { await work(self) }
            guard let self else { return }
            self.pagesPending -= 1
            if self.pagesPending == 0 { self.loadingOlder = false }
        }
        paging = task
        return task
    }

    /// One older page into the history; whether it brought a page in.
    @discardableResult
    private func fetchOlder(_ limit: Int) async -> Bool {
        guard let pairId, let cursor = history.oldestCursor else { return false }
        let life = epoch
        let origin = session.config.origin
        olderError = false
        let query = FirebaseBootstrap.db.collection("conversations").document(pairId).collection("messages")
            .order(by: "sentAt", descending: true).start(afterDocument: cursor).limit(to: limit)
        do {
            let snap = try await query.getDocuments()
            guard life == epoch else { return false }
            // Offline, Firestore answers from what it has: a short answer then is no sign of the beginning.
            if snap.metadata.isFromCache, snap.documents.count < limit {
                olderError = true
                return false
            }
            history.mergePage(snap.documents.map { .init(Self.message($0, origin: origin), cursor: $0) }, limit: limit)
            historyChanged()
            return true
        } catch {
            if life == epoch { olderError = true }
            return false
        }
    }

    // MARK: - Sending

    /// ThreadView's `valid`: text or a card, within 2000, somewhere to send it. A message in flight
    /// doesn't matter: the next one queues behind it.
    var canSend: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return (!trimmed.isEmpty || pendingCard != nil) && trimmed.utf16.count <= Self.maxLength && pairId != nil
    }

    /// This conversation's outbox (kept by the session, so it outlives this model). Nil until we know whom it is with.
    private var outbox: Outbox? {
        guard let pairId, let otherId else { return nil }
        return session.outboxes.of(pairId, to: otherId)
    }

    private func watchOutbox() {
        guard let box = outbox, watchedOutbox !== box else { return }
        watchedOutbox?.unwatch(self)
        watchedOutbox = box
        box.watch(by: self) { [weak self] entries in self?.outboxChanged(entries) }
        rebuild()
    }

    private func outboxChanged(_ entries: [Outbox.Outgoing]) {
        // A message that failed shows on its own row, with its retry.
        rebuild()
        loadCards()
        // The first message made the conversation: listen to it now.
        if phase == .ready, !conversationExists, listeners.isEmpty, entries.contains(where: { $0.status == .sent }) {
            listenFailed = false
            attach()
        }
    }

    /// Sends what the composer holds — the text, the card, the quoted note, the message being
    /// replied to — and clears the composer at once. The message appears in the thread as sending;
    /// a failure keeps it there to `retry` or `discard`. Never waits: the next one can be written
    /// and sent while this one is on its way.
    func send() {
        guard canSend, let me, let box = outbox else { return }
        watchOutbox()
        // The card it shares is drawn at once, not asked for.
        if let card = pendingCard { sharedCards.remember(card) }
        box.enqueue(Outbox.Outgoing(clientId: Outbox.newClientId(), senderId: me,
                                    text: draft.trimmingCharacters(in: .whitespacesAndNewlines),
                                    cardRef: pendingCard?.id, noteRef: noteRef, replyTo: replyingTo))
        draft = ""
        pendingCard = nil
        noteRef = nil
        replyingTo = nil
        error = nil
    }

    /// Sends a message that failed again (its key or id), under the id it was first written under
    /// (the server doesn't write one twice). The messages written before it that failed with it go
    /// first, so the order the person wrote them in holds.
    func retry(_ keyOrId: String) {
        guard let box = outbox, let id = clientId(in: box, keyOrId) else { return }
        box.retry(id)
    }

    /// Sends again every message that failed, in the order they were written.
    func retryAll() {
        outbox?.retryFailed()
    }

    /// Deletes a message that failed (its key or id); one still sending can't be taken back.
    func discard(_ keyOrId: String) {
        guard let box = outbox, let id = clientId(in: box, keyOrId) else { return }
        box.discard(id)
    }

    private func clientId(in box: Outbox, _ keyOrId: String) -> String? {
        box.entries.first { $0.clientId == keyOrId || $0.serverId == keyOrId }?.clientId
    }

    // MARK: - Replying

    /// The next message answers `message`; only a delivered one can be answered (a pending one has
    /// no document yet), and only where there is a composer to answer from.
    func reply(to message: ChatMessage) {
        if canReply(message) { replyingTo = ReplyQuote.of(message) }
    }

    func cancelReply() {
        replyingTo = nil
    }

    // MARK: - Shared cards

    /// The Resonance card `message` shares — by the card button, or as a link to the card's page —
    /// drawn as the card's own bubble; nil for any other message.
    func cardShare(of message: ChatMessage) -> CardShare? {
        if let kept = shares[message.key], kept.message == message { return kept.share }
        let share = message.cardShare(origin: session.config.origin)
        shares[message.key] = (message, share)
        return share
    }

    /// Where a shared card stands: on its way, found, hidden from the viewer (or gone), or not read (offline).
    func cardLookup(_ key: String) -> CardSummaries.Lookup { sharedCards.lookup(key) }

    /// What `message`'s bubble carries besides its words: the card it shares (or its stand-in while
    /// that is read), else its link's preview, else nothing more (`Carried.of`).
    func carried(_ message: ChatMessage) -> Carried<FeedCard> {
        Carried.of(message, share: cardShare(of: message), lookup: sharedCards.lookup)
    }

    /// The card a link in a message leads to, when it is a card page of the site (it opens in the app).
    func cardKey(of url: URL) -> String? {
        CardLinks.cardKey(url, origin: session.config.origin)
    }

    /// A shared card as the viewer may see it (nil: on its way, or not visible to them).
    func card(_ key: String) -> FeedCard? { sharedCards.card(key) }

    /// The cards the messages share, those not asked for yet in one request.
    private func loadCards() {
        let keys = messages.compactMap { cardShare(of: $0)?.key }
        guard !keys.isEmpty else { return }
        Task { await sharedCards.load(keys) }
    }

    // MARK: - Deleting

    /// Deletes the whole conversation, for both people (deleteConversation: messages in batches, then the parent).
    func deleteConversation() async -> Bool {
        guard let pairId else { return false }
        let db = FirebaseBootstrap.db
        let ref = db.collection("conversations").document(pairId)
        do {
            stop()
            let all = try await ref.collection("messages").getDocuments().documents
            for chunk in stride(from: 0, to: all.count, by: 450).map({ Array(all[$0..<min($0 + 450, all.count)]) }) {
                let batch = db.batch()
                chunk.forEach { batch.deleteDocument($0.reference) }
                try await batch.commit()
            }
            try await ref.delete()
            session.outboxes.forget(pairId)
            resetHistory()
            return true
        } catch {
            self.error = L10n.Messages.deleteError
            resume()
            return false
        }
    }

    // MARK: - Search and media

    /// Searches the conversation for `query` (case and the width of ASCII letters don't matter):
    /// the matches, newest first, are `searchHits`. The first search of a visit also reads the
    /// whole history (`loadAll`), and the hits grow as it arrives. A blank query ends the search.
    func search(_ query: String) {
        searchQuery = query
        guard !query.isBlank else { return endSearch() }
        loadAll()
        runSearch()
    }

    /// Leaves the search: no query, no hits (the history read for it stays).
    func endSearch() {
        searching?.cancel()
        searching = nil
        searchQuery = ""
        if !searchHits.isEmpty { searchHits = [] }
    }

    /// Above this many messages a search runs off the main actor.
    private static let searchOffMain = 400

    private func runSearch() {
        let query = searchQuery
        let held = history.messages
        searching?.cancel()
        searching = Task { [weak self] in
            let hits = held.count < Self.searchOffMain
                ? MessageSearch.find(held, query: query)
                : await Task.detached(priority: .userInitiated) { MessageSearch.find(held, query: query) }.value
            guard let self, !Task.isCancelled, self.searchQuery == query, hits != self.searchHits else { return }
            self.searchHits = hits
        }
    }

    /// Cards shared here (in thread order, once each) and links written in messages.
    var shared: (cards: [String], links: [ChatLinks.Link]) {
        var seenCards: [String] = [], seenLinks: [ChatLinks.Link] = []
        for m in messages {
            if let id = m.cardRef, !seenCards.contains(id) { seenCards.append(id) }
            for link in ChatLinks.links(in: m.text) where !seenLinks.contains(where: { $0.url == link.url }) {
                seenLinks.append(link)
            }
        }
        return (seenCards, seenLinks)
    }

    /// A message document as the thread draws it; a pending server time (a document just written) reads as an estimate.
    nonisolated private static func message(_ doc: DocumentSnapshot, origin: URL) -> ChatMessage {
        ChatMessage.from(id: doc.documentID, fields: doc.data() ?? [:],
                         sentAt: (doc.get("sentAt", serverTimestampBehavior: .estimate) as? Timestamp)?.dateValue() ?? Date(),
                         origin: origin)
    }
}

extension Author {
    /// Someone as Messages draws them, until their profile arrives.
    init(person: Person) {
        self.init(id: person.id, handle: person.handle, initials: person.initials, accentColor: person.accentColor ?? "",
                  avatarUrl: person.avatarURL?.absoluteString, avatarSeed: person.avatarSeed, verified: false, region: nil)
    }
}

private extension String {
    var isBlank: Bool { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}
