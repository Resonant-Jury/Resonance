import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import SwiftUI

/// S6 — one backend for web and native. The `Client` here is generated at
/// build time (swift-openapi-generator) from openapi/v1/openapi.json, which
/// is itself generated from the Zod schemas the Next.js routes validate with.
/// Auth is the Firebase ID token as a Bearer header — the same token the web
/// trades for its session cookie.
///
/// Run against the local emulators + `npm run dev:emulator -- --port 3100`:
///   xcrun simctl launch booted com.resonance.spikes -spike api -run 1 \
///     -email alice@resonance.test -password <seed password>
struct ApiSpike: View {
    var autorun = false
    @State private var log: [String] = []

    var body: some View {
        List(log, id: \.self) { Text($0).font(.caption.monospaced()) }
            .navigationTitle("S6 Backend contract")
            .task {
                guard autorun else { return }
                await run()
            }
            .toolbar { Button("Run") { Task { await run() } } }
    }

    private func report(_ line: String) {
        log.append(line)
        print("S6RESULT \(line)")
    }

    private func run() async {
        let api = URL(string: LaunchArgs.value("-api") ?? "http://127.0.0.1:3100/api/v1")!
        let auth = LaunchArgs.value("-auth") ?? "http://127.0.0.1:9099"
        guard let email = LaunchArgs.value("-email"), let password = LaunchArgs.value("-password") else {
            report("missing -email / -password launch arguments")
            return
        }
        do {
            // 1. No token → the contract's 401 (ApiError body).
            let anonymous = Client(serverURL: api, transport: URLSessionTransport())
            switch try await anonymous.getMe() {
            case let .unauthorized(r): report("no token → 401 \(try r.body.json.error.code.rawValue)")
            default: report("no token → unexpected")
            }

            // 2. Sign in (Auth emulator REST, same as the Firebase SDK does) → ID token.
            let token = try await signIn(auth: auth, email: email, password: password)
            let client = Client(serverURL: api, transport: URLSessionTransport(), middlewares: [BearerAuth(token: token)])

            // 3. Typed calls.
            if case let .ok(r) = try await client.getMe() {
                let me = try r.body.json
                report("me → @\(me.handle) (\(me.initials))")
            }
            if case let .ok(r) = try await client.getFeed(query: .init(limit: 5)) {
                let page = try r.body.json
                report("feed → \(page.cards.count) cards: " + page.cards.map { "\($0.title) by \($0.author?.value1.handle ?? "anonymous")" }.joined(separator: " | "))
            }
            for attempt in 1...2 {
                switch try await client.createInvite(body: .json(.init(toUserId: "carol", message: "從 iOS 送出的邀請"))) {
                case let .created(r): report("invite #\(attempt) → 201 id=\(try r.body.json.id)")
                case let .conflict(r): report("invite #\(attempt) → 409 \(try r.body.json.error.message)")
                case let .tooManyRequests(r): report("invite #\(attempt) → 429 \(try r.body.json.error.message)")
                default: report("invite #\(attempt) → unexpected")
                }
            }
            switch try await client.createInvite(body: .json(.init(toUserId: "carol", message: "   "))) {
            case let .badRequest(r):
                let e = try r.body.json.error
                report("blank message → 400 \(e.code.rawValue) at \(e.issues?.map(\.path) ?? [])")
            default: report("blank message → unexpected")
            }
            report("done")
        } catch {
            report("error: \(error)")
        }
    }

    private func signIn(auth: String, email: String, password: String) async throws -> String {
        var req = URLRequest(url: URL(string: "\(auth)/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password, "returnSecureToken": true])
        let (data, _) = try await URLSession.shared.data(for: req)
        struct Token: Decodable { let idToken: String }
        return try JSONDecoder().decode(Token.self, from: data).idToken
    }
}

/// Adds `Authorization: Bearer <Firebase ID token>` to every call.
struct BearerAuth: ClientMiddleware {
    let token: String
    func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.headerFields[.authorization] = "Bearer \(token)"
        return try await next(request, body, baseURL)
    }
}
