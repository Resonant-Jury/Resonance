import DesignSystem
import ResonanceKit
import SwiftUI

/// A conversation (ThreadView.tsx, phone): its own header — back, the
/// person, the ⋯ — over a pen rule; the newest 50 messages with day labels;
/// then attachments and the composer. Search replaces the header row; the
/// ⋯ holds search, what's been shared, report, block and delete.
struct ThreadScreen: View {
    let handle: String
    /// The other person's uid, when the place it was opened from knew it.
    var uid: String?
    let note: MessagingAPI.NoteRef?
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: ThreadModel?
    @State private var searching = false
    @State private var query = ""
    @State private var showingMedia = false
    @State private var pickingCard = false
    @State private var reporting = false
    @State private var sendingReport = false
    @State private var confirmingBlock = false
    @State private var confirmingDelete = false
    @State private var busy = false
    /// A link to an IP address or a punycode name waits here for the reader's yes.
    @State private var linkToConfirm: ChatLinks.Parsed?
    /// The message a tap on a quote scrolled to, washed for a moment.
    @State private var flashId: String?
    @State private var blockError: String?
    @FocusState private var composing: Bool
    @FocusState private var searchFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            if let model {
                switch model.phase {
                case .loading: Color.clear
                case .missing:
                    Text(L10n.Messages.userNotFound)
                        .font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14).padding(.top, 20)
                    Spacer()
                case .failed:
                    // Who they are couldn't be asked (offline): a retry, never "user not found".
                    OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                        Task { await model.load() }
                    }
                    Spacer()
                case .ready:
                    thread(model)
                }
            }
        }
        .background(Tokens.cream)
        .organicConfirm(isPresented: Binding(get: { linkToConfirm != nil }, set: { if !$0 { linkToConfirm = nil } }),
                        title: L10n.Messages.linkConfirmTitle, message: L10n.Messages.linkConfirmBody(host: linkToConfirm?.host ?? ""),
                        cancelLabel: L10n.Messages.linkConfirmCancel, confirmLabel: L10n.Messages.linkConfirmOpen,
                        closeLabel: L10n.Messages.linkConfirmCancel, seed: 61) {
            if let link = linkToConfirm { InAppBrowser.open(link.url) }
            linkToConfirm = nil
        }
        .toolbar(.hidden, for: .navigationBar)
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
                query = search
            }
            #endif
            self.model = model
            model.setOnScreen(scenePhase == .active)
            await model.load()
        }
        // The conversation is read only while it is on show (its unread count, its pushes).
        .onAppear { model?.setOnScreen(scenePhase == .active) }
        .onDisappear {
            model?.setOnScreen(false)
            model?.stop()
        }
        // Back in the foreground: listeners that failed listen again; a thread that couldn't find its person asks again.
        .onChange(of: scenePhase) { _, phase in
            guard let model else { return }
            model.setOnScreen(phase == .active)
            guard phase == .active else { return }
            if model.phase == .failed { Task { await model.load() } } else { model.resume() }
        }
        // No conversation yet, then their first message arrives: it shows up in Messages, and here.
        .onChange(of: conversationListed) { _, listed in
            if listed { model?.resume() }
        }
    }

    private var conversationListed: Bool {
        guard let pair = model?.pairId else { return false }
        return session.conversations.conversations.contains { $0.id == pair }
    }

    @ViewBuilder private func thread(_ model: ThreadModel) -> some View {
        @Bindable var model = model
        header(model)
            .padding(.horizontal, 14)
        WavyDivider(seed: 41, lineWidth: Tokens.ink)
        if model.connected == false {
            VStack(alignment: .leading, spacing: 10) {
                Text(L10n.Messages.notConnected).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                Button(L10n.Messages.viewProfile) { openRoute(.author(model.displayHandle)) }
                    .font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta).underline().buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 20)
            .padding(.horizontal, 16)
            Spacer()
        } else {
            messages(model)
            composer(model)
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
        }
    }

    // MARK: Header

    @ViewBuilder private func header(_ model: ThreadModel) -> some View {
        HStack(spacing: 10) {
            if searching {
                OrganicIcon(.search, size: 17, color: Tokens.textMuted)
                TextField(text: $query, prompt: fieldPrompt(L10n.Messages.searchPlaceholder, size: 14)) { Text(L10n.Messages.menuSearch) }
                    .font(AppFonts.body(14))
                    .focused($searchFocused)
                    .frame(height: 38)
                if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text(L10n.Messages.searchCount(count: model.searchHits.count))
                        .font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                }
                headerChip(.close, size: 16, label: L10n.Messages.searchClose) {
                    searching = false
                    query = ""
                    model.endSearch()
                }
            } else {
                headerChip(.arrowRight, size: 16, label: L10n.Messages.back, mirrored: true) { dismiss() }
                    .padding(.leading, -6)
                if let other = model.other {
                    Button { openRoute(.author(other.handle)) } label: {
                        HStack(spacing: 10) {
                            HandDrawnAvatar(initials: other.initials, imageURL: other.avatarUrl.flatMap(URL.init(string:)), color: other.accent,
                                            size: 38, seed: other.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 3)
                            Text(other.handle).font(AppFonts.heading(18)).foregroundStyle(Tokens.text).lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(L10n.Messages.viewProfile)
                } else {
                    // Opened by uid: the pen name the link carried, until their profile arrives.
                    Text(model.displayHandle).font(AppFonts.heading(18)).foregroundStyle(Tokens.text).lineLimit(1)
                }
                Spacer(minLength: 0)
                if model.conversationExists, let pair = model.pairId {
                    OrganicMenu(items: menuItems(model), label: L10n.Messages.moreMenu, seed: Double(seedFromString(pair)), triggerSize: 34, trigger: .bare)
                }
            }
        }
        .frame(minHeight: 38)
        .padding(.vertical, 10)
        // The words typed are searched for a moment after the last key.
        .task(id: searching ? query : nil) {
            guard searching else { return }
            try? await Task.sleep(for: .milliseconds(250))
            if !Task.isCancelled { model.search(query) }
        }
        .organicModal(isPresented: $showingMedia, seed: 53, maxWidth: 480, closeLabel: L10n.Messages.mediaTitle) {
            SharedMediaContent(model: model) { link in
                showingMedia = false
                openLink(link)
            }
        }
        .organicModal(isPresented: $reporting, seed: 83, maxWidth: 460, closeLabel: L10n.Safety.Report.close, dismissible: !sendingReport) {
            if let other = model.other, let pair = model.pairId {
                ReportForm(target: .message(id: pair, senderId: other.id, conversationId: pair), handle: other.handle,
                           offerBlock: !model.isBlocked, sending: $sendingReport, onClose: { reporting = false },
                           onBlocked: { Task { await model.refreshConnection() } })
            }
        }
        .organicConfirm(isPresented: $confirmingBlock, title: L10n.Safety.blockTitle(handle: model.other?.handle ?? ""),
                        message: L10n.Safety.blockBody, cancelLabel: L10n.Safety.cancel, confirmLabel: L10n.Safety.blockConfirm,
                        closeLabel: L10n.Safety.cancel, busy: busy, error: blockError, seed: 71) {
            Task { await block(model) }
        }
        .organicConfirm(isPresented: $confirmingDelete, title: L10n.Messages.deleteConfirmTitle, message: L10n.Messages.deleteConfirmBody,
                        cancelLabel: L10n.Messages.deleteCancel, confirmLabel: busy ? "…" : L10n.Messages.deleteConfirm,
                        closeLabel: L10n.Messages.deleteCancel, busy: busy, destructive: true, seed: 59) {
            Task {
                busy = true
                let deleted = await model.deleteConversation()
                busy = false
                confirmingDelete = false
                if deleted { dismiss() }
            }
        }
    }

    /// The thread header's small square buttons (34, corners 11/13/12/14).
    private func headerChip(_ icon: IconName, size: CGFloat, label: String, mirrored: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            OrganicIcon(icon, size: size, color: Tokens.text)
                .scaleEffect(x: mirrored ? -1 : 1)
                .offset(y: mirrored ? 1 : 0)
                .frame(width: 34, height: 34)
                .contentShape(UnevenRoundedRectangle(topLeadingRadius: 11, bottomLeadingRadius: 14, bottomTrailingRadius: 12, topTrailingRadius: 13))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// Opens a link from a message: straight into the in-app browser, unless it's an
    /// IP address or a punycode name — those ask first.
    private func openLink(_ link: ChatLinks.Parsed) {
        if link.suspicious { linkToConfirm = link } else { InAppBrowser.open(link.url) }
    }

    /// A tap in a bubble's text: checked again, so only an http(s) address that passes opens.
    private func openLink(_ url: URL) {
        guard let link = ChatLinks.parse(url.absoluteString) else { return }
        openLink(link)
    }

    private func menuItems(_ model: ThreadModel) -> [OrganicMenuItem] {
        [
            OrganicMenuItem(id: "search", title: L10n.Messages.menuSearch, icon: .search) {
                searching = true
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

    // MARK: Messages

    private func messages(_ model: ThreadModel) -> some View {
        let searched = searching && !query.trimmingCharacters(in: .whitespaces).isEmpty
        let hits = Set(model.searchHits.map(\.messageId))
        let shown = searched ? model.rows.filter { hits.contains($0.message.id) } : model.rows
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if model.threadReady && model.messages.isEmpty {
                        // Not "no messages yet" when they couldn't be read.
                        quietNote(model.listenFailed ? L10n.Native.loadError : L10n.Messages.noMessagesYet)
                    } else if searched, shown.isEmpty {
                        quietNote(model.searchLoading ? L10n.Messages.searchSearching : L10n.Messages.searchCount(count: 0))
                    }
                    if !searched, model.hasOlder || model.loadingOlder || model.olderError {
                        // Scrolled up to the oldest message held: the page before it is read.
                        Text(model.olderError ? L10n.Messages.loadOlderError : L10n.Messages.loadingOlder)
                            .font(AppFonts.body(11.5)).foregroundStyle(Tokens.textMuted)
                            .frame(maxWidth: .infinity)
                            .onAppear { model.loadOlder() }
                            .onTapGesture { model.loadOlder() }
                    }
                    ForEach(shown) { row in
                        if row.dayLabel || searched {
                            Text(Self.day(row.message.sentAt))
                                .font(AppFonts.body(11)).foregroundStyle(Tokens.textMuted)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 6).padding(.bottom, 2)
                        }
                        self.row(row.message, model: model, jump: { id in jump(to: id, proxy: proxy, in: model) }).id(row.id)
                    }
                }
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            // Opens at the newest and follows new messages, but a short thread
            // starts at the top like the web's (no bottom alignment).
            .defaultScrollAnchor(.bottom, for: .initialOffset)
            .defaultScrollAnchor(.bottom, for: .sizeChanges)
            .onChange(of: model.messages.last?.key) {
                if let last = model.messages.last { proxy.scrollTo(last.key, anchor: .bottom) }
            }
        }
    }

    /// A tap on a reply's quote: older pages are read until the original is held; then it is scrolled to and washed for a moment.
    private func jump(to id: String, proxy: ScrollViewProxy, in model: ThreadModel) {
        Task {
            guard await model.ensureLoaded(id), let key = model.message(id)?.key else { return }
            withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(key, anchor: .center) }
            flashId = key
            try? await Task.sleep(for: .milliseconds(150))
            withAnimation(.easeOut(duration: 0.9)) { flashId = nil }
        }
    }

    private func quietNote(_ text: String) -> some View {
        Text(text).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// One message: a shared card over the bubble, on your side or theirs, at most 72% wide.
    private func row(_ message: ChatMessage, model: ThreadModel, jump: @escaping (String) -> Void) -> some View {
        let mine = model.isMine(message)
        return HStack(spacing: 0) {
            if mine { Spacer(minLength: 0) }
            VStack(alignment: mine ? .trailing : .leading, spacing: 6) {
                if let quote = message.replyTo, let viewer = model.me {
                    ReplyQuoteView(quote: quote, mine: mine, viewerId: viewer, otherHandle: model.displayHandle,
                                   canJump: true) { jump(quote.id) }
                }
                if let id = message.cardRef, let card = model.card(id) {
                    Button { openRoute(.card(card.routeKey)) } label: {
                        EmbedStoryCard(title: card.title, author: card.anonymous ? nil : card.author?.value1.handle,
                                       imageURL: card.imageUrl.flatMap(URL.init(string:)), hue: card.accentHue,
                                       seed: seedFromId(card.id, start: 11))
                            .frame(maxWidth: 320)
                    }
                    .buttonStyle(.plain)
                }
                if !message.text.isEmpty || message.noteRef != nil {
                    MessageBubble(text: message.text, mine: mine, seed: seedFromId(message.key),
                                  quoteLabel: message.noteRef == nil ? nil : L10n.Messages.quotedNote,
                                  links: ChatLinks.links(in: message.text).map { MessageLinkRange(range: $0.range, url: $0.url) },
                                  onOpenURL: { openLink($0) })
                        .overlay {
                            // The wash of a bubble a tap on a quote scrolled to.
                            MessageBubbleShape(seed: seedFromId(message.key))
                                .fill(Tokens.terracotta.opacity(0.22))
                                .opacity(flashId == message.key ? 1 : 0)
                                .allowsHitTesting(false)
                        }
                        .opacity(message.delivery == .failed ? 0.6 : 1)
                        .contextMenu {
                            Text(Self.full(message.sentAt))
                            if message.canReply { Button(L10n.Messages.reply) { model.reply(to: message) } }
                            if !message.text.isEmpty { Button(L10n.Native.copy) { UIPasteboard.general.string = message.text } }
                            if message.delivery == .failed {
                                Button(L10n.Messages.retry) { model.retry(message.key) }
                                Button(L10n.Messages.discardFailed, role: .destructive) { model.discard(message.key) }
                            }
                        }
                        .zIndex(1)
                }
                if let preview = message.preview {
                    LinkPreviewCard(preview: preview) { openLink($0) }
                }
                if message.delivery == .failed {
                    // Not sent: a tap sends it again, under the same id.
                    Button { model.retry(message.key) } label: {
                        Text(L10n.Messages.sendFailed).font(AppFonts.body(11.5)).foregroundStyle(Tokens.terracotta)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: UIScreen.main.bounds.width * 0.72, alignment: mine ? .trailing : .leading)
            if !mine { Spacer(minLength: 0) }
        }
    }

    // MARK: Composer

    @ViewBuilder private func composer(_ model: ThreadModel) -> some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 0) {
            if let quote = model.replyingTo {
                HStack(spacing: 8) {
                    Text(quote.senderId == model.me ? L10n.Messages.replyingToSelf : L10n.Messages.replyingTo(handle: model.displayHandle))
                        .font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.text)
                    Text(quote.text.isEmpty ? L10n.Messages.replyCard : quote.text)
                        .font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                    Spacer(minLength: 0)
                    Button { model.cancelReply() } label: { OrganicIcon(.close, size: 13, color: Tokens.textMuted).padding(4) }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L10n.Messages.replyCancel)
                }
                .padding(.top, 10)
                .padding(.horizontal, 2)
            }
            if model.noteRef != nil || model.pendingCard != nil {
                FlowRow(spacing: 8) {
                    if model.noteRef != nil {
                        AttachmentChip(icon: .note, title: L10n.Messages.quotedNote) { model.noteRef = nil }
                    }
                    if let card = model.pendingCard {
                        AttachmentChip(icon: .cards, title: card.title) { model.pendingCard = nil }
                    }
                }
                .padding(.top, 10)
                .padding(.horizontal, 2)
            }
            HStack(alignment: .center, spacing: 10) {
                Button { pickingCard = true } label: {
                    OrganicIcon(.cards, size: 18, color: Tokens.textMuted)
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.Messages.attachCard)
                TextField(text: $model.draft, prompt: fieldPrompt(L10n.Messages.placeholder), axis: .vertical) {
                    Text(L10n.Messages.threadWith(handle: model.displayHandle))
                }
                .lineLimit(1...5)
                .lineSpacing(15 * 0.6)
                .font(AppFonts.body(15))
                .foregroundStyle(Tokens.text)
                .focused($composing)
                .padding(.horizontal, Tokens.fieldPadX)
                .padding(.vertical, Tokens.fieldPadY)
                .modifier(FieldSurface(seed: 17, focused: composing))
                .onChange(of: model.draft) { _, new in
                    if new.utf16.count > 2000 { model.draft = String(new.utf16.prefix(2000)) ?? new }
                }
                OrganicButton(L10n.Messages.send, variant: .solid, size: .sm) { model.send() }
                    .fillingHeight()
                    .opacity(model.canSend ? 1 : 0.5)
                    .allowsHitTesting(model.canSend)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 12)
            if let error = model.error {
                Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta).padding(.top, 6)
            }
        }
        .organicModal(isPresented: $pickingCard, seed: 53, maxWidth: 480, closeLabel: L10n.Write.Editor.CardModal.cancel) {
            CardPickerContent(title: L10n.Messages.pickCard, subtitle: L10n.Messages.pickCardSubtitle) { card in
                model.pendingCard = card
                pickingCard = false
            } onCancel: { pickingCard = false }
        }
    }

    // MARK: Dates

    /// The day label: 9月29日 / September 29.
    static func day(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(locale: Strings.shared.locale).month(.wide).day())
    }

    /// The full time a long-press shows (the web's hover title).
    static func full(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(locale: Strings.shared.locale).month(.wide).day().hour().minute())
    }
}

