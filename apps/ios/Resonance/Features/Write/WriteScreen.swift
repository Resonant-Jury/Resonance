import DesignSystem
import PhotosUI
import ResonanceKit
import SwiftUI

/// Writing a card (the web's write page on a phone): the one-line title, the
/// story in the editor island under the web's text toolbar, tags in one field
/// (typed, or suggested by the model), the cover photo, then Publish (through
/// the publish panel) or leave with the draft saved. Drafts save themselves a moment after typing stops.
/// Opened on one of your cards (write/[id]) it resumes a draft, or revises a
/// published card: then Save changes / Discard changes.
/// A page on the tab's stack like the others: the bar's arrow (or the edge
/// swipe) goes back, asking first when there is writing to put away.
struct WriteScreen: View {
    let request: WriteLauncher.Request
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openRoute) private var openRoute
    /// The writer takes the whole window; from 1200 across, the thought map beside it (design §12).
    @Environment(\.window) private var window
    @State private var model: WriteModel?
    @State private var scrolled = false
    /// The "leave for now?" question is open.
    @State private var leaving = false
    /// Opening a card that is missing or not yours.
    @State private var notFound = false
    /// The first-card guide (ux §5): a brand-new writer's fresh card only.
    @State private var showGuide = false
    @State private var publishing = false
    /// The panel is publishing or saving: it can't be closed meanwhile (the web's pending gate).
    @State private var panelBusy = false
    /// The anonymous-publishing hint, for this writer's first few visits (counted per visit, as the web).
    @State private var showsAnonymousHint = false
    /// Discarding a revision (the buttons wait meanwhile).
    @State private var discarding = false
    @State private var actionError: String?
    @State private var pickingCard = false
    @State private var coverItem: PhotosPickerItem?
    @State private var inlineItem: PhotosPickerItem?
    @State private var pickingInline = false

    var body: some View {
        Group {
            if let model {
                form(model)
            } else if notFound {
                missing
            } else {
                // The card loads straight from Firestore, painting a loader meanwhile (the editor loads behind it).
                SketchLoader()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .padding(.top, 120)
            }
        }
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            // The title is the one a visit has once the card is known; a new card's is known at once.
            OrganicInlineBar(model?.title ?? (request.cardId == nil ? L10n.Write.title : ""), backLabel: L10n.App.Nav.back,
                             scrolled: scrolled)
                .onBack { if let model { goBack(model) } else { dismiss() } }
        }
        .toolbar(.hidden, for: .navigationBar)
        // Leaving the app saves what is written now, not 1.5s later (the web's visibilitychange flush).
        .onChange(of: scenePhase) { _, phase in
            if phase != .active, let model { model.store() }
        }
        .task {
            if model == nil {
                // The editor's page starts loading now, beside the card's read rather than after it.
                let editor = StoryEditorBridge(placeholder: L10n.Write.storyPlaceholder)
                var opened: DraftService.OpenedCard?
                if let cardId = request.cardId {
                    opened = try? await session.drafts?.open(cardId)
                    guard opened != nil else {
                        notFound = true
                        return
                    }
                }
                let model = WriteModel(drafts: session.drafts, writing: session.writing, referenceCardId: request.referenceCardId,
                                       opened: opened, editor: editor)
                #if DEBUG
                // `-writeTitle "…" -writeStory "…" -writeCover <url>` fill a new card (screen checks; the simulator can't type into it).
                let defaults = UserDefaults.standard
                if let title = defaults.string(forKey: "writeTitle") { model.values.title = title }
                if let cover = defaults.string(forKey: "writeCover").flatMap(URL.init(string:)) { model.values.imageURL = cover }
                if let story = defaults.string(forKey: "writeStory") {
                    model.editor.setMarkdown(story)
                    model.values.story = story
                }
                #endif
                if let story = request.story {
                    model.editor.setMarkdown(story)
                    model.values.story = story
                }
                self.model = model
                // The first-card guide is for a brand-new writer's fresh card: asked beside the open page, never
                // before it (a read stuck on the network once held the loader ~40s), and only while nothing is written.
                if request.cardId == nil, request.referenceCardId == nil, let drafts = session.drafts {
                    let newcomer = await firstAnswer(within: Self.guideWait) { await !drafts.hasAnyCards() } ?? false
                    if newcomer, !model.holdsWriting { withAnimation(.easeOut(duration: 0.2)) { showGuide = true } }
                }
                showsAnonymousHint = await session.hints?.claim("anonymous-publish") ?? false
            }
        }
    }

    /// The editor, alone in a centred writing column — or, on a window 1200 across or more, beside the
    /// thought map: the map on the left, the editor's half on the right past a hairline that begins
    /// at the bar's pen line.
    private func form(_ model: WriteModel) -> some View {
        HStack(spacing: 0) {
            if window.writerSplit {
                ThoughtMapScreen(embedded: true)
                    .frame(maxWidth: .infinity)
                Rectangle().fill(Tokens.fieldBorder).frame(width: 1).accessibilityHidden(true)
            }
            editor(model)
                .frame(width: window.writerSplit ? window.width * 0.5 : nil)
        }
    }

    private func editor(_ model: WriteModel) -> some View {
        @Bindable var model = model
        return ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                saveStatus(model)
                if showGuide {
                    FirstCardGuide { question in
                        // Seeded into the story as a quote to write against; the guide steps aside.
                        model.seed(story: "> \(question)\n\n")
                        withAnimation(.easeOut(duration: 0.2)) { showGuide = false }
                    }
                }
                OrganicTextArea(L10n.Write.coreLabel, text: $model.values.title, placeholder: L10n.Write.corePlaceholder,
                                maxLength: WriteModel.titleMax, display: true, curve: 0.8)
                VStack(alignment: .leading, spacing: 10) {
                    label(L10n.Write.storyLabel)
                    StoryEditorField(bridge: model.editor, onInsertCard: { pickingCard = true },
                                     onInsertImage: { pickingInline = true }, uploadingImage: model.uploadingInline)
                }
                tags(model)
                cover(model)
                actions(model)
            }
            .padding(.horizontal, window.layoutClass == .compact ? 20 : window.pad)
            .padding(.top, 16)
            .padding(.bottom, 48)
            // Wider than a phone, the web's writing measure (680 and the page's pads), centred.
            .frame(maxWidth: window.layoutClass == .compact ? .infinity : Tokens.measure + 2 * window.pad)
            .frame(maxWidth: .infinity)
        }
        .onHeaderScroll($scrolled)
        .scrollDismissesKeyboard(.interactively)
        // The edge swipe asks what the arrow asks while there is writing to put away, and a draft
        // cleared since its last save still goes through leaving, which saves it.
        .takesSwipeBack(while: { model.holdsWriting || model.needsSave }) { goBack(model) }
        .photosPicker(isPresented: $pickingInline, selection: $inlineItem, matching: .images)
        .onChange(of: inlineItem) { _, item in
            guard let item else { return }
            inlineItem = nil
            Task { if let image = await Self.load(item) { await model.insertImage(image, filename: "photo.jpg") } }
        }
        .onChange(of: coverItem) { _, item in
            guard let item else { return }
            coverItem = nil
            Task { if let image = await Self.load(item) { await model.setCover(image, filename: "cover.jpg") } }
        }
        .organicModal(isPresented: $pickingCard, seed: 53, maxWidth: 480, closeLabel: L10n.Write.Editor.CardModal.cancel) {
            CardPickerContent(title: L10n.Write.Editor.CardModal.title, subtitle: L10n.Write.Editor.CardModal.subtitle) { card in
                pickingCard = false
                model.editor.exec("insertCard", ["href": "/card/\(card.routeKey)", "title": card.title])
            } onCancel: { pickingCard = false }
        }
        .organicModal(isPresented: $publishing, seed: 29, maxWidth: 480, closeLabel: L10n.Write.PublishPanel.cancel,
                      dismissible: !panelBusy) {
            PublishPanel(model: model, pending: $panelBusy, showsAnonymousHint: showsAnonymousHint) { routeKey in
                publishing = false
                Task {
                    await finish(card: routeKey, change: model.change ?? .init(cardId: model.draftId, referenceCardId: model.referenceCardId),
                                 afterDialog: true)
                }
            } onCancel: { publishing = false }
        }
        .organicConfirm(isPresented: $leaving, title: L10n.Write.leaveTitle,
                        message: model.isPublished ? L10n.Write.leaveBodyRevision : L10n.Write.leaveBody,
                        cancelLabel: L10n.Write.leaveStay, confirmLabel: L10n.Write.leaveConfirm, closeLabel: L10n.Write.leaveStay,
                        seed: 61) {
            leaving = false
            Task { await leave(model, afterDialog: true) }
        }
    }

    /// What the page header carried under its title: the save state, in plain words.
    /// An unsaved draft has nothing to say, so the line isn't there until its first save.
    @ViewBuilder
    private func saveStatus(_ model: WriteModel) -> some View {
        if let status = model.saveStatus {
            Text(status)
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.textMuted)
                .contentTransition(.opacity)
        }
    }

    /// Back (the arrow, the edge swipe): with writing to put away, the question first; otherwise at once.
    private func goBack(_ model: WriteModel) {
        if model.holdsWriting {
            leaving = true
        } else {
            Task { await leave(model) }
        }
    }

    /// Leaving keeps what's written: the draft is handed to Firestore on the way out — kept on the
    /// device at once, sent when the network lets it — and the page waits a moment for the server's
    /// yes, never longer (a write stuck behind a dead connection once held it for minutes).
    /// `afterDialog` lets the question's cover finish going down before the page does.
    private func leave(_ model: WriteModel, afterDialog: Bool = false) async {
        let settle = Task { if afterDialog { try? await Task.sleep(for: Self.dialogSettle) } }
        model.store()
        _ = await model.settled(within: Self.leaveWait)
        writer.leave(model.change)
        await settle.value
        dismiss()
    }

    /// How long leaving waits for the server to confirm the draft.
    static let leaveWait: Duration = .seconds(2)
    /// How long the first-card guide waits to learn whether this is a first card.
    static let guideWait: Duration = .seconds(3)

    /// The card went out (published, revised, or its revision dropped): its page takes the writer's
    /// place as the web goes to it, unless the card's own page is underneath.
    private func finish(card key: String, change: WriteLauncher.Change, afterDialog: Bool = false) async {
        writer.leave(change)
        if afterDialog { try? await Task.sleep(for: Self.dialogSettle) }
        if request.showsCard { openRoute.replacingTop(with: .card(key)) } else { dismiss() }
    }

    /// A dialog's fade (0.16s) and the cover it rides on.
    private static let dialogSettle: Duration = .milliseconds(240)

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
            .tracking(Tokens.labelSize * 0.06)
            .foregroundStyle(Tokens.textMuted)
    }

    /// Tags (CardEditor's TagField): one field holding the chosen tags, the input
    /// and its one action (AI suggestions, or Add once something is typed), and
    /// under it a muted line on how — the error in its place when there is one.
    private func tags(_ model: WriteModel) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: 10) {
            label(L10n.Write.tagsLabel)
            VStack(alignment: .leading, spacing: 6) {
                TagField(tags: model.values.tags, draft: $model.tagDraft, placeholder: L10n.Write.tagsPlaceholder,
                         suggesting: model.suggestingTags, onRemove: model.removeTag, onAdd: model.addTag,
                         onSuggest: { Task { await model.suggestTags() } })
                    .onChange(of: model.tagDraft) { _, text in model.typedTag(text) }
                Text(model.tagError ?? L10n.Write.tagsHelp)
                    .font(AppFonts.body(Tokens.hintSize))
                    .foregroundStyle(model.tagError == nil ? Tokens.textMuted : Tokens.terracotta)
            }
        }
    }

    /// The cover: the picked or drawn picture in its frame (✕ removes it); an
    /// illustration's preview, blurred, while it renders; the loader while a
    /// photo goes up; otherwise the split surface — upload on the left,
    /// illustrate from the story on the right, a pen rule between.
    private func cover(_ model: WriteModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            label(L10n.Write.mediaLabel)
            if let url = model.values.imageURL {
                HandDrawnImage(.url(url), removeLabel: L10n.Write.mediaRemove) { model.removeCover() }
            } else if let preview = model.partialPreview {
                HandDrawnImage(.image(preview), blur: 14, wash: Tokens.cream.opacity(0.45)) {
                    VStack(spacing: 6) {
                        SketchLoader(size: 64)
                        Text(L10n.Write.mediaGenerating).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
                    }
                }
            } else if model.mediaBusy {
                VStack(spacing: 6) {
                    SketchLoader(size: 64)
                    Text(model.generating ? L10n.Write.mediaGenerating : L10n.Write.mediaUploading)
                        .font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.textMuted)
                }
                .padding(.vertical, 22)
                .frame(maxWidth: .infinity)
                .modifier(MediaFrame(busy: true))
            } else {
                HStack(spacing: 0) {
                    PhotosPicker(selection: $coverItem, matching: .images) {
                        MediaHalf(icon: .image, title: L10n.Write.mediaPlaceholder, hint: L10n.Write.mediaHint)
                    }
                    .buttonStyle(.plain)
                    OrganicVerticalRule(lineWidth: Tokens.ink)
                    Button { Task { await model.generateCover() } } label: {
                        MediaHalf(icon: .sparkle, title: L10n.Write.mediaGenerate,
                                  hint: model.canGenerate ? L10n.Write.mediaGenerateHint : L10n.Write.mediaGenerateNeedStory)
                    }
                    .buttonStyle(.plain)
                    .disabled(!model.canGenerate)
                    .opacity(model.canGenerate ? 1 : 0.55)
                }
                .fixedSize(horizontal: false, vertical: true)
                .modifier(MediaFrame())
            }
            if let error = model.mediaError {
                Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta).padding(.top, -4)
            }
        }
    }

    /// Everything autosaves; these are only about intent. A draft: publish it,
    /// or step away. A live card: put the revision in front of readers, or drop it.
    /// On a phone one centred column of two pills of one size: the verb across the
    /// width, the tonal way out (Save draft and leave / Discard changes) as wide on its
    /// own row under it, the error centred under both; a wider layout keeps them in a row.
    private func actions(_ model: WriteModel) -> some View {
        let compact = window.layoutClass == .compact
        return VStack(alignment: compact ? .center : .leading, spacing: compact ? 4 : 8) {
            Group {
                if compact {
                    VStack(spacing: 10) {
                        primaryAction(model, fillsWidth: true)
                        secondaryAction(model, fillsWidth: true)
                    }
                } else {
                    FlowRow(spacing: 12) {
                        primaryAction(model)
                        secondaryAction(model)
                    }
                }
            }
            // Discarding: that button is at work, and the row waits on it.
            .allowsHitTesting(!discarding)
            if let actionError {
                Text(actionError)
                    .font(AppFonts.body(12))
                    .foregroundStyle(Tokens.terracotta)
                    .multilineTextAlignment(compact ? .center : .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: compact ? .center : .leading)
        .padding(.top, 6)
    }

    private func primaryAction(_ model: WriteModel, fillsWidth: Bool = false) -> some View {
        OrganicButton(model.isPublished ? L10n.Write.saveChanges : L10n.Write.publish) {
            actionError = nil
            publishing = true
        }
        .fillingWidth(fillsWidth)
        .disabled(discarding)
    }

    @ViewBuilder
    private func secondaryAction(_ model: WriteModel, fillsWidth: Bool = false) -> some View {
        if !model.isPublished {
            OrganicButton(L10n.Write.saveDraftAndLeave, variant: .tonal) { Task { await leave(model) } }
                .fillingWidth(fillsWidth)
        } else if model.hasPendingEdit {
            OrganicButton(L10n.Write.discardChanges, variant: .tonal) { Task { await discard(model) } }
                .fillingWidth(fillsWidth)
                .loading(discarding)
        }
    }

    private func discard(_ model: WriteModel) async {
        guard !discarding else { return }
        discarding = true
        actionError = nil
        defer { discarding = false }
        do {
            let key = try await model.discardEdit()
            await finish(card: key, change: model.change ?? .init(cardId: model.draftId))
        } catch {
            actionError = L10n.Native.saveError
        }
    }

    /// The card isn't there (deleted) or isn't yours: the card page's own not-found — its heading,
    /// then Back as the tonal pill (every button has a fill; a bare terracotta word didn't read as one).
    private var missing: some View {
        OrganicEmptyState(title: L10n.Card.NotFound.title, titleSize: 24, actionTitle: L10n.Card.NotFound.back,
                          actionStyle: .link) { dismiss() }
            .padding(.top, 56)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private static func load(_ item: PhotosPickerItem) async -> UIImage? {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        return UIImage(data: data)
    }
}

/// The publish panel (PublishPanel.tsx): the insight echo, who can see it,
/// publishing anonymously with the card head it will get, then Publish. For a
/// published card's revision ('update' mode) the echo gives way to a plain
/// line about what the button does, and it saves the changes instead.
private struct PublishPanel: View {
    let model: WriteModel
    @Binding var pending: Bool
    let showsAnonymousHint: Bool
    let onPublished: (String) -> Void
    let onCancel: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var visibility = "public"
    @State private var anonymous = false
    @State private var insight: String?
    @State private var insightLoading = false
    @State private var error: String?

    var body: some View {
        let updating = model.isPublished
        VStack(alignment: .leading, spacing: 18) {
            ModalTitle(updating ? L10n.Write.PublishPanel.updateTitle : L10n.Write.PublishPanel.title)
            if updating {
                CSSText(L10n.Write.PublishPanel.updateHint, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.7,
                        color: UIColor(Tokens.textMuted))
            }
            // The echo eases into the room its words take, rather than pushing the controls under a finger.
            Group {
                if insightLoading {
                    HStack(spacing: 10) {
                        SketchLoader(size: 28)
                        Text(L10n.Write.PublishPanel.insightLoading).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                    }
                    .transition(.opacity)
                } else if let insight, !insight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    HStack(alignment: .top, spacing: 10) {
                        OrganicIcon(.sparkle, size: 16, color: Tokens.terracotta).padding(.top, 2)
                        Text(L10n.Write.PublishPanel.insight(coreInsight: insight)).font(AppFonts.body(14)).foregroundStyle(Tokens.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.25), value: insightLoading)
            VStack(alignment: .leading, spacing: 10) {
                Text(L10n.Write.Visibility.label.uppercased())
                    .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
                    .tracking(Tokens.labelSize * 0.06)
                    .foregroundStyle(Tokens.textMuted)
                // A segmented choice with no pen line (its options are buttons): a quiet paper-dark track
                // shows the control's extent, the chosen side wears the tonal peach with the deep label.
                SegmentedActionBar([
                    visibilityOption("public", L10n.Write.Visibility.`public`, icon: .globe),
                    visibilityOption("private", L10n.Write.Visibility.`private`, icon: .lock),
                ], fill: Tokens.creamDark)
            }
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    Text(L10n.Write.PublishPanel.anonymousToggle).font(AppFonts.body(14)).foregroundStyle(Tokens.text)
                    Spacer(minLength: 0)
                    OrganicToggle(isOn: $anonymous, label: L10n.Write.PublishPanel.anonymousToggle, seed: 57)
                }
                // Seeing is understanding: the exact card head the world will get.
                HStack(spacing: 10) {
                    if anonymous {
                        HandDrawnAvatar(initials: "·", color: Tokens.creamDark, size: 34, seed: 97)
                    } else if let me = session.me {
                        HandDrawnAvatar(initials: me.initials, imageURL: me.avatarUrl.flatMap(URL.init(string:)),
                                        color: OKLCHColor.parse(me.accentColor) ?? Tokens.terracottaLight, size: 34, seed: 7)
                    }
                    Text(anonymous ? L10n.Write.PublishPanel.anonymousName : session.me?.handle ?? "")
                        .font(AppFonts.body(14, weight: .semibold))
                        .foregroundStyle(anonymous ? Tokens.textMuted : Tokens.text)
                }
                // Under the switch, never above it (the switch stays under the finger): why an anonymous
                // card has no other audience, in the place the first visits' hint holds — both are laid
                // out, the one not meant shown clear, so turning it on moves nothing.
                ZStack(alignment: .topLeading) {
                    if showsAnonymousHint {
                        hint(L10n.Write.PublishPanel.anonymousHint).opacity(anonymous ? 0 : 1)
                    }
                    if anonymous || showsAnonymousHint {
                        hint(L10n.Write.PublishPanel.anonymousVisibility).opacity(anonymous ? 1 : 0)
                    }
                }
                .animation(.easeOut(duration: 0.2), value: anonymous)
            }
            WavyDivider(seed: 47)
            // The foot every dialog shares: right-aligned, 再想想 the tonal way out, the verb solid and rightmost;
            // why the last try failed right above it.
            VStack(alignment: .leading, spacing: 12) {
                if let error { ModalError(error) }
                ModalActions(busy: pending) {
                    OrganicButton(L10n.Write.PublishPanel.cancel, variant: .tonal, size: .sm, action: onCancel)
                } verb: {
                    OrganicButton(updating ? L10n.Write.PublishPanel.update : L10n.Write.PublishPanel.publish,
                                  variant: .solid, size: .sm) {
                        Task { await publish() }
                    }
                }
            }
        }
        // Anonymous is public or yours alone: a card for connections turns public as it goes anonymous.
        .onChange(of: anonymous) { _, on in visibility = WriteModel.visibility(visibility, anonymous: on) }
        .task {
            // As it is: a connections card shows neither row picked, and keeps its audience unless one is
            // (or it is anonymous, which no connections card may be).
            visibility = WriteModel.visibility(model.values.visibility, anonymous: model.values.anonymous)
            anonymous = model.values.anonymous
            // The mirror moment is for a first publication only.
            guard !model.isPublished else { return }
            insightLoading = true
            insight = try? await session.writing.insight(title: model.values.title, story: model.values.story)
            insightLoading = false
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(AppFonts.body(Tokens.hintSize)).foregroundStyle(Tokens.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func visibilityOption(_ value: String, _ label: String, icon: IconName) -> SegmentSpec {
        let chosen = visibility == value
        // The other side's ink stays deep enough to read on the track.
        return SegmentSpec(id: value, icon: icon, label: label,
                           fill: chosen ? Tokens.buttonTonal : nil,
                           ink: chosen ? Tokens.buttonOnTonal : Tokens.segmentIdleInk,
                           pressInk: .black.opacity(0.05), selected: chosen) {
            visibility = value
        }
    }

    private func publish() async {
        // The server refuses a card without a title; say so in the writer's words.
        guard !model.values.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = L10n.Write.titleRequired
            return
        }
        pending = true
        error = nil
        let updating = model.isPublished
        do {
            onPublished(updating
                        ? try await model.applyEdit(visibility: visibility, anonymous: anonymous)
                        : try await model.publish(visibility: visibility, anonymous: anonymous))
        } catch {
            self.error = PublishFailure.message(error, updating: updating)
        }
        pending = false
    }
}

/// Why a publish (or a published card's saved changes) didn't go through, in the app's words —
/// never the server's, which are English (nor the system's): the card gone (deleted elsewhere) is
/// that it can't be found; the day's publishing spent (429 `rate_limited`, which trying again today
/// would only hear again) says so and when it comes back; anything else — offline, the server's
/// trouble, a refusal the panel can't name — is a retry: the publish that didn't happen, or the
/// changes that weren't saved. (A card without a title is said before anything is sent.)
enum PublishFailure {
    static func message(_ error: Error, updating: Bool = false) -> String {
        let failure = error as? APIFailure
        if failure?.isNotFound == true { return L10n.Card.NotFound.title }
        // The publish route documents no 429, so the generated client hands it over as an unexpected status.
        if failure?.code == "rate_limited" || failure?.status == 429 { return L10n.Write.PublishPanel.rateLimited }
        return updating ? L10n.Native.saveError : L10n.Write.PublishPanel.failed
    }
}

