import Foundation
import ResonanceKit

/// An answer the test hands over when it chooses (a request still on its way).
actor Gate<Value: Sendable> {
    private var value: Value?
    private var waiting: [CheckedContinuation<Value, Never>] = []

    func wait() async -> Value {
        if let value { return value }
        return await withCheckedContinuation { waiting.append($0) }
    }

    func open(_ value: Value) {
        self.value = value
        waiting.forEach { $0.resume(returning: value) }
        waiting = []
    }
}

/// What a stubbed endpoint was asked for, in order.
actor Calls<Call: Sendable> {
    private(set) var all: [Call] = []
    func record(_ call: Call) { all.append(call) }
}

/// Waits (a little) for something the code under test does on its own time.
@MainActor func eventually(within timeout: Duration = .seconds(3), _ condition: @MainActor () async -> Bool) async -> Bool {
    let end = ContinuousClock.now.advanced(by: timeout)
    while ContinuousClock.now < end {
        if await condition() { return true }
        try? await Task.sleep(for: .milliseconds(5))
    }
    return await condition()
}

/// Contract-shaped values, decoded from JSON as the API sends them.
enum Fixture {
    static func card(_ id: String, slug: String? = nil, title: String? = nil, anonymous: Bool = false) -> FeedCard {
        let slugJSON = slug.map { "\"\($0)\"" } ?? "null"
        let author = anonymous ? "null" : """
        {"id":"bob","handle":"bob","initials":"BO","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,
         "avatarSeed":"42","verified":false,"region":"TW"}
        """
        return decode("""
        {"id":"\(id)","slug":\(slugJSON),"title":"\(title ?? "Card \(id)")","excerpt":"…","tags":["日常"],
         "publishedAt":"2026-09-01T08:00:00.000Z","author":\(author),"anonymous":\(anonymous),"visibility":"public",
         "imageUrl":null,"imageLabel":null,"accentHue":140,"readMinutes":2,"referenceCardId":null,"reason":null}
        """)
    }

    static func detail(_ card: FeedCard, story: String = "A story.", isOwner: Bool = false) -> CardDetail {
        let cardJSON = String(decoding: try! JSONEncoder().encode(card), as: UTF8.self)
        return decode("""
        {"card":\(cardJSON),"story":"\(story)","visibility":"public","anonymous":\(card.anonymous),
         "resonanceCount":0,"coreInsight":null,"isOwner":\(isOwner),"referenceCard":null}
        """)
    }

    static func page(_ cards: [FeedCard], next: String? = nil) -> FeedPage {
        let cardsJSON = String(decoding: try! JSONEncoder().encode(cards), as: UTF8.self)
        return decode(#"{"cards":\#(cardsJSON),"nextCursor":\#(next.map { "\"\($0)\"" } ?? "null")}"#)
    }

    private static func decode<T: Decodable>(_ json: String) -> T {
        try! JSONDecoder().decode(T.self, from: Data(json.utf8))
    }
}
