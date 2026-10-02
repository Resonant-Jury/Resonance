import Foundation
import Observation
import ResonanceKit
import UIKit

/// The writing screen's state and its work (CardEditor): the draft's values,
/// autosave a moment after typing stops, AI tags, the cover photo, publishing.
/// Opened on a published card it revises instead: autosave buffers the
/// working copy privately and "Save changes" puts it in front of readers.
@MainActor @Observable
final class WriteModel {
    var values = DraftValues() {
        didSet { if values != oldValue { scheduleSave() } }
    }
    private(set) var draftId: String?
    private(set) var savedAt: Date?
    /// Something was written this visit (a draft or revision saved, published,
    /// applied or dropped): what the screens behind the writer read again for.
    private(set) var wrote = false
    /// Revising a live card (fixed for the model's lifetime, as on the web).
    let isPublished: Bool
    /// A revision is waiting in the buffer — only its author can see it.
    private(set) var hasPendingEdit: Bool
    /// The published card's slug (its page lives at slug ?? id).
    let slug: String?
    var tagDraft = ""
    private(set) var suggestingTags = false
    var tagError: String?
    private(set) var uploadingCover = false
    private(set) var uploadingInline = false
    private(set) var generating = false
    /// The illustration's in-progress pass while it renders.
    private(set) var partialPreview: UIImage?
    var mediaError: String?

    /// Uploading or illustrating — the image surface waits either way.
    var mediaBusy: Bool { uploadingCover || generating }
    /// The web's canGenerate: there is a story to draw from.
    var canGenerate: Bool { !values.story.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !mediaBusy }

    /// The card this one resonates with, if any (a response card).
    let referenceCardId: String?
    let editor: StoryEditorBridge

    @ObservationIgnored private let drafts: DraftService?
    @ObservationIgnored private let writing: WritingAPI
    @ObservationIgnored private var saveTask: Task<Void, Never>?
    /// Writes run one after another, so a slow create can't race the next update.
    @ObservationIgnored private var chain: Task<Void, Never>?
    /// What the last successful write stored; an unchanged working copy isn't written again.
    @ObservationIgnored private var lastSaved: DraftValues?
    /// The first-card guide's question as it was seeded: a starting point, not writing.
    @ObservationIgnored private var seeded: DraftValues?

    /// CardEditor's AUTOSAVE_DELAY_MS (leaving or going to the background saves at once).
    static let autosaveDelay: Duration = .milliseconds(1500)
    static let titleMax = 60

    init(drafts: DraftService?, writing: WritingAPI, referenceCardId: String? = nil, opened: DraftService.OpenedCard? = nil,
         editor bridge: StoryEditorBridge? = nil) {
        self.drafts = drafts
        self.writing = writing
        self.referenceCardId = opened?.referenceCardId ?? referenceCardId
        isPublished = opened?.isPublished ?? false
        hasPendingEdit = opened?.hasPendingEdit ?? false
        slug = opened?.slug
        title = opened.map { $0.isPublished ? L10n.Write.editPublishedTitle : L10n.Write.editTitle } ?? L10n.Write.title
        editor = bridge ?? StoryEditorBridge(placeholder: L10n.Write.storyPlaceholder)
        if let opened {
            draftId = opened.id
            values = opened.values
            lastSaved = opened.values
            editor.setMarkdown(opened.values.story)
        }
        editor.onChange = { [weak self] markdown in self?.values.story = markdown }
    }

    /// The card's page: slug, or id (a draft or a card without one).
    var routeKey: String? { slug ?? draftId }

    /// Whether going back would put something away: words, tags or a cover in a
    /// draft (the guide's seeded question isn't), or a published card's revision —
    /// kept in its buffer or still being typed. The writer asks first.
    var holdsWriting: Bool {
        isPublished ? hasPendingEdit || needsSave : !values.isEmpty && values != seeded
    }

    /// Typed since the last write stored anything (autosave is still a moment away).
    var needsSave: Bool {
        !(values.isEmpty && draftId == nil) && values != lastSaved
    }

    /// What this visit changed, for the screens behind the writer; nil when it wrote nothing.
    var change: WriteLauncher.Change? {
        wrote ? WriteLauncher.Change(cardId: draftId, referenceCardId: referenceCardId) : nil
    }

