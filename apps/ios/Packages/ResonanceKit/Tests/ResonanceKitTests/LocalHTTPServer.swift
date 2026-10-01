import Foundation
import Network

/// A real HTTP/1.1 server on 127.0.0.1, so URLSession and its URLCache run
/// exactly as in the app (a stubbed transport would skip them). It answers
/// with what `respond` returns and records every request that reached it —
/// one served from the cache never does.
final class LocalHTTPServer: @unchecked Sendable {
    struct Request: Sendable {
        let method: String
        let path: String
        /// Header names lowercased.
        let headers: [String: String]
    }

    struct Response: Sendable {
        var status = 200
        var headers: [String: String] = [:]
        var body = ""
    }

    private let listener: NWListener
    private let queue = DispatchQueue(label: "local-http-server")
    private let lock = NSLock()
    private var _requests: [Request] = []
    private let respond: @Sendable (Request) -> Response

    var requests: [Request] { lock.withLock { _requests } }
    var port: UInt16 { listener.port?.rawValue ?? 0 }
    var origin: URL { URL(string: "http://127.0.0.1:\(port)")! }

    init(respond: @escaping @Sendable (Request) -> Response) throws {
        self.respond = respond
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { return }
            connection.start(queue: self.queue)
            self.read(connection, Data())
        }
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { if case .ready = $0 { ready.signal() } }
        listener.start(queue: queue)
        ready.wait()
    }

    deinit { listener.cancel() }

    /// Requests that reached the server for `path` (with its query), in order.
    func requests(to path: String) -> [Request] { requests.filter { $0.path == path } }

    private func read(_ connection: NWConnection, _ buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16) { [weak self] data, _, done, error in
            guard let self, error == nil else { return connection.cancel() }
            var buffer = buffer
            if let data { buffer.append(data) }
            // Every complete request in the buffer (head, then Content-Length bytes of body).
            while let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: buffer[buffer.startIndex..<end.lowerBound], as: UTF8.self)
                let lines = head.components(separatedBy: "\r\n")
                var headers: [String: String] = [:]
                for line in lines.dropFirst() {
                    guard let colon = line.firstIndex(of: ":") else { continue }
                    headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                }
                let length = Int(headers["content-length"] ?? "") ?? 0
                guard buffer.distance(from: end.upperBound, to: buffer.endIndex) >= length else { break }
                buffer = Data(buffer[buffer.index(end.upperBound, offsetBy: length)...])
                let parts = lines[0].split(separator: " ")
                let request = Request(method: parts.count > 0 ? String(parts[0]) : "",
                                      path: parts.count > 1 ? String(parts[1]) : "", headers: headers)
                lock.withLock { _requests.append(request) }
                connection.send(content: Self.encode(respond(request)), completion: .contentProcessed { _ in })
            }
            if done { connection.cancel() } else { self.read(connection, buffer) }
        }
    }

    private static func encode(_ response: Response) -> Data {
        let reason = [200: "OK", 201: "Created", 204: "No Content", 304: "Not Modified", 400: "Bad Request"][response.status] ?? "Status"
        var head = "HTTP/1.1 \(response.status) \(reason)\r\n"
        var headers = response.headers
        if response.status != 204, response.status != 304 {
            headers["Content-Length"] = "\(response.body.utf8.count)"
            headers["Content-Type"] = headers["Content-Type"] ?? "application/json"
        }
        for (name, value) in headers { head += "\(name): \(value)\r\n" }
        head += "\r\n"
        return Data(head.utf8) + (response.status == 304 || response.status == 204 ? Data() : Data(response.body.utf8))
    }
}
