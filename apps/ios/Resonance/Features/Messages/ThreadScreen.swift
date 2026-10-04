import DesignSystem
import ResonanceKit
import SwiftUI

/// A conversation (ThreadView.tsx, phone): the person in the bar over the messages — newest at the
/// bottom, stacked in runs, with the quotes of replies and the previews of links, older ones read
/// in as the thread is scrolled — then attachments and the composer. A long-press lifts a message
/// with its actions, a drag toward the middle replies. The ⋯ holds search, what's been shared,
/// report, block and delete; search lists the matches over the thread and steps through them. The
/// twin of Android's ThreadScreen.
struct ThreadScreen: View {
    let handle: String
    /// The other person's uid, when the place it was opened from knew it.
    var uid: String?
    let note: MessagingAPI.NoteRef?
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isSelectedTab) private var onSelectedTab
    @State private var model: ThreadModel?
    /// Closes the model once the screen is gone for good (`ScreenLifetime`).
    @State private var lifetime = ScreenLifetime()
    /// Between appearing and disappearing: the top of its stack (a page pushed over it makes it disappear).
    @State private var appeared = false
    @State private var searching = false
    @State private var query = ""
    /// The list of matches covers the thread; after a match is chosen the thread shows and the bar steps through them.
    @State private var showResults = false
    @State private var currentHit: String?
    @State private var showingMedia = false
    @State private var pickingCard = false
    @State private var reporting = false
    @State private var sendingReport = false
    @State private var confirmingBlock = false
    @State private var confirmingDelete = false
    @State private var busy = false
    /// A link to an IP address or a punycode name waits here for the reader's yes.
    @State private var linkToConfirm: ChatLinks.Parsed?
    @State private var blockError: String?
    /// The message pressed and held, lifted with its menu.
    @State private var menu: MessageMenu?
    @State private var flash = ThreadFlash()
    @State private var frames = FrameBook()
    /// How tall the bar is (the list's room under it), how wide the list, and the screen's safe area.
    @State private var barHeight: CGFloat = 58
    @State private var listWidth: CGFloat = 390
    @State private var safe = EdgeInsets()
    @State private var underBar = false
    /// Where the list is scrolled to, and the way to send it to a message.
    @State private var scroll = ScrollPosition(idType: String.self)
    /// A word over the composer for a moment ("Copied").
    @State private var toast: String?
    @State private var resultsUnderBar = false
    @FocusState private var composing: Bool
    @FocusState private var searchFocused: Bool

    var body: some View {
        dialogs(screen)
            .toolbar(.hidden, for: .navigationBar)
            // A drag across a message replies to it: only the screen's edge goes back.
            .swipeBackFromEdgeOnly()
            .task {
                if let model {
                    // Back from a page pushed over the thread (a profile, a shared card): the listeners
                    // stopped when it left, so new messages show and get read again; and a block made
                    // there shows here.
                    model.resume()
                    await model.refreshConnection()
                    return
                }
                let model = ThreadModel(handle: handle, uid: uid, noteRef: note, session: session)
                #if DEBUG
                // `-threadDraft "…"` fills the composer and `-threadSearch "…"` opens the search with that query
                // (screen checks; the simulator can't type into either).
                if let draft = UserDefaults.standard.string(forKey: "threadDraft") { model.draft = draft }
                if let search = UserDefaults.standard.string(forKey: "threadSearch") {
                    searching = true
                    showResults = true
                    query = search
                }
                #endif
                self.model = model
                lifetime.model = model
                model.setOnScreen(visible && scenePhase == .active)
                await model.load()
            }
            // The conversation is read and listened to only while it is on show (its unread count, its pushes):
            // not under a page pushed over it, nor on a tab out of sight.
            .onAppear {
                appeared = true
                shown(onSelectedTab)
            }
            .onDisappear {
                appeared = false
                shown(false)
            }
            .onChange(of: onSelectedTab) { _, selected in shown(appeared && selected) }
            // Back in the foreground: listeners that failed listen again; a thread that couldn't find its person asks again.
            .onChange(of: scenePhase) { _, phase in
                guard let model, visible else { return }
                model.setOnScreen(phase == .active)
                guard phase == .active else { return }
                if model.phase == .failed { Task { await model.load() } } else { model.resume() }
            }
            // No conversation yet, then their first message arrives: it shows up in Messages, and here.
            .onChange(of: conversationListed) { _, listed in
                if listed, visible { model?.resume() }
            }
            // Opened for a note that is in the thread: there, flashed, and the reply to it set up.
            .onChange(of: model?.noteToShow) { _, id in
                guard let id, let model else { return }
                model.noteShown()
                Task {
                    guard await model.ensureLoaded(id), let message = model.message(id) else { return }
                    model.reply(to: message)
                    jump(to: id, pulse: true)
                }
            }
            // The words typed are searched for a moment after the last key; a blank field is no search.
            .task(id: searching ? query : nil) {
                guard searching, let model else { return }
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    model.search("")
                    currentHit = nil
                    return
                }
                try? await Task.sleep(for: .milliseconds(250))
                if !Task.isCancelled { model.search(query) }
            }
    }

    /// The bar over the messages and the composer under them, and the long-press layer over it all.
    private var screen: some View {
        ZStack(alignment: .top) {
            VStack(spacing: 0) {
                if let model { content(model) }
            }
            .accessibilityHidden(menu != nil)
            bar
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
                .accessibilityHidden(menu != nil)
            if let menu, let model {
                MessageMenuOverlay(menu: menu, ctx: context(model),
                                   items: menu.items(model: model, reply: { reply(menu.row.message) }, openLink: openLink,
                                                     copied: { say(L10n.Messages.copied) }),
                                   footer: Self.full(menu.row.message.sentAt), safe: safe) { self.menu = nil }
            }
        }
        .background(Tokens.cream)
        .onGeometryChange(for: EdgeInsets.self) { $0.safeAreaInsets } action: { safe = $0 }
    }

    /// On show: the top of its stack, on the tab chosen.
    private var visible: Bool { appeared && onSelectedTab }

    /// The thread came on show, or went out of it: listening, and reading what arrives, only while it shows.
    private func shown(_ visible: Bool) {
        guard let model else { return }
        model.setOnScreen(visible && scenePhase == .active)
        if visible { model.resume() } else { model.stop() }
    }

    private var conversationListed: Bool {
        guard let pair = model?.pairId else { return false }
        return session.conversations.conversations.contains { $0.id == pair }
    }

    // MARK: Content

    @ViewBuilder private func content(_ model: ThreadModel) -> some View {
        switch model.phase {
        case .loading:
            Color.clear
        case .missing:
            Text(L10n.Messages.userNotFound)
                .font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14).padding(.top, barHeight + 20)
            Spacer()
        case .failed:
            // Who they are couldn't be asked (offline): a retry, never "user not found".
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await model.load() }
            }
            .padding(.top, barHeight)
            Spacer()
        case .ready:
            // The messages show whoever may write: only the foot changes with it.
            ZStack(alignment: .bottom) {
                MessageList(rows: model.rows, ctx: context(model), position: $scroll, topMargin: barHeight,
                            pillVisible: !(searching && showResults) && toast == nil, underBar: $underBar)
                if searching && showResults {
                    ThreadSearchResults(model: model, query: query, topMargin: barHeight, underBar: $resultsUnderBar) { pick($0) }
                }
                if let toast {
                    ThreadPill(icon: .check, text: toast)
                        .padding(.bottom, 10)
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
            .frame(maxHeight: .infinity)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { listWidth = $0 }
            foot(model)
        }
    }

    /// Under the messages: the composer — with a quiet line over it when answering their note
    /// connects the two — or, where there is nothing to write, a calm line in its place: the wait
    /// for an answer to one's own note, or why messages can't be sent here. Nothing while that isn't known yet.
    @ViewBuilder private func foot(_ model: ThreadModel) -> some View {
        if model.accessKnown {
            switch model.access {
            case .open, .replyToConnect:
                VStack(spacing: 0) {
                    if model.access == .replyToConnect {
                        ThreadFootNote(text: L10n.Messages.replyToConnect(handle: model.displayHandle), size: 12.5)
                            .padding(.top, 10)
                    }
                    ThreadComposer(model: model, composing: $composing) { pickingCard = true }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
            case .awaitingReply:
                ThreadFootNote(text: L10n.Messages.awaitingReply)
                    .padding(.horizontal, 28)
                    .padding(.top, 14)
                    .padding(.bottom, 22)
            case .notConnected:
                VStack(spacing: 6) {
                    ThreadFootNote(text: L10n.Messages.notConnected)
                    Button(L10n.Messages.viewProfile) { openRoute(.author(model.displayHandle)) }
                        .font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta).underline().buttonStyle(.plain)
                        .frame(minHeight: 32)
                }
                .padding(.horizontal, 28)
                .padding(.top, 14)
                .padding(.bottom, 16)
            }
        }
    }

    private func context(_ model: ThreadModel) -> ThreadContext {
        // The matches are marked in the thread while it is being looked at (not under the list of them).
        let marking = searching && !showResults && !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return ThreadContext(
            model: model,
            // The row is the list's width inside its 16 margins; their face's column is not counted.
            rowMax: (listWidth - 32) * 0.72,
            highlights: marking ? Dictionary(model.searchHits.map { ($0.messageId, $0.ranges) }, uniquingKeysWith: { a, _ in a }) : [:],
            currentHit: marking ? currentHit : nil,
            flash: flash,
            frames: frames,
            lifted: menu?.row.message.key,
            // The keyboard stays where it is: the message is lifted from where it lies, and the menu keeps clear of it.
            onMenu: { self.menu = $0 },
            onReply: reply,
            onQuote: { jump(to: $0, pulse: true) },
            openLink: openLink,
            openRoute: { openRoute($0) }
        )
    }

    /// Says `text` over the composer for a moment.
    private func say(_ text: String) {
        withAnimation(.easeOut(duration: 0.16)) { toast = text }
        UIAccessibility.post(notification: .announcement, argument: text)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.4))
            guard toast == text else { return }
            withAnimation(.easeOut(duration: 0.2)) { toast = nil }
        }
    }

    /// The next message answers `message`: the field takes the keyboard.
    private func reply(_ message: ChatMessage) {
        model?.reply(to: message)
        composing = true
    }

    /// Takes the thread to a message — a quote's original, a search hit — reading older pages until
    /// it is held; a quote's original pulses once there.
    private func jump(to id: String, pulse: Bool) {
        Task {
            guard let model, await model.ensureLoaded(id), let key = model.message(id)?.key else { return }
            // A message just read in reaches the list a moment later; the list then knows its rows' real heights.
            try? await Task.sleep(for: .milliseconds(60))
            scroll.scrollTo(id: key, anchor: .center)
            try? await Task.sleep(for: .milliseconds(120))
            withAnimation(.easeInOut(duration: 0.25)) { scroll.scrollTo(id: key, anchor: .center) }
            if pulse { flash.pulse(key) }
        }
    }

    /// A match chosen in the list: the list goes, and the thread is taken to it with its words marked.
    private func pick(_ hit: SearchHit) {
        currentHit = hit.messageId
        showResults = false
        searchFocused = false
        jump(to: hit.messageId, pulse: false)
    }

    private func closeSearch() {
        searching = false
        showResults = false
        currentHit = nil
        query = ""
        searchFocused = false
        model?.endSearch()
    }

    /// Opens a link from a message: a card of this site in the app; anything else straight into the
    /// in-app browser, unless it's an IP address or a punycode name — those ask first.
    private func openLink(_ url: URL) {
        if let key = model?.cardKey(of: url) { return openRoute(.card(key)) }
        // Checked again, so only an http(s) address that passes opens.
        guard let link = ChatLinks.parse(url.absoluteString) else { return }
        if link.suspicious { linkToConfirm = link } else { InAppBrowser.open(link.url) }
    }

    // MARK: Bar

    /// The thread's bar, over the messages: back, the person (their face and pen name, a tap goes to
    /// their page) and the ⋯ — edged by the header's wavy pen line like every pushed page's, half ink
    /// at rest and full once messages scroll under it. Search takes the person's place with its field
    /// (and, once a match was chosen, "3/12" and the way through them).
    private var bar: some View {
        OrganicInlineBar("", backLabel: L10n.Messages.back, scrolled: searching && showResults ? resultsUnderBar : underBar) {
            if let model, model.phase == .ready {
                if searching {
                    ThreadSearchField(query: $query, focused: $searchFocused, position: searchPosition(model),
                                      onShowResults: { showResults = true },
                                      onOlder: { step(model, by: 1) }, onNewer: { step(model, by: -1) })
                } else if let other = model.other {
                    Button { openRoute(.author(other.handle)) } label: {
                        HStack(spacing: 10) {
                            HandDrawnAvatar(initials: other.initials, imageURL: other.avatarUrl.flatMap(URL.init(string:)), color: other.accent,
                                            size: 36, seed: other.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 3)
                            Text(other.handle).font(AppFonts.heading(18)).foregroundStyle(Tokens.text).lineLimit(1)
                                .accessibilityAddTraits(.isHeader)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(L10n.Messages.viewProfile)
                } else {
                    // Opened by uid: the pen name the link carried, until their profile arrives.
                    Text(model.displayHandle).font(AppFonts.heading(18)).foregroundStyle(Tokens.text).lineLimit(1)
                }
            }
        } trailing: {
            if let model, model.phase == .ready {
                if searching {
                    OrganicIconButton(.close, label: L10n.Messages.searchClose, size: 16, action: closeSearch)
                } else if model.conversationExists, let pair = model.pairId {
                    OrganicMenu(items: menuItems(model), label: L10n.Messages.moreMenu, seed: Double(seedFromString(pair)), triggerSize: 34, trigger: .bare)
                }
            }
        }
        .backHidden(searching)
    }

    /// Where in the matches the thread is (1 is the newest), once one was chosen and the list put away.
    private func searchPosition(_ model: ThreadModel) -> (index: Int, count: Int)? {
        guard !showResults, let currentHit, let at = model.searchHits.firstIndex(where: { $0.messageId == currentHit }) else { return nil }
        return (at + 1, model.searchHits.count)
    }

    /// To the next match older (+1) or newer (−1).
    private func step(_ model: ThreadModel, by offset: Int) {
        let hits = model.searchHits
        guard let currentHit, let at = hits.firstIndex(where: { $0.messageId == currentHit }), hits.indices.contains(at + offset) else { return }
        pick(hits[at + offset])
    }

    private func menuItems(_ model: ThreadModel) -> [OrganicMenuItem] {
        [
            OrganicMenuItem(id: "search", title: L10n.Messages.menuSearch, icon: .search) {
                searching = true
                showResults = true
                searchFocused = true
            },
            OrganicMenuItem(id: "media", title: L10n.Messages.menuMedia, icon: .cards) { showingMedia = true },
            OrganicMenuItem(id: "report", title: L10n.Safety.reportMessage, icon: .flag) { reporting = true },
            model.isBlocked
                ? OrganicMenuItem(id: "unblock", title: L10n.Safety.unblock, icon: .ban) { Task { await unblock(model) } }
                : OrganicMenuItem(id: "block", title: L10n.Safety.block, icon: .ban, danger: true) {
                    blockError = nil
                    confirmingBlock = true
                },
            OrganicMenuItem(id: "delete", title: L10n.Messages.menuDelete, icon: .trash, danger: true) { confirmingDelete = true },
        ]
    }

    private func block(_ model: ThreadModel) async {
        guard let other = model.other, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await session.safety?.block(other.id)
            confirmingBlock = false
            await model.refreshConnection()
        } catch {
            blockError = L10n.Safety.actionError
        }
    }

    private func unblock(_ model: ThreadModel) async {
        guard let other = model.other else { return }
        try? await session.safety?.unblock(other.id)
        await model.refreshConnection()
    }

    // MARK: Dialogs

    /// The thread's modals: the link confirm, what's been shared, report, block, delete, and the card picker.
    private func dialogs(_ content: some View) -> some View {
        content
            .organicConfirm(isPresented: Binding(get: { linkToConfirm != nil }, set: { if !$0 { linkToConfirm = nil } }),
                            title: L10n.Messages.linkConfirmTitle, message: L10n.Messages.linkConfirmBody(host: linkToConfirm?.host ?? ""),
                            cancelLabel: L10n.Messages.linkConfirmCancel, confirmLabel: L10n.Messages.linkConfirmOpen,
                            closeLabel: L10n.Messages.linkConfirmCancel, seed: 61) {
                if let link = linkToConfirm { InAppBrowser.open(link.url) }
                linkToConfirm = nil
            }
            .organicModal(isPresented: $showingMedia, seed: 53, maxWidth: 480, closeLabel: L10n.Safety.Report.close) {
                if let model {
                    SharedMediaContent(model: model, onClose: { showingMedia = false }) { url in
                        showingMedia = false
                        openLink(url)
                    }
                }
            }
            .organicModal(isPresented: $reporting, seed: 83, maxWidth: 460, closeLabel: L10n.Safety.Report.close, dismissible: !sendingReport) {
                if let model, let other = model.other, let pair = model.pairId {
                    ReportForm(target: .message(id: pair, senderId: other.id, conversationId: pair), handle: other.handle,
                               offerBlock: !model.isBlocked, sending: $sendingReport, onClose: { reporting = false },
                               onBlocked: { Task { await model.refreshConnection() } })
                }
            }
            .organicConfirm(isPresented: $confirmingBlock, title: L10n.Safety.blockTitle(handle: model?.other?.handle ?? ""),
                            message: L10n.Safety.blockBody, cancelLabel: L10n.Safety.cancel, confirmLabel: L10n.Safety.blockConfirm,
                            closeLabel: L10n.Safety.cancel, busy: busy, error: blockError, seed: 71) {
                if let model { Task { await block(model) } }
            }
            .organicConfirm(isPresented: $confirmingDelete, title: L10n.Messages.deleteConfirmTitle, message: L10n.Messages.deleteConfirmBody,
                            cancelLabel: L10n.Messages.deleteCancel, confirmLabel: busy ? "…" : L10n.Messages.deleteConfirm,
                            closeLabel: L10n.Messages.deleteCancel, busy: busy, destructive: true, seed: 59) {
                guard let model else { return }
                Task {
                    busy = true
                    let deleted = await model.deleteConversation()
                    busy = false
                    confirmingDelete = false
                    if deleted { dismiss() }
                }
            }
            .organicModal(isPresented: $pickingCard, seed: 53, maxWidth: 480, closeLabel: L10n.Write.Editor.CardModal.cancel) {
                CardPickerContent(title: L10n.Messages.pickCard, subtitle: L10n.Messages.pickCardSubtitle) { card in
                    model?.pendingCard = card
                    pickingCard = false
                } onCancel: { pickingCard = false }
            }
    }

    // MARK: Dates

    /// The day label: 9月29日 / September 29.
    static func day(_ date: Date, language: Strings.Language = Strings.shared.language) -> String {
        date.formatted(Date.FormatStyle(locale: locale(language)).month(.wide).day())
    }

    /// The time label inside a day: 下午 3:04 / 3:04 PM.
    static func time(_ date: Date, language: Strings.Language = Strings.shared.language) -> String {
        formatted(date, language == .zhTW ? "a h:mm" : "h:mm a", language)
    }

    /// The full time a long-press shows (the web's hover title): 9月29日 下午03:04 / September 29 at 03:04 PM.
    static func full(_ date: Date, language: Strings.Language = Strings.shared.language) -> String {
        formatted(date, language == .zhTW ? "M月d日 ahh:mm" : "MMMM d 'at' hh:mm a", language)
    }

    /// When a search result was written: the time today, the day this year, the day and year before.
    static func resultTime(_ date: Date, now: Date = .now, language: Strings.Language = Strings.shared.language) -> String {
        let calendar = Calendar.current
        if calendar.isDate(date, inSameDayAs: now) { return time(date, language: language) }
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) { return day(date, language: language) }
        return "\(calendar.component(.year, from: date)) · \(day(date, language: language))"
    }

    /// The interface language's own formats (as `Strings.locale`), not the system's.
    private static func locale(_ language: Strings.Language) -> Locale {
        Locale(identifier: language == .zhTW ? "zh-Hant-TW" : "en")
    }

    private static func formatted(_ date: Date, _ pattern: String, _ language: Strings.Language) -> String {
        let format = DateFormatter()
        format.locale = locale(language)
        format.dateFormat = pattern
        return format.string(from: date)
    }
}