    // MARK: Autosave

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: Self.autosaveDelay)
            guard !Task.isCancelled else { return }
            await self?.saveNow()
        }
    }

    /// Writes the draft now (creating it the first time there is something to
    /// keep); returns its id. Queued behind any write in flight.
    @discardableResult
    func saveNow() async -> String? {
        saveTask?.cancel()
        let previous = chain
        let task = Task { [weak self] () -> Void in
            await previous?.value
            guard let self, let drafts = self.drafts else { return }
            let v = self.values
            guard self.needsSave else { return }
            do {
                if self.isPublished, let id = self.draftId {
                    // A live card: the revision waits privately in its buffer.
                    try await drafts.saveEdit(id, v)
                    self.hasPendingEdit = true
                } else if let id = self.draftId {
                    try await drafts.update(id, v)
                } else {
                    self.draftId = try await drafts.create(v, locale: Strings.shared.language.rawValue, referenceCardId: self.referenceCardId)
                }
                self.lastSaved = v
                self.savedAt = Date()
                self.wrote = true
            } catch {
                // Kept in memory; the next edit (or leaving) tries again.
            }
        }
        chain = task
        await task.value
        return draftId
    }

    /// The first-card guide's question, as the story to write against: it is
    /// the starting point, not writing — nothing is saved until the user adds to it.
    func seed(story: String) {
        editor.setMarkdown(story)
        values.story = story
        lastSaved = values
        seeded = values
    }

    /// One line of plain reassurance under the page title: what has happened
    /// and, for a live card, what has not happened yet.
    var saveStatus: String {
        let time = savedAt?.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Strings.shared.locale))
        if isPublished {
            if let time { return L10n.Write.editBuffered(time: time) }
            return hasPendingEdit ? L10n.Write.editBufferedIdle : L10n.Write.editLiveHint
        }
        guard let time else { return L10n.Write.autosaveHint }
        return L10n.Write.autosaved(time: time)
    }

    /// The page title: a new card, a draft being resumed, or a live card being revised.
    let title: String

    // MARK: Tags

    func addTag() {
        let tag = tagDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        tagDraft = ""
        guard !tag.isEmpty, !values.tags.contains(tag) else { return }
        values.tags.append(tag)
    }

    func removeTag(_ tag: String) {
        values.tags.removeAll { $0 == tag }
    }

    /// Two or three from the model, informed by the author's past tags; new ones only.
    func suggestTags() async {
        guard !suggestingTags else { return }
        tagError = nil
        suggestingTags = true
        defer { suggestingTags = false }
        do {
            let suggested = try await writing.suggestTags(title: values.title, story: values.story, tags: values.tags)
            values.tags += suggested.filter { !values.tags.contains($0) }
        } catch {
            tagError = L10n.Write.tagsSuggestError
        }
    }

    // MARK: Images

    /// The cover: compressed here, uploaded, and its hue read from the local pixels.
    func setCover(_ image: UIImage, filename: String) async {
        guard !mediaBusy, let data = CoverImage.jpeg(image) else { return }
        mediaError = nil
        uploadingCover = true
        defer { uploadingCover = false }
        do {
            let url = try await writing.upload(data, filename: filename)
            values.imageURL = url
            values.imageLabel = filename
            values.accentHue = CoverImage.accentHue(image)
        } catch {
            mediaError = L10n.Write.mediaUploadError
        }
    }

    /// An illustration drawn from the story (/api/generate-image): its previews
    /// show as they arrive; the stored picture becomes the cover, its hue read
    /// from that picture (or, failing that, the last preview).
    func generateCover() async {
        guard canGenerate else { return }
        mediaError = nil
        generating = true
        defer {
            generating = false
            partialPreview = nil
        }
        var stored: URL?
        do {
            for try await event in writing.illustrate(story: values.story) {
                switch event {
                case let .partial(png): partialPreview = UIImage(data: png) ?? partialPreview
                case let .done(url): stored = url
                case .failed:
                    mediaError = L10n.Write.mediaGenerateError
                    return
                }
            }
        } catch {
            mediaError = L10n.Write.mediaGenerateError
            return
        }
        guard let stored else {
            mediaError = L10n.Write.mediaGenerateError
            return
        }
        let preview = partialPreview
        let picture = try? await URLSession.shared.data(from: stored).0
        values.imageURL = stored
        values.imageLabel = L10n.Write.mediaGeneratedLabel
        values.accentHue = (picture.flatMap(UIImage.init(data:)) ?? preview).flatMap(CoverImage.accentHue)
    }

    func removeCover() {
        values.imageURL = nil
        values.imageLabel = nil
        values.accentHue = nil
    }

    /// A photo inside the story (the toolbar's Insert image).
    func insertImage(_ image: UIImage, filename: String) async {
        guard !uploadingInline, let data = CoverImage.jpeg(image) else { return }
        uploadingInline = true
        defer { uploadingInline = false }
        if let url = try? await writing.upload(data, filename: filename) {
            editor.exec("insertImage", ["src": url.absoluteString, "alt": filename])
        } else {
            mediaError = L10n.Write.Editor.imageUploadError
        }
    }

    // MARK: Publish

    /// Saves the choices with the draft, then publishes it; returns where the card lives.
    func publish(visibility: String, anonymous: Bool) async throws -> String {
        values.visibility = visibility
        values.anonymous = anonymous
        guard let id = await saveNow() else { throw APIFailure(code: "invalid_request", message: "Nothing to publish.", status: nil) }
        let result = try await writing.publish(id)
        wrote = true
        PushCenter.shared.reachedOut()
        return result.slug ?? result.id
    }

    /// Save changes: the working copy (with the panel's choices) goes into the
    /// buffer, then the server makes it the live card — the moment an edit
    /// reaches readers. The publish date stays. Returns where the card lives.
    func applyEdit(visibility: String, anonymous: Bool) async throws -> String {
        values.visibility = visibility
        values.anonymous = anonymous
        guard let id = draftId else { throw APIFailure(code: "not_found", message: "No such card.", status: nil) }
        await saveNow()
        if values != lastSaved { throw APIFailure(code: "internal", message: L10n.Native.saveError, status: nil) }
        let result = try await writing.applyEdit(id)
        wrote = true
        hasPendingEdit = false
        return result.slug ?? slug ?? id
    }

    /// Discard changes: the buffer goes; the live card was never touched.
    func discardEdit() async throws -> String {
        guard let id = draftId, let drafts else { throw APIFailure(code: "not_found", message: "No such card.", status: nil) }
        saveTask?.cancel()
        // Behind any autosave in flight, so a straggling write can't re-create the buffer.
        await chain?.value
        try await drafts.discardEdit(id)
        wrote = true
        hasPendingEdit = false
        lastSaved = values
        return slug ?? id
    }
}
