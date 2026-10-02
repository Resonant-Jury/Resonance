import Foundation
import ResonanceAPI

public typealias FeedCard = Components.Schemas.FeedCard
public typealias FeedPage = Components.Schemas.FeedPage
public typealias CardDetail = Components.Schemas.CardDetail
public typealias Profile = Components.Schemas.Profile
public typealias Author = Components.Schemas.Author

/// The reading side of /api/v1 (feed, card page, author page) as plain async
/// calls: each returns the contract's type or throws an `APIFailure` whose
/// code the screen can act on (`not_found` → "this card isn't here"). A page
/// is one request: the card or the profile brings its lists along (`include`).
public struct ReadingAPI: Sendable {
    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// The latest public cards, a page at a time: the first page, or the one after `after`.
    public func feed(limit: Int = 12, after: PageAfter? = nil) async throws -> FeedPage {
        switch try await client.getFeed(query: .init(limit: limit, cursor: after?.cursorDate, pageToken: after?.token)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func recommended() async throws -> [FeedCard] {
        switch try await client.getRecommendedFeed() {
        case let .ok(r): return try r.body.json.cards
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// What a card's page brings along with the card (GET /cards/{key}?include=).
    public enum CardInclude: String, Sendable, CaseIterable {
        /// Public cards written in response (= /resonances).
        case resonances
        /// Cards sharing its tags (= /related).
        case related
        /// Cards linking to it; empty unless the reader wrote it (= /links).
        case links
        /// Summaries of the cards its story embeds, in reading order, each once.
        case embeds

        /// Everything the card page shows.
        public static let page = Set(allCases)
    }

    /// A card with its story — and, as `include` asks, the lists its page
    /// shows and the cards its story embeds, in the same request.
    public func card(_ key: String, include: Set<CardInclude> = []) async throws -> CardDetail {
        let names = CardInclude.allCases.filter(include.contains).map(\.rawValue)
        let query = Operations.GetCard.Input.Query(include: names.isEmpty ? nil : names.joined(separator: ","))
        switch try await client.getCard(path: .init(key: key), query: query) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// How many cards one GET /cards takes.
    public static let cardKeysLimit = 30

    /// Several cards' summaries (no story), by slug or id — what a screen that
    /// only draws a title and a cover needs (GET /cards?keys=). In the order
    /// asked, each once; those the reader may not see are left out. A key that
    /// can't name a card is never sent (the server would refuse the whole
    /// request for it), and more than 30 go out as requests side by side.
    public func cards(keys: [String]) async throws -> [FeedCard] {
        var asked = Set<String>()
        let valid = keys.filter { CardKey.isValid($0) && asked.insert($0).inserted }
        let chunks = stride(from: 0, to: valid.count, by: Self.cardKeysLimit).map {
            Array(valid[$0..<min($0 + Self.cardKeysLimit, valid.count)])
        }
        let client = client
        let pages = try await withThrowingTaskGroup(of: (Int, [FeedCard]).self) { group in
            for (i, chunk) in chunks.enumerated() {
                group.addTask {
                    switch try await client.getCards(query: .init(keys: chunk.joined(separator: ","))) {
                    case let .ok(r): return (i, try r.body.json.cards)
                    case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
                    case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
                    case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
                    }
                }
            }
            var pages = [[FeedCard]](repeating: [], count: chunks.count)
            for try await (i, cards) in group { pages[i] = cards }
            return pages
        }
        // A card asked for by both its slug and its id comes back once.
        var seen = Set<String>()
        return pages.joined().filter { seen.insert($0.id).inserted }
    }

    public typealias CardBoxShelf = Operations.GetCardBox.Input.Query.TabPayload

    /// One shelf of the signed-in person's card box.
    public func cardBox(_ shelf: CardBoxShelf) async throws -> [FeedCard] {
        switch try await client.getCardBox(query: .init(tab: shelf)) {
        case let .ok(r): return try r.body.json.cards
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// What a person's page brings along with their profile (GET /users/{handle}?include=).
    public enum ProfileInclude: String, Sendable, CaseIterable {
        /// The first page of their public cards (= /cards at `limit`).
        case cards
        /// Cards linking to theirs (= /links).
        case links

        /// Everything their page shows.
        public static let page = Set(allCases)
    }

    /// A person's profile as the reader sees it — and, as `include` asks, the
    /// first `limit` of their cards and the cards linking to theirs, in the same request.
    public func profile(_ handle: String, include: Set<ProfileInclude> = [], limit: Int? = nil) async throws -> Profile {
        let names = ProfileInclude.allCases.filter(include.contains).map(\.rawValue)
        let query = Operations.GetProfile.Input.Query(include: names.isEmpty ? nil : names.joined(separator: ","),
                                                      limit: include.contains(.cards) ? limit : nil)
        switch try await client.getProfile(path: .init(handle: handle), query: query) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Their public cards after the first page (the profile brings that one).
    public func profileCards(_ handle: String, limit: Int = 12, after: PageAfter? = nil) async throws -> FeedPage {
        let query = Operations.GetProfileCards.Input.Query(limit: limit, cursor: after?.cursorDate, pageToken: after?.token)
        switch try await client.getProfileCards(path: .init(handle: handle), query: query) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}

/// Where a newest-first list (the latest feed, a person's cards) goes on
/// after a page: its `nextPageToken`, which resumes exactly after the page's
/// last card — or, from a server that sends none, its `nextCursor`, a time to
/// the millisecond (cards sharing the boundary's millisecond are skipped).
public enum PageAfter: Hashable, Sendable {
    case token(String)
    case cursor(String)

    var token: String? {
        if case let .token(token) = self { token } else { nil }
    }

    var cursorDate: Date? {
        if case let .cursor(cursor) = self { ISO8601.date(cursor) } else { nil }
    }
}

extension FeedPage {
    /// The way to the next page; nil when this one is the last.
    public var next: PageAfter? {
        if let token = nextPageToken { return .token(token) }
        return nextCursor.map(PageAfter.cursor)
    }
}

/// A card's URL segment: its slug, or (older cards) its id.
public enum CardKey {
    /// What the contract accepts as a card key (schemas.ts CardKey).
    public static func isValid(_ key: String) -> Bool {
        (1...160).contains(key.utf8.count) && key.unicodeScalars.allSatisfy {
            ("a"..."z").contains($0) || ("A"..."Z").contains($0) || ("0"..."9").contains($0) || $0 == "-" || $0 == "_"
        }
    }

    /// The card a story's `/card/{key}` link names, or nil for any other link
    /// (the web's cardKeyFromHref: query and fragment dropped, the key decoded).
    public static func of(href: String) -> String? {
        guard href.hasPrefix("/card/") else { return nil }
        let segment = href.dropFirst("/card/".count).prefix { $0 != "/" && $0 != "?" && $0 != "#" }
        guard !segment.isEmpty else { return nil }
        return segment.removingPercentEncoding ?? String(segment)
    }
}

/// The contract's timestamps are ISO 8601 with milliseconds (JavaScript's toISOString).
public enum ISO8601 {
    nonisolated(unsafe) private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    public static func date(_ string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }
}
