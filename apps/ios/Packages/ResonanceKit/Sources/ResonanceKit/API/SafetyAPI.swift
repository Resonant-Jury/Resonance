import Foundation
import ResonanceAPI

/// Reporting a card (POST /api/v1/cards/{key}/report). The server fills in
/// the author, so anonymous cards can be reported too — the app never learns
/// who wrote one (App Store 1.2).
public struct SafetyAPI: Sendable {
    public typealias ReportReason = Components.Schemas.ReportCardRequest.ReasonPayload

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
}
