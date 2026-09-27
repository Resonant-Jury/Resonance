import Foundation

/// The account routes (they predate /api/v1 and stay as the web uses them):
/// scheduling or cancelling deletion, and exporting one's own writing.
/// Authenticated with the same ID token as the v1 client.
public struct AccountAPI: Sendable {
    let configuration: APIConfiguration
    let session: URLSession

    public init(_ configuration: APIConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
    }

    struct DeletionBody: Decodable {
        struct Deletion: Decodable { let requestedAt: String; let purgeAfter: String }
        let deletion: Deletion?
    }

    /// When the account will be purged, if its deletion is scheduled.
    public func deletion() async throws -> Date? {
        try await deletionCall("GET")
    }

    /// Schedules deletion (7-day grace). The server revokes every session, so
    /// the app signs out right after.
    @discardableResult
    public func scheduleDeletion() async throws -> Date? {
        try await deletionCall("POST")
    }

    public func cancelDeletion() async throws {
        _ = try await deletionCall("DELETE")
    }

    /// Everything the person wrote, as the web's JSON backup.
    public func export() async throws -> Data {
        let (data, response) = try await send("GET", "api/account/export")
        try check(response)
        return data
    }

    private func deletionCall(_ method: String) async throws -> Date? {
        let (data, response) = try await send(method, "api/account/deletion")
        try check(response)
        let body = try JSONDecoder().decode(DeletionBody.self, from: data)
        return body.deletion.flatMap { ISO8601.date($0.purgeAfter) }
    }

    private func send(_ method: String, _ path: String) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: configuration.origin.appending(path: path))
        request.httpMethod = method
        if let token = try await configuration.idToken(false) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return try await session.data(for: request)
    }

    private func check(_ response: URLResponse) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401) }
        guard (200..<300).contains(status) else { throw APIFailure.unexpected(status: status) }
    }
}
