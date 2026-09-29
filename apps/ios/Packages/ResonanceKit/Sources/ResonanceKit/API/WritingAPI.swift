import Foundation
import ResonanceAPI

public typealias PublishResult = Components.Schemas.PublishResponse

/// What the writing screen asks of the server: publishing (the v1 contract),
/// and the web editor's helpers it shares as they are — AI tag suggestions,
/// the publish panel's insight echo, and photo uploads. Drafts themselves are
/// the author's own documents and go straight to Firestore, as on the web.
public struct WritingAPI: Sendable {
    let client: Client
    let configuration: APIConfiguration
    let session: URLSession

    public init(client: Client, configuration: APIConfiguration, session: URLSession = .shared) {
        self.client = client
        self.configuration = configuration
        self.session = session
    }

    /// Publishes one of your cards: stamps it once, gives it its slug, and
    /// connects a resonance to its original (POST /api/v1/cards/{id}/publish).
    public func publish(_ cardId: String) async throws -> PublishResult {
        switch try await client.publishCard(path: .init(key: cardId)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Two or three tags for the draft, informed by your tag history (/api/cards/tags).
    public func suggestTags(title: String, story: String, tags: [String]) async throws -> [String] {
        struct Body: Encodable { let thoughtCore: String; let story: String; let tags: [String] }
        struct Reply: Decodable { let tags: [String] }
        let data = try await send("api/cards/tags", json: Body(thoughtCore: title, story: story, tags: tags))
        return try JSONDecoder().decode(Reply.self, from: data).tags
    }

    /// The publish panel's mirror moment: the draft's core insight, or nil (/api/cards/insight).
    public func insight(title: String, story: String) async throws -> String? {
        struct Body: Encodable { let thoughtCore: String; let story: String }
        struct Reply: Decodable { let coreInsight: String? }
        let data = try await send("api/cards/insight", json: Body(thoughtCore: title, story: story))
        return try JSONDecoder().decode(Reply.self, from: data).coreInsight
    }

    /// Uploads a (already compressed) photo through /api/upload and returns its public URL.
    public func upload(_ image: Data, filename: String, contentType: String = "image/jpeg") async throws -> URL {
        struct Reply: Decodable { let publicUrl: String }
        let boundary = "resonance-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: \(contentType)\r\n\r\n".utf8))
        body.append(image)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        let data = try await send("api/upload", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
        guard let url = URL(string: try JSONDecoder().decode(Reply.self, from: data).publicUrl) else {
            throw APIFailure.unexpected(status: 200)
        }
        return url
    }

    /// One line of /api/generate-image's progress stream (GenerateImageEvent).
    public enum IllustrationEvent: Sendable, Equatable {
        /// The model's in-progress pass, a PNG.
        case partial(Data)
        /// The stored picture.
        case done(URL)
        /// The server gave up after the stream began (the status is already 200 by then).
        case failed
    }

    /// A doodle-style illustration from the story (/api/generate-image): the
    /// model's previews while it renders, then the stored picture — NDJSON,
    /// read line by line as it arrives.
    public func illustrate(story: String) -> AsyncThrowingStream<IllustrationEvent, Error> {
        struct Body: Encodable { let story: String }
        struct Line: Decodable { let type: String; let b64: String?; let publicUrl: String? }
        let body = try? JSONEncoder().encode(Body(story: story))
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let bytes = try await open("api/generate-image", body: body ?? Data(), contentType: "application/json")
                    for try await text in bytes.lines {
                        guard let line = try? JSONDecoder().decode(Line.self, from: Data(text.utf8)) else { continue }
                        switch line.type {
                        case "partial":
                            if let png = line.b64.flatMap({ Data(base64Encoded: $0) }) { continuation.yield(.partial(png)) }
                        case "done":
                            if let url = line.publicUrl.flatMap(URL.init(string:)) { continuation.yield(.done(url)) } else { continuation.yield(.failed) }
                        default:
                            continuation.yield(.failed)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// POSTs and hands back the body as it streams in, with the same token refresh as `send`.
    private func open(_ path: String, body: Data, contentType: String) async throws -> URLSession.AsyncBytes {
        var request = URLRequest(url: configuration.origin.appending(path: path))
        // Rendering can go quiet for a while between previews; the route allows two minutes.
        request.timeoutInterval = 150
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        var token = try await configuration.idToken(false)
        for attempt in 0..<2 {
            if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (bytes, response) = try await session.bytes(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, attempt == 0, let fresh = try await configuration.idToken(true), fresh != token {
                token = fresh
                continue
            }
            if status == 401 { throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401) }
            guard (200..<300).contains(status) else { throw APIFailure.unexpected(status: status) }
            return bytes
        }
        throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401)
    }

    private func send<T: Encodable>(_ path: String, json: T) async throws -> Data {
        try await send(path, body: try JSONEncoder().encode(json), contentType: "application/json")
    }

    /// POSTs with the ID token; a rejected token is refreshed once, like the v1 middleware.
    private func send(_ path: String, body: Data, contentType: String) async throws -> Data {
        var request = URLRequest(url: configuration.origin.appending(path: path))
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        var token = try await configuration.idToken(false)
        for attempt in 0..<2 {
            if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, attempt == 0, let fresh = try await configuration.idToken(true), fresh != token {
                token = fresh
                continue
            }
            if status == 401 { throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401) }
            guard (200..<300).contains(status) else { throw APIFailure.unexpected(status: status) }
            return data
        }
        throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401)
    }
}