/// A pending attachment above the composer: its glyph, its name, and a ✕.
private struct AttachmentChip: View {
    let icon: IconName
    let title: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            OrganicIcon(icon, size: 14, color: Tokens.text)
            Text(title).font(AppFonts.body(12)).foregroundStyle(Tokens.text).lineLimit(1).frame(maxWidth: 180, alignment: .leading)
                .fixedSize(horizontal: true, vertical: false)
            Button(action: onRemove) {
                OrganicIcon(.close, size: 13, color: Tokens.textMuted).padding(2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.Messages.removeCard)
        }
        .padding(.leading, 10).padding(.trailing, 8).padding(.vertical, 5)
        .background(Tokens.terracottaLight.opacity(0.4),
                    in: UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 14, bottomTrailingRadius: 12, topTrailingRadius: 14))
    }
}

/// "Cards & links": everything shared in the loaded messages.
private struct SharedMediaContent: View {
    let model: ThreadModel
    let onOpenLink: (ChatLinks.Parsed) -> Void
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
                                Button { onOpenLink(.init(url: link.url, host: link.host, suspicious: link.suspicious)) } label: {
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
        }
    }

    private func head(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(12, weight: .semibold)).tracking(12 * 0.06).foregroundStyle(Tokens.textMuted)
            .padding(.bottom, 4)
    }
}
