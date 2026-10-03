import SwiftUI

// MARK: - Modal

extension View {
    /// The web's Modal: a wobbly card on the warm backdrop, over the whole
    /// screen (tab bar, status bar and home indicator included). There is no ✕:
    /// a modal's ways out are the buttons at its foot (one with nothing else
    /// there ends in a ``ModalCloseButton``), a tap beside the card, and
    /// VoiceOver's escape — none of them while `dismissible` is false (an
    /// action in flight). `closeLabel` is what the backdrop says it does to
    /// VoiceOver: the modal's own cancel or close words.
    public func organicModal<Card: View>(isPresented: Binding<Bool>, seed: Double = 17, maxWidth: CGFloat = 440,
                                         closeLabel: String, dismissible: Bool = true,
                                         @ViewBuilder content: @escaping () -> Card) -> some View {
        modifier(OrganicModalPresenter(isPresented: isPresented, seed: seed, maxWidth: maxWidth,
                                       closeLabel: closeLabel, dismissible: dismissible, card: content))
    }

    /// ConfirmModal: title, a line of explanation, then cancel and the verb at
    /// the bottom right. The modal is the frame, so neither button draws one:
    /// cancel is plain text, the verb a solid fill — red when it can't be
    /// undone (`destructive`). `error` shows under the text in the danger ink
    /// when the action didn't go through.
    public func organicConfirm(isPresented: Binding<Bool>, title: String, message: String, cancelLabel: String,
                               confirmLabel: String, closeLabel: String, busy: Bool = false, error: String? = nil,
                               destructive: Bool = false, seed: Double = 67, onConfirm: @escaping () -> Void) -> some View {
        organicModal(isPresented: isPresented, seed: seed, maxWidth: 400, closeLabel: closeLabel, dismissible: !busy) {
            OrganicConfirmContent(title: title, message: message, cancelLabel: cancelLabel, confirmLabel: confirmLabel,
                                  busy: busy, error: error, destructive: destructive,
                                  onCancel: { isPresented.wrappedValue = false }, onConfirm: onConfirm)
        }
    }
}

/// ConfirmModal's inside, for hosts that compose their own modal.
public struct OrganicConfirmContent: View {
    let title: String
    let message: String
    let cancelLabel: String
    let confirmLabel: String
    var busy: Bool
    var error: String?
    var destructive: Bool
    let onCancel: () -> Void
    let onConfirm: () -> Void

    public init(title: String, message: String, cancelLabel: String, confirmLabel: String, busy: Bool = false,
                error: String? = nil, destructive: Bool = false, onCancel: @escaping () -> Void, onConfirm: @escaping () -> Void) {
        self.title = title
        self.message = message
        self.cancelLabel = cancelLabel
        self.confirmLabel = confirmLabel
        self.busy = busy
        self.error = error
        self.destructive = destructive
        self.onCancel = onCancel
        self.onConfirm = onConfirm
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(title).padding(.bottom, 8)
            ModalBody(message).padding(.bottom, error == nil ? 18 : 10)
            if let error {
                ModalError(error).padding(.bottom, 14)
            }
            ModalActions {
                OrganicButton(cancelLabel, variant: .text, size: .sm, action: onCancel)
                OrganicButton(busy ? "…" : confirmLabel, variant: destructive ? .danger : .solid, size: .sm, action: onConfirm)
            }
            .disabled(busy)
        }
    }
}

/// A dialog's heading: Playfair 20, bold.
public struct ModalTitle: View {
    let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text)
            .font(AppFonts.heading(20))
            .foregroundStyle(Tokens.text)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A dialog's explanation: 14 on a 1.6 line, muted.
public struct ModalBody: View {
    let text: String
    var color: Color
    public init(_ text: String, color: Color = Tokens.textMuted) {
        self.text = text
        self.color = color
    }
    public var body: some View {
        CSSText(text, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.6, color: UIColor(color))
    }
}

/// An action that didn't go through: 13pt in the danger ink.
public struct ModalError: View {
    let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text)
            .font(AppFonts.body(13))
            .foregroundStyle(Tokens.danger)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isStaticText)
    }
}