/// Lives as long as the thread screen's state: SwiftUI lets go of it only when the screen is gone for
/// good (popped — not when a page is pushed over it, nor when its tab is out of sight), and it then
/// closes the model, whose reads of older pages (a search's, up to the whole history; a quote's jump)
/// would otherwise go on with nobody to show them to.
nonisolated private final class ScreenLifetime {
    var model: ThreadModel?

    deinit {
        guard let model else { return }
        Task { @MainActor in model.close() }
    }
}

/// "Cards & links": everything shared in the loaded messages.
private struct SharedMediaContent: View {
    let model: ThreadModel
    let onClose: () -> Void
    let onOpenLink: (URL) -> Void
    @Environment(\.openRoute) private var openRoute

    var body: some View {
        let shared = model.shared
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Messages.mediaTitle).padding(.bottom, 8)
            CSSText(L10n.Messages.mediaSubtitle, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.6, color: UIColor(Tokens.textMuted))
                .padding(.bottom, 18)
            let cards = shared.cards.compactMap(model.card)
            if cards.isEmpty && shared.links.isEmpty {
                Text(L10n.Messages.mediaEmpty).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if !cards.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            head(L10n.Messages.mediaCards)
                            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                                if i > 0 { WavyDivider(seed: Double(53 + i * 7)) }
                                Button { openRoute(.card(card.routeKey)) } label: {
                                    HStack(spacing: 12) {
                                        OrganicImage(url: card.imageUrl.flatMap(URL.init(string:)), seed: 7,
                                                     fill: OKLCHColor.color(0.9, 0.06, card.accentHue ?? 55))
                                            .frame(width: 40, height: 40)
                                        Text(card.title).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
                                            .lineLimit(2).multilineTextAlignment(.leading)
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.vertical, 10).padding(.horizontal, 4)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    if !shared.links.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            head(L10n.Messages.mediaLinks)
                            ForEach(Array(shared.links.enumerated()), id: \.element.url) { i, link in
                                if i > 0 { WavyDivider(seed: Double(97 + i * 11)) }
                                Button { onOpenLink(link.url) } label: {
                                    Text(link.text).font(AppFonts.body(13.5)).foregroundStyle(Tokens.terracotta).underline()
                                        .multilineTextAlignment(.leading)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, 10).padding(.horizontal, 4)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .frame(maxHeight: min(420, UIScreen.main.bounds.height * 0.55))
            .scrollIndicators(.hidden)
            // Nothing to choose here, only to look through: the way out is under the list.
            ModalCloseButton(L10n.Safety.Report.close, action: onClose)
                .padding(.top, 14)
        }
    }

    private func head(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(12, weight: .semibold)).tracking(12 * 0.06).foregroundStyle(Tokens.textMuted)
            .padding(.bottom, 4)
    }
}
