import Foundation
import Testing
@testable import ResonanceKit

/// A message document read as the thread draws it: the quote, the preview and its picture, old
/// messages without either (the same cases as Android's ChatMessageTest).
@Suite struct ChatMessageTests {
    let origin = URL(string: "http://127.0.0.1:3300")!
    let at = Date(timeIntervalSince1970: 1)
    func read(_ fields: [String: Any]) -> ChatMessage { ChatMessage.from(id: "m1", fields: fields, sentAt: at, origin: origin) }
    func preview(_ fields: [String: Any]) -> LinkPreview? { read(["preview": fields]).preview }

    @Test func anOldMessageHasNeitherAQuoteNorAPreview() {
        let m = read(["senderId": "alice", "text": "hi"])
        #expect(m == ChatMessage(id: "m1", senderId: "alice", text: "hi", sentAt: at))
        #expect(m.replyTo == nil && m.preview == nil)
        #expect(m.key == "m1")
        #expect(m.canReply && !m.isPending)
    }

    @Test func aSharedCardAndANoteComeThrough() {
        let m = read(["senderId": "bob", "text": "", "cardRef": "walk", "noteRef": ["cardId": "walk", "noteId": "n1"]])
        #expect(m.cardRef == "walk")
        #expect(m.noteRef == MessagingAPI.NoteRef(cardId: "walk", noteId: "n1"))
        // An empty card reference is none, and half a note is no note.
        #expect(read(["cardRef": ""]).cardRef == nil)
        #expect(read(["noteRef": ["cardId": "walk"]]).noteRef == nil)
    }

    @Test func aNoteLeftOnACardIsMarkedAndAnyOtherKindIsAPlainMessage() {
        let note = read(["senderId": "bob", "text": "我也是", "cardRef": "walk", "kind": "note"])
        #expect(note.isNote)
        #expect(note.cardRef == "walk" && note.noteRef == nil)
        #expect(!read(["senderId": "bob", "text": "hi"]).isNote)
        // A kind the server may add one day, or a note that lost its card, is drawn as words.
        #expect(!read(["text": "hi", "cardRef": "walk", "kind": "poll"]).isNote)
        #expect(!read(["text": "hi", "kind": "note"]).isNote)
        #expect(!read(["text": "hi", "cardRef": "", "kind": "note"]).isNote)
        #expect(!read(["text": "hi", "cardRef": "walk", "kind": 7]).isNote)
    }

    @Test func aReplyKeepsTheQuoteTheServerSnapshotted() {
        let m = read(["senderId": "bob", "text": "agreed",
                      "replyTo": ["id": "m0", "senderId": "alice", "text": "shall we?", "cardRef": "walk"]])
        #expect(m.replyTo == ReplyQuote(id: "m0", senderId: "alice", text: "shall we?", cardRef: "walk"))
        // A quote of a card alone has no text.
        #expect(read(["replyTo": ["id": "m0", "senderId": "alice", "text": ""]]).replyTo == ReplyQuote(id: "m0", senderId: "alice", text: ""))
        // Without an id there is nothing to quote.
        #expect(read(["replyTo": ["senderId": "alice", "text": "x"]]).replyTo == nil)
    }

    @Test func aQuoteIsCutAtOneHundredFortyCodePoints() throws {
        let long = String(repeating: "🙂", count: 200)
        let quote = try #require(read(["replyTo": ["id": "m0", "senderId": "alice", "text": long]]).replyTo)
        #expect(quote.text.unicodeScalars.count == 140)
        #expect(quote.text == String(repeating: "🙂", count: 140))
        #expect(ReplyQuote.cut("short") == "short")
    }

    @Test func aPreviewComesWithItsPictureResolvedAgainstTheApiOrigin() throws {
        let p = try #require(preview([
            "url": "https://example.com/a", "title": " Example page ", "description": "About it", "siteName": "Example",
            "image": "/api/link-image?u=https%3A%2F%2Fexample.com%2Fi.png&s=abc",
        ]))
        #expect(p.url.absoluteString == "https://example.com/a")
        #expect(p.link.host == "example.com" && !p.link.suspicious)
        #expect(p.title == "Example page")
        #expect(p.description == "About it")
        #expect(p.siteName == "Example")
        #expect(p.imageURL?.absoluteString == "http://127.0.0.1:3300/api/link-image?u=https%3A%2F%2Fexample.com%2Fi.png&s=abc")
    }

    @Test func aPreviewNeedsATitleAndALinkWeWouldOpen() throws {
        #expect(preview(["url": "https://example.com/", "title": "  "]) == nil)
        #expect(preview(["url": "https://example.com/"]) == nil)
        #expect(preview(["url": "javascript:alert(1)", "title": "x"]) == nil)
        #expect(preview(["url": "https://user@example.com/", "title": "x"]) == nil)
        #expect(preview(["title": "x"]) == nil)
        let bare = try #require(preview(["url": "https://example.com", "title": "x"]))
        #expect(bare.url.absoluteString == "https://example.com/")
        #expect(bare.description == nil && bare.imageURL == nil)
        // A lookalike host opens only after asking.
        #expect(preview(["url": "https://xn--pple-43d.com/", "title": "x"])?.link.suspicious == true)
    }

    @Test func onlyOurImageProxyMakesAPicture() {
        func image(_ path: Any?) -> URL? { preview(["url": "https://example.com/", "title": "x", "image": path as Any])?.imageURL }
        #expect(image("https://tracker.example.net/pixel.gif") == nil)
        #expect(image("//tracker.example.net/pixel.gif") == nil)
        #expect(image("/other/path.png") == nil)
        #expect(image("/api/link-image") == nil)
        #expect(image("/api/link-image?u=a b") == nil)
        #expect(image("/api/link-image?u=a\nb") == nil)
        #expect(image(42) == nil)
        #expect(image(nil) == nil)
        #expect(image("/api/link-image?u=x&s=y")?.absoluteString == "http://127.0.0.1:3300/api/link-image?u=x&s=y")
        #expect(ChatMessage.imageURL("/api/link-image?u=x", origin: URL(string: "https://resonance.channel/")!)?.absoluteString
            == "https://resonance.channel/api/link-image?u=x")
    }

    @Test func aMessageOnItsWayCantBeRepliedTo() {
        for delivery in [Delivery.sending, .sent, .failed] {
            let m = ChatMessage(id: "c1", senderId: "alice", text: "hi", sentAt: at, delivery: delivery)
            #expect(m.isPending == (delivery != .delivered))
            #expect(!m.canReply)
        }
    }

    @Test func aReplyToAMessageQuotesItsFirstWordsAndItsCard() {
        let original = ChatMessage(id: "m0", senderId: "alice", text: String(repeating: "x", count: 300), sentAt: at, cardRef: "walk")
        #expect(ReplyQuote.of(original) == ReplyQuote(id: "m0", senderId: "alice", text: String(repeating: "x", count: 140), cardRef: "walk"))
    }

    @Test func messagesSentInTheSameInstantKeepAnOrderById() {
        let a = ChatMessage(id: "a", senderId: "x", text: "", sentAt: at)
        let b = ChatMessage(id: "b", senderId: "x", text: "", sentAt: at)
        let later = ChatMessage(id: "0", senderId: "x", text: "", sentAt: at.addingTimeInterval(1))
        #expect(ChatMessage.isOrderedBefore(a, b) && !ChatMessage.isOrderedBefore(b, a))
        #expect(ChatMessage.isOrderedBefore(b, later))
    }
}
