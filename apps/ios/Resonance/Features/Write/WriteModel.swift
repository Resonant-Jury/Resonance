import Foundation
import Observation
import ResonanceKit
import UIKit

/// The writing screen's state and its work (CardEditor): the draft's values,
/// autosave a moment after typing stops, AI tags, the cover photo, publishing.
@MainActor @Observable
final class WriteModel {
    var values = DraftValues() {
        didSet { if values != oldValue { scheduleSave() } }
    }
    private(set) var draftId: String?
    private(set) var savedAt: Date?
    var tagDraft = ""
    private(set) var suggestingTags = false
    var tagError: String?
    private(set) var uploadingCover = false
    private(set) var uploadingInline = false
    var mediaError: String?

    /// The card this one resonates with, if any (a response card).
    let referenceCardId: String?
    let editor: StoryEditorBridge

    @ObservationIgnored private let drafts: DraftService?
    @ObservationIgnored private let writing: WritingAPI
    @ObservationIgnored private var saveTask: Task<Void, Never>?
    /// Writes run one after another, so a slow create can't race the next update.
    @ObservationIgnored private var chain: Task<Void, Never>?

    /// CardEditor's AUTOSAVE_DELAY_MS.
    static let autosaveDelay: Duration = .milliseconds(800)
    static let titleMax = 60

    init(drafts: DraftService?, writing: WritingAPI, referenceCardId: String? = nil) {
        self.drafts = drafts
        self.writing = writing
        self.referenceCardId = referenceCardId
        editor = StoryEditorBridge(placeholder: L10n.Write.storyPlaceholder)
        editor.onChange = { [weak self] markdown in self?.values.story = markdown }
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
            if v.isEmpty && self.draftId == nil { return }
            do {
                if let id = self.draftId {
                    try await drafts.update(id, v)
                } else {
                    self.draftId = try await drafts.create(v, locale: Strings.shared.language.rawValue, referenceCardId: self.referenceCardId)
                }
                self.savedAt = Date()
            } catch {
                // Kept in memory; the next edit (or leaving) tries again.
            }
        }
        chain = task
        await task.value
        return draftId
    }

    /// "Draft saved · 14:32", or the hint that drafts save themselves.
    var saveStatus: String {
        guard let savedAt else { return L10n.Write.autosaveHint }
        return L10n.Write.autosaved(time: savedAt.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Strings.shared.locale)))
    }

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
        guard !uploadingCover, let data = CoverImage.jpeg(image) else { return }
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
        return result.slug ?? result.id
    }
}
