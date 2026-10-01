import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// A value the contract adds to one of its enums later reaches installed apps
/// before they know it: the answer it is in still reads, through the clients
/// the app makes (`ResonanceClient.make`), with only that field approximated.
@Suite struct OpenEnumsTests {
    func reading(_ transport: StubTransport) -> ReadingAPI {
        ReadingAPI(client: ResonanceClient.make(APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in "t" }),
                                                transport: transport, middlewares: []))
    }

    func profiles(_ transport: StubTransport) -> ProfileAPI {
        ProfileAPI(client: ResonanceClient.make(APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in "t" }),
                                                transport: transport, middlewares: []))
    }

    static func card(_ id: String, visibility: String = "public") -> String {
        ReadingAPITests.card(id).replacingOccurrences(of: #""visibility":"public""#, with: #""visibility":"\#(visibility)""#)
    }

    @Test func aFeedWithAVisibilityFromTheFutureStillReads() async throws {
        let transport = StubTransport(body: #"{"cards":[\#(Self.card("c1", visibility: "followers")),\#(Self.card("c2"))],"nextCursor":null}"#)
        let page = try await reading(transport).feed()
        #expect(page.cards.map(\.id) == ["c1", "c2"])
        // Taken for the narrowest audience this build knows; the others are as sent.
        #expect(page.cards.map(\.visibility) == [._private, ._public])
        #expect(page.cards.first?.title == "一場雨後的散步")
    }

    @Test func aCardPageWithAnUnknownVisibilityStillReads() async throws {
        let detail = ReadingAPITests.detail(lists: "").replacingOccurrences(of: #""visibility":"public","anonymous""#,
                                                                            with: #""visibility":"followers","anonymous""#)
        let transport = StubTransport(body: detail)
        let card = try await reading(transport).card("a-walk")
        #expect(card.visibility == ._private)
        #expect(card.story == "[一場雨](/card/rain)\n\n")
    }

    @Test func aProfileWritingInALanguageTheAppDoesntKnowStillReads() async throws {
        let transport = StubTransport(body: """
        {"id":"u1","handle":"bob","initials":"BO","accentColor":"oklch(90% 0.05 60)","bio":"你好","avatarUrl":null,
         "region":"JP","primaryLocale":"ja","handleChangedAt":null}
        """)
        let me = try await profiles(transport).me()
        #expect(me?.handle == "bob")
        #expect(me?.bio == "你好")
        #expect(me?.primaryLocale == .en)
    }

    @Test func picksWithAStatusFromTheFutureStillRead() async throws {
        let transport = StubTransport(body: #"{"cards":[\#(Self.card("c1"))],"status":"warming"}"#)
        #expect(try await reading(transport).recommended().map(\.id) == ["c1"])
    }

    @Test func anErrorCodeFromTheFutureIsStillAnError() async throws {
        let transport = StubTransport(status: .notFound, body: #"{"error":{"code":"suspended","message":"This account is paused."}}"#)
        await #expect(throws: APIFailure(code: "internal", message: "This account is paused.", status: 404)) {
            try await reading(transport).card("a-walk")
        }
    }

    @Test func anAnswerWithNothingUnknownPassesUntouched() {
        let data = Data(#"{"cards":[\#(Self.card("c1"))],"status":"fresh"}"#.utf8)
        #expect(OpenEnums.normalize(data) == data)
        #expect(OpenEnums.normalize(Data("<html>".utf8)) == Data("<html>".utf8))
    }

    /// Every enum the contract's answers carry is in the table, by a property
    /// name no other answer field uses, with the values this build knows — so
    /// a new enum in an answer fails here until it is covered.
    @Test func theTableCoversEveryEnumInTheContractsAnswers() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../../../openapi/v1/openapi.json").standardized
        let spec = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let schemas = try #require((spec["components"] as? [String: Any])?["schemas"] as? [String: Any])

        // The schemas reachable from any response.
        var reachable = Set<String>()
        func refs(_ node: Any) -> [String] {
            if let object = node as? [String: Any] {
                let own = (object["$ref"] as? String).map { [String($0.split(separator: "/").last!)] } ?? []
                return own + object.values.flatMap(refs)
            }
            if let array = node as? [Any] { return array.flatMap(refs) }
            return []
        }
        var queue = ((spec["paths"] as? [String: Any]) ?? [:]).values
            .flatMap { ($0 as? [String: Any])?.values.map { ($0 as? [String: Any])?["responses"] ?? [:] } ?? [] }
            .flatMap(refs)
        while let name = queue.popLast() {
            guard reachable.insert(name).inserted, let schema = schemas[name] else { continue }
            queue += refs(schema)
        }

        // Each property name in those schemas, and the enum values it carries (nil: not an enum).
        var properties: [String: [Set<String>?]] = [:]
        func collect(_ node: Any) {
            guard let object = node as? [String: Any] else {
                (node as? [Any])?.forEach(collect)
                return
            }
            for (name, property) in (object["properties"] as? [String: Any]) ?? [:] {
                let p = property as? [String: Any] ?? [:]
                var values = (p["enum"] as? [String]).map(Set.init)
                if let ref = p["$ref"] as? String, let target = schemas[String(ref.split(separator: "/").last!)] as? [String: Any],
                   let e = target["enum"] as? [String] { values = Set(e) }
                properties[name, default: []].append(values)
            }
            object.values.forEach(collect)
        }
        for name in reachable { collect(schemas[name] as Any) }

        let enums = properties.filter { $0.value.contains { $0 != nil } }
        #expect(Set(enums.keys) == Set(OpenEnums.fields.keys))
        for (name, uses) in enums {
            #expect(!uses.contains { $0 == nil }, "\(name) is also a plain field somewhere")
            let field = try #require(OpenEnums.fields[name])
            #expect(uses.allSatisfy { $0 == field.known }, "\(name)")
            #expect(field.known.contains(field.fallback))
        }
    }
}