/// Dialog actions: bottom right, 10 apart; dimmed together while busy.
public struct ModalActions<Content: View>: View {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View {
        HStack(spacing: 10) { content }
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

/// The way out of a modal with nothing else at its foot (a list to look
/// through, a note just sent): its close words as a quiet text button,
/// centred under the content. Where there is a choice (cancel and a verb)
/// the two sit at the bottom right instead, in ``ModalActions``. Android's
/// ModalCloseButton.
public struct ModalCloseButton: View {
    let label: String
    let action: () -> Void

    public init(_ label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    public var body: some View {
        OrganicButton(label, variant: .text, size: .sm, action: action)
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
    }
}

struct OrganicModalPresenter<Card: View>: ViewModifier {
    @Binding var isPresented: Bool
    let seed: Double
    let maxWidth: CGFloat
    let closeLabel: String
    let dismissible: Bool
    let card: () -> Card
    /// The cover itself; it comes and goes without UIKit's slide, and the
    /// stage inside fades and pops like the web's dialog.
    @State private var coverShown = false

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $coverShown) {
                OrganicModalStage(isPresented: $isPresented, coverShown: $coverShown, seed: seed, maxWidth: maxWidth,
                                  closeLabel: closeLabel, dismissible: dismissible, card: card)
                    .presentationBackground(.clear)
            }
            .onChange(of: isPresented, initial: true) { _, show in
                if show && !coverShown {
                    withTransaction(\.disablesAnimations, true) { coverShown = true }
                }
            }
    }
}

struct OrganicModalStage<Card: View>: View {
    @Binding var isPresented: Bool
    @Binding var coverShown: Bool
    let seed: Double
    let maxWidth: CGFloat
    let closeLabel: String
    let dismissible: Bool
    let card: () -> Card
    @State private var shown = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Over the whole screen, the status bar and the home indicator too, so no band
                // of another brightness is left at either end. For VoiceOver it is the way out,
                // read after the card (whose ✕ it used to be).
                Tokens.backdrop
                    .ignoresSafeArea()
                    .opacity(shown ? 1 : 0)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: close)
                    .accessibilityElement()
                    .accessibilityLabel(closeLabel)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction(.default, close)
                    .accessibilityHidden(!dismissible)
                // The backdrop scrolls when the dialog is taller than the screen
                // (the web's overflow-y: auto); a tap beside the card closes it.
                ScrollView {
                    OrganicModalCard(seed: seed, maxWidth: maxWidth, content: card)
                        .contentShape(Rectangle())
                        .onTapGesture {}
                        .scaleEffect(shown ? 1 : 0.96)
                        .opacity(shown ? 1 : 0)
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: geo.size.height)
                        .contentShape(Rectangle())
                        .onTapGesture(perform: close)
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollIndicators(.hidden)
                .accessibilitySortPriority(1)
            }
            // VoiceOver stays inside (the card and the backdrop's close), and its escape closes.
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityAction(.escape, close)
        }
        .onAppear {
            withAnimation(.timingCurve(0.2, 0.9, 0.3, 1.05, duration: 0.28)) { shown = true }
        }
        .onChange(of: isPresented) { _, open in
            guard !open else { return }
            withAnimation(.easeIn(duration: 0.16)) { shown = false } completion: {
                withTransaction(\.disablesAnimations, true) { coverShown = false }
            }
        }
    }

    private func close() {
        if dismissible { isPresented = false }
    }
}

/// The dialog card: card paper with grain in the wobbly outline — radius 26,
/// the wobble 2.5% of its short side, three or four turns across and five or
/// six down — and the ink border.
struct OrganicModalCard<Content: View>: View {
    let seed: Double
    let maxWidth: CGFloat
    let content: () -> Content

    var body: some View {
        let shape = ModalShape(seed: seed)
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(.horizontal, 28)
            .padding(.vertical, 32)
            .frame(maxWidth: maxWidth, alignment: .leading)
            .background {
                shape.fill(Tokens.cardBg)
                GrainLayer(shape: shape, mode: .tile, opacity: 0.3, tile: "grain-card")
                shape.stroke(Tokens.modalBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
            .accessibilityElement(children: .contain)
    }
}

nonisolated struct ModalShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let m = Double(min(rect.width, rect.height)) * 0.025
        return WobRectShape(radius: 26, seed: seed, mag: m, options: WobRectOptions(
            curve: 0.6, cornerJitter: 0.9, cornerOffset: 5, segmentsH: .range(3, 4), segmentsV: .range(5, 6)))
            .path(in: rect)
    }
}
