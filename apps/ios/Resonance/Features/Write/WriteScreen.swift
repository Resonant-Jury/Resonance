import DesignSystem
import PhotosUI
import ResonanceKit
import SwiftUI

/// Writing a card (the web's write page on a phone): the one-line title, the
/// story in the editor island under the web's text toolbar, tags with the AI
/// pill, the cover photo, then Publish (through the publish panel) or leave
/// with the draft saved. Drafts save themselves a moment after typing stops.
struct WriteScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.dismiss) private var dismiss
    @State private var model: WriteModel?
    @State private var publishing = false
    @State private var pickingCard = false
    @State private var coverItem: PhotosPickerItem?
    @State private var inlineItem: PhotosPickerItem?
    @State private var pickingInline = false

    var body: some View {
        Group {
            if let model {
                form(model)
            } else {
                Tokens.cream
            }
        }
        .background(Tokens.cream)
        .task {
            if model == nil {
                let model = WriteModel(drafts: session.drafts, writing: session.writing, referenceCardId: writer.request?.referenceCardId)
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
                self.model = model
            }
        }
    }

    private func form(_ model: WriteModel) -> some View {
        @Bindable var model = model
        return ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header(model)
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
            .padding(.top, 12)
            .padding(.bottom, 48)
        }
        .scrollDismissesKeyboard(.interactively)
        // The ✕ stays put above the scrolling page, on the title's line (paneClose).
        // Leaving keeps what's written: the draft is saved on the way out.
        .overlay(alignment: .topTrailing) {
            OrganicCloseChip(label: L10n.Write.closeEditor) {
                Task {
                    await model.saveNow()
                    dismiss()
                }
            }
            .padding(.top, 12)
            .padding(.trailing, 20)
        }
        // The page scrolls under a cream status bar, not through the clock
        // (a background reaches into the safe area its view touches).
        .safeAreaInset(edge: .top, spacing: 0) {
            Color.clear.frame(height: 0).background(Tokens.cream)
        }
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
        .organicModal(isPresented: $pickingCard, seed: 41, maxWidth: 460, closeLabel: L10n.Write.Editor.CardModal.cancel) {
            InsertCardContent { card in
                pickingCard = false
                model.editor.exec("insertCard", ["href": "/card/\(card.routeKey)", "title": card.title])
            } onCancel: { pickingCard = false }
        }
        .organicModal(isPresented: $publishing, seed: 29, maxWidth: 480, closeLabel: L10n.Write.PublishPanel.cancel) {
            PublishPanel(model: model) { routeKey in
                publishing = false
                writer.finish(publishedCard: routeKey)
                dismiss()
            } onCancel: { publishing = false }
        }
    }

    /// PageTitle with the save state under it (clear of the pinned ✕).
    private func header(_ model: WriteModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L10n.Write.title)
                .font(AppFonts.heading(28))
                .foregroundStyle(Tokens.text)
                .accessibilityAddTraits(.isHeader)
                .padding(.trailing, 48)
            Text(model.saveStatus)
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.textMuted)
                .contentTransition(.opacity)
        }
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
            .tracking(Tokens.labelSize * 0.06)
            .foregroundStyle(Tokens.textMuted)
    }

    /// Tags: the chosen ones (lg pills with their ×), the AI pill while nothing
    /// is being typed, and the two-segment tag bar.
    private func tags(_ model: WriteModel) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: 10) {
            label(L10n.Write.tagsLabel)
            VStack(alignment: .leading, spacing: 12) {
                FlowRow(spacing: 10) {
                    ForEach(model.values.tags, id: \.self) { tag in
                        TagPill(tag, fill: Tokens.terracottaLight, size: .lg) { model.removeTag(tag) }
                    }
                    // The AI pill steps aside once the user starts typing their own tag.
                    if model.tagDraft.trimmingCharacters(in: .whitespaces).isEmpty {
                        AddTagButton(label: model.suggestingTags ? L10n.Write.tagsSuggesting : L10n.Write.tagsSuggest) {
                            Task { await model.suggestTags() }
                        }
                    }
                }
                TagInputBar(text: $model.tagDraft, placeholder: L10n.Write.tagsPlaceholder, addLabel: L10n.Write.tagsAdd) { model.addTag() }
                if let error = model.tagError {
                    Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta)
                }
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

    /// Everything autosaves; these are only about intent — publish it, or step away.
    private func actions(_ model: WriteModel) -> some View {
        FlowRow(spacing: 12) {
            OrganicButton(L10n.Write.publish) { publishing = true }
            OrganicButton(L10n.Write.saveDraftAndLeave, variant: .ghost) {
                Task {
                    await model.saveNow()
                    dismiss()
                }
            }
        }
        .padding(.top, 6)
    }

    private static func load(_ item: PhotosPickerItem) async -> UIImage? {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        return UIImage(data: data)
    }
}

/// The publish panel (PublishPanel.tsx): the insight echo, who can see it,
/// publishing anonymously with the card head it will get, then Publish.
private struct PublishPanel: View {
    let model: WriteModel
    let onPublished: (String) -> Void
    let onCancel: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var visibility = "public"
    @State private var anonymous = false
    @State private var insight: String?
    @State private var insightLoading = true
    @State private var pending = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            ModalTitle(L10n.Write.PublishPanel.title)
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
                if anonymous {
                    Text(L10n.Write.PublishPanel.anonymousHint).font(AppFonts.body(Tokens.hintSize)).foregroundStyle(Tokens.textMuted)
                }
            }
            WavyDivider(seed: 47)
            HStack(spacing: 12) {
                OrganicButton(pending ? L10n.Write.PublishPanel.publishing : L10n.Write.PublishPanel.publish, size: .sm) {
                    Task { await publish() }
                }
                .disabled(pending)
                OrganicButton(L10n.Write.PublishPanel.cancel, variant: .ghost, size: .sm, action: onCancel)
                    .disabled(pending)
            }
            if let error { Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta) }
        }
        .task {
            visibility = model.values.visibility == "private" ? "private" : "public"
            anonymous = model.values.anonymous
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
        pending = true
        error = nil
        do {
            onPublished(try await model.publish(visibility: visibility, anonymous: anonymous))
        } catch let failure as APIFailure {
            error = failure.message
        } catch {
            self.error = error.localizedDescription
        }
        pending = false
    }
}

/// InsertCardModal: one of your public cards, dropped in as an embedded card.
private struct InsertCardContent: View {
    let onPick: (FeedCard) -> Void
    let onCancel: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var cards: [FeedCard]?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ModalTitle(L10n.Write.Editor.CardModal.title)
            ModalBody(L10n.Write.Editor.CardModal.subtitle)
            if let cards {
                if cards.isEmpty {
                    EmptyNote(L10n.Write.Editor.CardModal.empty, size: 14).padding(.vertical, 12)
                }
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    if i > 0 { WavyDivider(seed: Double(60 + i * 7)).padding(.vertical, 2) }
                    Button { onPick(card) } label: {
                        Text(card.title)
                            .font(AppFonts.heading(16))
                            .foregroundStyle(Tokens.text)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            } else {
                SketchLoader(size: 40).frame(maxWidth: .infinity).padding(.vertical, 12)
            }
            ModalActions { OrganicButton(L10n.Write.Editor.CardModal.cancel, variant: .ghost, size: .sm, action: onCancel) }
        }
        .task { cards = (try? await session.reading.cardBox(.published)) ?? [] }
    }
}
