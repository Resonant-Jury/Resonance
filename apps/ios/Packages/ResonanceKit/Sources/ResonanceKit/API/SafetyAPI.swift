import Foundation
import ResonanceAPI

/// Reports, filed through the server: a card (POST /api/v1/cards/{key}/report),
/// a person or a message (POST /api/v1/reports). The server fills in a card's
/// author, so anonymous cards can be reported too — the app never learns who
/// wrote one (App Store 1.2) — and keeps a copy of what was reported, so
/// deleting it later erases no evidence.
public struct SafetyAPI: Sendable {
    public typealias ReportReason = Components.Schemas.ReportCardRequest.ReasonPayload

    /// What a report other than a card's is about.
    public enum ReportTarget: Equatable, Sendable {
        /// A person (their profile), by user id.
        case person(String)
        /// A message someone sent the reporter, in its conversation.
        case message(String, conversationId: String)
        /// A conversation as a whole, by its own id: the other person, with its latest messages.
        case conversation(String)
    }

    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// `key` is the card's slug or id; returns the report's id.
    @discardableResult
    public func reportCard(_ key: String, reason: ReportReason, detail: String?) async throws -> String {
        let body = Components.Schemas.ReportCardRequest(reason: reason, detail: detail)
        switch try await client.reportCard(path: .init(key: key), body: .json(body)) {
        case let .created(r): return try r.body.json.id
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// A person or a message; returns the report's id.
    @discardableResult
    public func report(_ target: ReportTarget, reason: ReportReason, detail: String?) async throws -> String {
        typealias Request = Components.Schemas.CreateReportRequest
        let reason = Request.ReasonPayload(rawValue: reason.rawValue) ?? .other
        let body = switch target {
        case let .person(id):
            Request(targetType: .user, targetId: id, reason: reason, detail: detail)
        case let .message(id, conversation):
            Request(targetType: .message, targetId: id, conversationId: conversation, reason: reason, detail: detail)
        case let .conversation(id):
            Request(targetType: .message, targetId: id, conversationId: id, reason: reason, detail: detail)
        }
        switch try await client.createReport(body: .json(body)) {
        case let .created(r): return try r.body.json.id
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}
