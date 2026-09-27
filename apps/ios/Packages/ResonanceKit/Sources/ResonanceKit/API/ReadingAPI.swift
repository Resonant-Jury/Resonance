import Foundation
import ResonanceAPI

public typealias FeedCard = Components.Schemas.FeedCard
public typealias FeedPage = Components.Schemas.FeedPage
public typealias CardDetail = Components.Schemas.CardDetail
public typealias Profile = Components.Schemas.Profile
public typealias Author = Components.Schemas.Author

/// The reading side of /api/v1 (feed, card page, author page) as plain async
/// calls: each returns the contract's type or throws an `APIFailure` whose
/// code the screen can act on (`not_found` → "this card isn't here").
public struct ReadingAPI: Sendable {
    let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func feed(limit: Int = 12, cursor: String? = nil) async throws -> FeedPage {
        switch try await client.getFeed(query: .init(limit: limit, cursor: cursor.flatMap(ISO8601.date))) {
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

    public func card(_ key: String) async throws -> CardDetail {
        switch try await client.getCard(path: .init(key: key)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public enum CardList: Sendable { case resonances, related, links }

    public func cards(_ list: CardList, of id: String) async throws -> [FeedCard] {
        let path = Operations.GetCardResonances.Input.Path(key: id)
        switch list {
        case .resonances:
            switch try await client.getCardResonances(path: path) {
            case let .ok(r): return try r.body.json.cards
            case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
            case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
            case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
            case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
            }
        case .related:
            switch try await client.getRelatedCards(path: .init(key: id)) {
            case let .ok(r): return try r.body.json.cards
            case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
            case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
            case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
            case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
            }
        case .links:
            switch try await client.getCardLinks(path: .init(key: id)) {
            case let .ok(r): return try r.body.json.cards
            case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
            case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
            case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
            case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
            }
        }
    }

    public func profile(_ handle: String) async throws -> Profile {
        switch try await client.getProfile(path: .init(handle: handle)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func profileCards(_ handle: String, limit: Int = 12, cursor: String? = nil) async throws -> FeedPage {
        switch try await client.getProfileCards(path: .init(handle: handle), query: .init(limit: limit, cursor: cursor.flatMap(ISO8601.date))) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func profileLinks(_ handle: String) async throws -> [FeedCard] {
        switch try await client.getProfileLinks(path: .init(handle: handle)) {
        case let .ok(r): return try r.body.json.cards
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
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
