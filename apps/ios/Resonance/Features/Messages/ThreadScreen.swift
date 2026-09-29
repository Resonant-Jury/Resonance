import DesignSystem
import ResonanceKit
import SwiftUI

/// A conversation (ThreadView.tsx, phone): its own header — back, the
/// person, the ⋯ — over a pen rule; the newest 50 messages with day labels;
/// then attachments and the composer. Search replaces the header row; the
/// ⋯ holds search, what's been shared, report, block and delete.
struct ThreadScreen: View {
    let handle: String
    let note: MessagingAPI.NoteRef?
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @Environment(\.dismiss) private var dismiss
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
                case .ready:
                    thread(model)
                }
            }
        }
        .background(Tokens.cream)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if model == nil {
                let model = ThreadModel(handle: handle, noteRef: note, session: session)
                #if DEBUG
                // `-threadDraft "…"` fills the composer (screen checks; the simulator can't type into it).
                if let draft = UserDefaults.standard.string(forKey: "threadDraft") { model.draft = draft }
                #endif
                self.model = model
                await model.load()
            }
        }
        .onDisappear { model?.stop() }
    }

    @ViewBuilder private func thread(_ model: ThreadModel) -> some View {
        @Bindable var model = model
        header(model)
            .padding(.horizontal, 14)
        WavyDivider(seed: 41, lineWidth: Tokens.ink)
        if model.connected == false {
            VStack(alignment: .leading, spacing: 10) {
                Text(L10n.Messages.notConnected).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                Button(L10n.Messages.viewProfile) { openRoute(.author(handle)) }
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
                    Text(L10n.Messages.searchCount(count: model.filtered(query).count))
                        .font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                }
                headerChip(.close, size: 16, label: L10n.Messages.searchClose) {
                    searching = false
                    query = ""
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
                }
                Spacer(minLength: 0)
                if model.conversationExists, let pair = model.pairId {
                    OrganicMenu(items: menuItems(model), label: L10n.Messages.moreMenu, seed: Double(seedFromString(pair)), triggerSize: 34)
                }
            }
        }
        .frame(minHeight: 38)
        .padding(.vertical, 10)
        .organicModal(isPresented: $showingMedia, seed: 53, maxWidth: 480, closeLabel: L10n.Messages.mediaTitle) {
            SharedMediaContent(model: model)
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
                        closeLabel: L10n.Messages.deleteCancel, busy: busy, seed: 59) {
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
        let shown = model.filtered(searching ? query : "")
            .filter { !(searching && !query.trimmingCharacters(in: .whitespaces).isEmpty && $0.text.isEmpty) }
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if model.threadReady && model.messages.isEmpty {
                        quietNote(L10n.Messages.noMessagesYet)
                    } else if searching, !query.trimmingCharacters(in: .whitespaces).isEmpty, shown.isEmpty {
                        quietNote(L10n.Messages.searchCount(count: 0))
                    }
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, message in
                        if i == 0 || !Calendar.current.isDate(shown[i - 1].sentAt, inSameDayAs: message.sentAt) {
                            Text(Self.day(message.sentAt))
                                .font(AppFonts.body(11)).foregroundStyle(Tokens.textMuted)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 6).padding(.bottom, 2)
                        }
                        row(message, model: model).id(message.id)
                    }
                }
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onChange(of: model.messages.count) {
                if let last = model.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
            }
        }
    }

    private func quietNote(_ text: String) -> some View {
        Text(text).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// One message: a shared card over the bubble, on your side or theirs, at most 72% wide.
    private func row(_ message: ThreadModel.Message, model: ThreadModel) -> some View {
        let mine = message.senderId == model.me
        return HStack(spacing: 0) {
            if mine { Spacer(minLength: 0) }
            VStack(alignment: mine ? .trailing : .leading, spacing: 6) {
                if let id = message.cardRef, let card = model.cards[id] ?? nil {
                    Button { openRoute(.card(card.card.routeKey)) } label: {
                        EmbedStoryCard(title: card.card.title, author: card.anonymous ? nil : card.card.author?.value1.handle,
                                       imageURL: card.card.imageUrl.flatMap(URL.init(string:)), hue: card.card.accentHue,
                                       seed: seedFromId(card.card.id, start: 11))
                            .frame(maxWidth: 320)
                    }
                    .buttonStyle(.plain)
                }
                if !message.text.isEmpty || message.noteRef != nil {
                    MessageBubble(text: message.text, mine: mine, seed: seedFromId(message.id),
                                  quoteLabel: message.noteRef == nil ? nil : L10n.Messages.quotedNote)
                        .contextMenu {
                            Text(Self.full(message.sentAt))
                            if !message.text.isEmpty { Button(L10n.Native.copy) { UIPasteboard.general.string = message.text } }
                        }
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
                    Text(L10n.Messages.threadWith(handle: handle))
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
                OrganicButton(model.sending ? "…" : L10n.Messages.send, size: .sm) { Task { await model.send() } }
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
    @Environment(\.openRoute) private var openRoute
    @Environment(\.openURL) private var openURL

    var body: some View {
        let shared = model.shared
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Messages.mediaTitle).padding(.bottom, 8)
            CSSText(L10n.Messages.mediaSubtitle, font: AppFonts.uiFont(.body, size: 14), lineHeight: 1.6, color: UIColor(Tokens.textMuted))
                .padding(.bottom, 18)
            let cards = shared.cards.compactMap { model.cards[$0] ?? nil }
            if cards.isEmpty && shared.links.isEmpty {
                Text(L10n.Messages.mediaEmpty).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if !cards.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            head(L10n.Messages.mediaCards)
                            ForEach(Array(cards.enumerated()), id: \.element.card.id) { i, detail in
                                if i > 0 { WavyDivider(seed: Double(53 + i * 7)) }
                                Button { openRoute(.card(detail.card.routeKey)) } label: {
                                    HStack(spacing: 12) {
                                        OrganicImage(url: detail.card.imageUrl.flatMap(URL.init(string:)), seed: 7,
                                                     fill: OKLCHColor.color(0.9, 0.06, detail.card.accentHue ?? 55))
                                            .frame(width: 40, height: 40)
                                        Text(detail.card.title).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
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
                            ForEach(Array(shared.links.enumerated()), id: \.element) { i, url in
                                if i > 0 { WavyDivider(seed: Double(97 + i * 11)) }
                                Button { openURL(url) } label: {
                                    Text(url.absoluteString).font(AppFonts.body(13.5)).foregroundStyle(Tokens.terracotta).underline()
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
