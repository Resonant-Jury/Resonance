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
                // `-writeTitle "…" -writeStory "…"` fill a new card (screen checks; the simulator can't type into it).
                let defaults = UserDefaults.standard
                if let title = defaults.string(forKey: "writeTitle") { model.values.title = title }
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
                                maxLength: WriteModel.titleMax, seed: 11, display: true)
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

    private func header(_ model: WriteModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center) {
                Text(L10n.Write.title)
                    .font(AppFonts.heading(28))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                // Leaving keeps what's written: the draft is saved on the way out.
                OrganicButton(icon: .close, label: L10n.Write.closeEditor) {
                    Task {
                        await model.saveNow()
                        dismiss()
                    }
                }
            }
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

    /// Tags: the chosen ones (tap to remove), the AI pill while nothing is
    /// being typed, and the tag input with its Add.
    private func tags(_ model: WriteModel) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: 10) {
            label(L10n.Write.tagsLabel)
            FlowRow(spacing: 8) {
                ForEach(model.values.tags, id: \.self) { tag in
                    Button { model.removeTag(tag) } label: {
                        HStack(spacing: 4) {
                            Text(tag)
                            OrganicIcon(.close, size: 12, strokeWidth: Tokens.ink)
                        }
                        .font(AppFonts.body(14, weight: .semibold))
                        .foregroundStyle(Tokens.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background {
                            let shape = WobRectShape(radius: 14, seed: Double(tag.unicodeScalars.reduce(0) { $0 + Int($1.value) } % 97))
                            shape.fill(Tokens.terracottaLight)
                            shape.stroke(Tokens.ghostStroke.opacity(0.5), lineWidth: Tokens.inkLight)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(tag)
                    .accessibilityHint(L10n.Write.mediaRemove)
                }
                if model.tagDraft.trimmingCharacters(in: .whitespaces).isEmpty {
                    OrganicButton(model.suggestingTags ? L10n.Write.tagsSuggesting : L10n.Write.tagsSuggest, icon: .plus,
                                  variant: .ghost, size: .sm) {
                        Task { await model.suggestTags() }
                    }
                    .disabled(model.suggestingTags)
                }
            }
            HStack(spacing: 10) {
                TextField(text: $model.tagDraft, prompt: Text(L10n.Write.tagsPlaceholder).italic().foregroundStyle(Tokens.placeholder)) {
                    Text(L10n.Write.tagsLabel)
                }
                .font(AppFonts.body(15))
                .submitLabel(.done)
                .onSubmit { model.addTag() }
                .padding(.horizontal, Tokens.fieldPadX)
                .padding(.vertical, Tokens.fieldPadY)
                .background {
                    let shape = WobRectShape(radius: Tokens.radiusMd, seed: 19)
                    shape.fill(Tokens.cream)
                    shape.stroke(Tokens.fieldBorder, lineWidth: Tokens.ink)
                }
                OrganicButton(L10n.Write.tagsAdd, icon: .plus, variant: .outline, size: .sm) { model.addTag() }
                    .disabled(model.tagDraft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let error = model.tagError {
                Text(error).font(AppFonts.body(13)).foregroundStyle(Tokens.danger)
            }
        }
    }

    /// The cover: the picked photo in its hand-drawn frame (tap × to remove),
    /// or the dashed drop surface that opens the photo library.
    private func cover(_ model: WriteModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            label(L10n.Write.mediaLabel)
            if let url = model.values.imageURL {
                OrganicImage(url: url, seed: 31, radius: 16) { Tokens.creamDark }
                    .aspectRatio(1 / 0.56, contentMode: .fit)
                    .overlay(alignment: .topTrailing) {
                        OrganicButton(icon: .close, label: L10n.Write.mediaRemove, variant: .ghost) { model.removeCover() }
                            .background(Tokens.cream.opacity(0.9), in: Circle())
                            .padding(8)
                    }
            } else {
                PhotosPicker(selection: $coverItem, matching: .images) {
                    VStack(spacing: 8) {
                        if model.uploadingCover {
                            SketchLoader(size: 56)
                            Text(L10n.Write.mediaUploading).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.textMuted)
                        } else {
                            OrganicIcon(.image, size: 26, color: Tokens.terracotta)
                            Text(L10n.Write.mediaPlaceholder).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
                            Text(L10n.Write.mediaHint).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                        }
                    }
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: 150)
                    .padding(16)
                    .background {
                        WobRectShape(radius: 16, seed: 31)
                            .stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, dash: [7, 6]))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(model.uploadingCover)
            }
            if let error = model.mediaError {
                Text(error).font(AppFonts.body(13)).foregroundStyle(Tokens.danger)
            }
        }
    }

    private func actions(_ model: WriteModel) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            OrganicButton(L10n.Write.publish) { publishing = true }
                .disabled(model.values.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            OrganicButton(L10n.Write.saveDraftAndLeave, variant: .ghost) {
                Task {
                    await model.saveNow()
                    dismiss()
                }
            }
        }
        .padding(.top, 4)
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
