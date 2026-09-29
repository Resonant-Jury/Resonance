import SwiftUI
import UIKit

/// Every finger on the map, raw — the web's pointer events (with capture),
/// so the store can run the web's own state machine: the 4px rule, a second
/// finger turning any gesture into a pinch about the fingers' midpoint.
struct MapTouchSurface: UIViewRepresentable {
    let store: ThoughtMapStore

    func makeUIView(context: Context) -> TouchView {
        let view = TouchView()
        view.store = store
        view.isMultipleTouchEnabled = true
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: TouchView, context: Context) {
        view.store = store
    }

    final class TouchView: UIView {
        weak var store: ThoughtMapStore?

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
            for t in touches { store?.touchDown(ObjectIdentifier(t), at: t.location(in: self)) }
        }

        override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
            for t in touches { store?.touchMove(ObjectIdentifier(t), to: t.location(in: self)) }
        }

        override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
            for t in touches { store?.touchUp(ObjectIdentifier(t), at: t.location(in: self)) }
        }

        override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
            store?.touchesCancelled()
        }
    }
}
