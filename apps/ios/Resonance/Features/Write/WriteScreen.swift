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
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.openRoute) private var openRoute
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
            if phase != .active, let model { Task { await model.saveNow() } }
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
                } else if request.referenceCardId == nil, let drafts = session.drafts {
                    showGuide = await !drafts.hasAnyCards()
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
                showsAnonymousHint = await session.hints?.claim("anonymous-publish") ?? false
            }
        }
    }

    private func form(_ model: WriteModel) -> some View {
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
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 48)
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

    /// Leaving keeps what's written: the draft is saved on the way out. `afterDialog`
    /// lets the question's cover finish going down before the page does.
    private func leave(_ model: WriteModel, afterDialog: Bool = false) async {
        let settle = Task { if afterDialog { try? await Task.sleep(for: Self.dialogSettle) } }
        await model.saveNow()
        writer.leave(model.change)
        await settle.value
        dismiss()
    }

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
        let compact = sizeClass == .compact
        return VStack(alignment: compact ? .center : .leading, spacing: compact ? 4 : 8) {
            Group {
                if compact {
                    VStack(spacing: 10) {
                        primaryAction(model).fillingWidth()
                        secondaryAction(model, fillsWidth: true)
                    }
                } else {
                    FlowRow(spacing: 12) {
                        primaryAction(model)
                        secondaryAction(model)
                    }
                }
            }
            .opacity(discarding ? 0.6 : 1)
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

    private func primaryAction(_ model: WriteModel) -> OrganicButton {
        OrganicButton(model.isPublished ? (discarding ? L10n.Write.saving : L10n.Write.saveChanges) : L10n.Write.publish) {
            actionError = nil
            publishing = true
        }
    }

    @ViewBuilder
    private func secondaryAction(_ model: WriteModel, fillsWidth: Bool = false) -> some View {
        if !model.isPublished {
            OrganicButton(L10n.Write.saveDraftAndLeave, variant: .tonal) { Task { await leave(model) } }
                .fillingWidth(fillsWidth)
        } else if model.hasPendingEdit {
            OrganicButton(L10n.Write.discardChanges, variant: .tonal) { Task { await discard(model) } }
                .fillingWidth(fillsWidth)
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

    /// The card isn't there (deleted) or isn't yours: the web's not-found note.
    private var missing: some View {
        VStack(spacing: 12) {
            Text(L10n.Card.NotFound.title).font(AppFonts.heading(24)).foregroundStyle(Tokens.text)
            Button(L10n.Card.NotFound.back) { dismiss() }
                .font(AppFonts.body(15))
                .foregroundStyle(Tokens.terracotta)
                .buttonStyle(.plain)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.top, 120)
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
            if insightLoading {
                HStack(spacing: 10) {
                    SketchLoader(size: 28)
                    Text(L10n.Write.PublishPanel.insightLoading).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                }
            } else if let insight {
                HStack(alignment: .top, spacing: 10) {
                    OrganicIcon(.sparkle, size: 16, color: Tokens.terracotta).padding(.top, 2)
                    Text(L10n.Write.PublishPanel.insight(coreInsight: insight)).font(AppFonts.body(14)).foregroundStyle(Tokens.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text(L10n.Write.Visibility.label.uppercased())
                    .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
                    .tracking(Tokens.labelSize * 0.06)
                    .foregroundStyle(Tokens.textMuted)
                VStack(spacing: 0) {
                    visibilityRow("public", L10n.Write.Visibility.`public`, icon: .globe, seed: 71)
                    WavyDivider(seed: 49).padding(.vertical, 2)
                    visibilityRow("private", L10n.Write.Visibility.`private`, icon: .lock, seed: 73)
                }
                // Why there is no other audience for it (a connections card made anonymous has just gone public).
                if anonymous {
                    Text(L10n.Write.PublishPanel.anonymousVisibility)
                        .font(AppFonts.body(Tokens.hintSize)).foregroundStyle(Tokens.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.2), value: anonymous)
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
                if showsAnonymousHint {
                    Text(L10n.Write.PublishPanel.anonymousHint).font(AppFonts.body(Tokens.hintSize)).foregroundStyle(Tokens.textMuted)
                }
            }
            WavyDivider(seed: 47)
            HStack(spacing: 12) {
                OrganicButton(updating
                              ? (pending ? L10n.Write.PublishPanel.updating : L10n.Write.PublishPanel.update)
                              : (pending ? L10n.Write.PublishPanel.publishing : L10n.Write.PublishPanel.publish), variant: .solid, size: .sm) {
                    Task { await publish() }
                }
                .disabled(pending)
                OrganicButton(L10n.Write.PublishPanel.cancel, variant: .text, size: .sm, action: onCancel)
                    .disabled(pending)
            }
            if let error { Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta) }
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

    private func visibilityRow(_ value: String, _ label: String, icon: IconName, seed: Double) -> some View {
        let selected = visibility == value
        return Button { visibility = value } label: {
            HStack(spacing: 12) {
                OrganicIcon(icon, size: 16, color: selected ? Tokens.terracotta : Tokens.textMuted)
                Text(label).font(AppFonts.body(15, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Tokens.terracotta : Tokens.text)
                Spacer(minLength: 0)
                OrganicRadio(isOn: selected, seed: seed)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func publish() async {
        // The server refuses a card without a title; say so in the writer's words.
        guard !model.values.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = L10n.Write.titleRequired
            return
        }
        pending = true
        error = nil
        do {
            onPublished(model.isPublished
                        ? try await model.applyEdit(visibility: visibility, anonymous: anonymous)
                        : try await model.publish(visibility: visibility, anonymous: anonymous))
        } catch let failure as APIFailure {
            error = failure.message
        } catch {
            self.error = error.localizedDescription
        }
        pending = false
    }
}
