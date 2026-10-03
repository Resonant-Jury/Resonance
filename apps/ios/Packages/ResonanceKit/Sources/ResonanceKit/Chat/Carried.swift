import Foundation

/// Where a shared card asked for stands (GET /api/v1/cards?keys=): on its way, found, hidden from
/// the reader (gone, private, by someone they blocked, no card by that key), or not read (offline,
/// a server error — the next read asks again).
public enum CardLookup<Card> {
    case loading
    case found(Card)
    case hidden
    case failed
}

extension CardLookup: Equatable where Card: Equatable {}
extension CardLookup: Sendable where Card: Sendable {}

/// What a message's bubble carries besides its words — decided from the card it shares and what
/// is known of that card: the card itself once read and the reader's to see, its stand-in while it
/// is read; otherwise its link's preview, or its words alone. A card the reader can't see falls
/// back: a link to it is a link again (with its preview, if the server made one); a card shared
/// with the button shows nothing of itself. Pure; the twin of Android's `Carried`.
public enum Carried<Card> {
    /// Its words alone (or a reply to a note).
    case words
    /// A link's unfurled page.
    case preview(LinkPreview)
    /// A card of the site, shared with the button or linked to.
    case card(Card, CardShare)
    /// A card still being read: the bubble's plain stand-in.
    case cardLoading(CardShare)
    /// Nothing at all: a card the reader can't see, sent without words.
    case nothing

    /// `share` is the card `message` shares (`ChatMessage.cardShare`); `lookup` says where a card
    /// asked for by its key stands.
    public static func of(_ message: ChatMessage, share: CardShare?, lookup: (String) -> CardLookup<Card>) -> Carried {
        if let share {
            switch lookup(share.key) {
            case let .found(card): return .card(card, share)
            case .loading: return .cardLoading(share)
            // A card shared with the button has nothing else to stand for it: it waits for the next read.
            case .failed where share.link == nil: return .cardLoading(share)
            case .failed, .hidden: break
            }
        }
        if let preview = message.preview { return .preview(preview) }
        return message.text.isEmpty && message.noteRef == nil ? .nothing : .words
    }

    /// The words the bubble shows with what it carries: all of them — except that a card stands
    /// for the link to it, so a message that is that link alone shows none.
    public func words(of message: ChatMessage) -> String {
        switch self {
        case let .card(_, share), let .cardLoading(share): share.text
        case .words, .preview, .nothing: message.text
        }
    }

    /// The bubble is the card's: a fixed width, the card (or its stand-in) under the words.
    public var isCard: Bool {
        switch self {
        case .card, .cardLoading: true
        default: false
        }
    }
}

extension Carried: Equatable where Card: Equatable {}
