import Foundation
import ResonanceKit

/// One `Outbox` per conversation, kept for as long as the person is signed in: a message sent
/// from a thread goes on being sent when the thread is covered by a profile or left, and a failure
/// waits there to be retried when they come back. Emptied when the account signs out or another
/// signs in. The twin of Android's ChatOutboxes.
@MainActor
final class ChatOutboxes {
    private var boxes: [String: Outbox] = [:]
    private let messaging: () -> MessagingAPI
    /// The first message a person sends is the moment to ask for notifications (see `PushCenter.reachedOut`).
    private let sent: () -> Void

    init(messaging: @escaping () -> MessagingAPI, sent: @escaping () -> Void) {
        self.messaging = messaging
        self.sent = sent
    }

    /// The outbox of the conversation `pairId` with `to`.
    func of(_ pairId: String, to: String) -> Outbox {
        if let box = boxes[pairId] { return box }
        let messaging = messaging, sent = sent
        let box = Outbox { m in
            let answer = try await messaging().sendMessage(to: to, text: m.text, cardRef: m.cardRef, noteRef: m.noteRef,
                                                           replyTo: m.replyTo?.id, clientId: m.clientId)
            sent()
            return answer.id
        }
        boxes[pairId] = box
        return box
    }

    /// The conversation was deleted: what was waiting to go to it goes too.
    func forget(_ pairId: String) {
        boxes.removeValue(forKey: pairId)?.clear()
    }

    func clear() {
        boxes.values.forEach { $0.clear() }
        boxes = [:]
    }
}
