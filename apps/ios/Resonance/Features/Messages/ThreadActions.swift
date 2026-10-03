import DesignSystem
import ResonanceKit
import SwiftUI

// What a long-press on a message offers (the feel of Messenger's and Instagram's): the thread
// dims, the message is lifted out of it where it lies, and the actions hang under it — Reply, Copy,
// the link it leads to (Open, Copy), and for one that didn't go, Retry and Delete — over a quiet
// line with the full time. The twin of Android's ThreadActions.

extension MessageMenu {
    /// The menu's rows for the message pressed.
    /// `copied` is told when something went to the clipboard (the thread says so: nothing else would).
    func items(model: ThreadModel, reply: @escaping () -> Void, openLink: @escaping (URL) -> Void,
               copied: @escaping () -> Void) -> [OrganicMenuItem] {
        let message = row.message
        var items: [OrganicMenuItem] = []
        if model.canReply(message) {
            items.append(OrganicMenuItem(id: "reply", title: L10n.Messages.reply, icon: .reply, action: reply))
        }
        if !message.text.isEmpty {
            items.append(OrganicMenuItem(id: "copy", title: L10n.Native.copy, icon: .copy) {
                UIPasteboard.general.string = message.text
                copied()
            })
        }
        if let link {
            items.append(OrganicMenuItem(id: "open-link", title: L10n.Messages.openLink, icon: .link) { openLink(link) })
            items.append(OrganicMenuItem(id: "copy-link", title: L10n.Messages.copyLink, icon: .copy) {
                UIPasteboard.general.url = link
                copied()
            })
        }
        if message.delivery == .failed {
            items.append(OrganicMenuItem(id: "retry", title: L10n.Messages.retry, icon: .send) { model.retry(message.key) })
            items.append(OrganicMenuItem(id: "discard", title: L10n.Messages.discardFailed, icon: .trash, danger: true) {
                model.discard(message.key)
            })
        }
        return items
    }
}

private let menuRow: CGFloat = 42
private let menuFooter: CGFloat = 38
private let menuGap: CGFloat = 10
private let menuMargin: CGFloat = 12

/// The long-press layer over the whole screen: the modals' scrim, the message drawn again where it lies
/// (a little lifted), and its menu under it — over it when there's no room below, and when there's
/// room neither way the message gives way. A tap on the scrim (or the escape gesture) puts it back.
struct MessageMenuOverlay: View {
    let menu: MessageMenu
    let ctx: ThreadContext
    let items: [OrganicMenuItem]
    let footer: String
    /// The screen's safe area (with the keyboard, when it is up): the menu stays inside it.
    let safe: EdgeInsets
    let onDismiss: () -> Void
    @State private var shown = false
    @State private var lifted = false
    @State private var leaving = false

    var body: some View {
        GeometryReader { geo in
            let screen = geo.frame(in: .global)
            let mine = ctx.model.isMine(menu.row.message)
            let frame = menu.frame.offsetBy(dx: -screen.minX, dy: -screen.minY)
            let place = Placement(frame: frame, height: geo.size.height, menuHeight: CGFloat(items.count) * menuRow + menuFooter, safe: safe)
            ZStack(alignment: .topLeading) {
                Tokens.backdrop.opacity(shown ? 1 : 0)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: dismiss)
                    .accessibilityHidden(true)
                MessageCore(row: menu.row, ctx: ctx, interactive: false)
                    .frame(width: frame.width, alignment: mine ? .trailing : .leading)
                    .scaleEffect(lifted ? 1.03 : 1, anchor: mine ? .trailing : .leading)
                    .offset(x: frame.minX, y: frame.minY + place.shift)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                HStack(spacing: 0) {
                    if mine { Spacer(minLength: 0) }
                    OrganicMenuPanel(items: items, seed: seedFromId(menu.row.message.key, start: 23), footer: footer) { item in
                        dismiss()
                        item.action()
                    }
                    .scaleEffect(shown ? 1 : 0.94, anchor: UnitPoint(x: mine ? 1 : 0, y: place.below ? 0 : 1))
                    .offset(y: shown ? 0 : (place.below ? -4 : 4))
                    .opacity(shown ? 1 : 0)
                    if !mine { Spacer(minLength: 0) }
                }
                .padding(.leading, mine ? menuMargin : max(frame.minX, menuMargin))
                .padding(.trailing, mine ? max(geo.size.width - frame.maxX, menuMargin) : menuMargin)
                .offset(y: place.menuY)
            }
        }
        .ignoresSafeArea()
        .accessibilityAction(.escape, dismiss)
        .onAppear {
            withAnimation(.easeOut(duration: 0.15)) { shown = true }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.55)) { lifted = true }
        }
    }

    /// The message settles back into its place as the scrim lifts, and the thread's own takes over.
    private func dismiss() {
        guard !leaving else { return }
        leaving = true
        withAnimation(.easeOut(duration: 0.12)) {
            shown = false
            lifted = false
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            onDismiss()
        }
    }

    /// Where the menu goes: under the message if it fits there, else over it; else the message gives way.
    private struct Placement {
        var below = true
        var shift: CGFloat = 0
        var menuY: CGFloat

        init(frame: CGRect, height: CGFloat, menuHeight: CGFloat, safe: EdgeInsets) {
            let top = safe.top + menuMargin
            let bottom = height - safe.bottom - menuMargin
            menuY = frame.maxY + menuGap
            guard menuY + menuHeight > bottom else { return }
            if frame.minY - menuGap - menuHeight >= top {
                below = false
                menuY = frame.minY - menuGap - menuHeight
            } else {
                menuY = max(top, bottom - menuHeight)
                shift = -min(max(0, frame.maxY + menuGap - menuY), max(0, frame.minY - top))
            }
        }
    }
}
