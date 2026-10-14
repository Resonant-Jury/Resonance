import SwiftUI

/// A list scrolling inside a dialog or a popover (a card picker, the thread's 卡片與連結, the blocked
/// list, the thought map's tray) fades a little on the side it can still scroll toward — a hint that
/// more is there, never a frame: the web's useEdgeFades, 16 at either end. The card page's table of
/// contents fades its list the same way over a longer passage.
public enum ScrollEdgeFades {
    /// The fade's length at an edge the list can still scroll toward.
    public static let length: CGFloat = 16

    /// Which ends fade, from a scroller's place and extent: the top once it has left its top, the
    /// foot while it is short of its foot (a range of a point or less is no scroll at all).
    public static func edges(offset: CGFloat, content: CGFloat, visible: CGFloat) -> (above: Bool, below: Bool) {
        let range = content - visible
        return (range > 1 && offset > 1, range > 1 && offset < range - 1)
    }
}

extension View {
    /// Fades this scroll view's ends while it can still scroll toward them (``ScrollEdgeFades``).
    /// Apply it to the scroll view itself.
    public func scrollEdgeFades(_ length: CGFloat = ScrollEdgeFades.length) -> some View {
        modifier(ScrollEdgeFadesModifier(length: length))
    }
}

private struct ScrollEdgeFadesModifier: ViewModifier {
    let length: CGFloat
    @State private var above = false
    @State private var below = false

    private struct Ends: Equatable {
        var above: Bool
        var below: Bool
    }

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Ends.self) { geo in
                let insets = geo.contentInsets
                let ends = ScrollEdgeFades.edges(offset: geo.contentOffset.y + insets.top,
                                                 content: geo.contentSize.height + insets.top + insets.bottom,
                                                 visible: geo.containerSize.height)
                return Ends(above: ends.above, below: ends.below)
            } action: { _, ends in
                above = ends.above
                below = ends.below
            }
            .mask {
                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
                        .frame(height: above ? length : 0)
                    Color.black
                    LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                        .frame(height: below ? length : 0)
                }
                .animation(.easeOut(duration: 0.15), value: above)
                .animation(.easeOut(duration: 0.15), value: below)
            }
    }
}
