import SwiftUI

// MARK: - Modal

extension View {
    /// The web's Modal: a wobbly card on the warm backdrop, over everything
    /// (tab bar included). Tapping outside or the ✕ closes it unless
    /// `dismissible` is false (an action in flight).
    public func organicModal<Card: View>(isPresented: Binding<Bool>, seed: Double = 17, maxWidth: CGFloat = 440,
                                         closeLabel: String, dismissible: Bool = true,
                                         @ViewBuilder content: @escaping () -> Card) -> some View {
        modifier(OrganicModalPresenter(isPresented: isPresented, seed: seed, maxWidth: maxWidth,
                                       closeLabel: closeLabel, dismissible: dismissible, card: content))
    }

    /// ConfirmModal: title, a line of explanation, then ghost cancel and the
    /// primary verb at the bottom right. `error` shows under the text in the
    /// danger ink when the action didn't go through.
    public func organicConfirm(isPresented: Binding<Bool>, title: String, message: String, cancelLabel: String,
                               confirmLabel: String, closeLabel: String, busy: Bool = false, error: String? = nil,
                               seed: Double = 67, onConfirm: @escaping () -> Void) -> some View {
        organicModal(isPresented: isPresented, seed: seed, maxWidth: 400, closeLabel: closeLabel, dismissible: !busy) {
            OrganicConfirmContent(title: title, message: message, cancelLabel: cancelLabel, confirmLabel: confirmLabel,
                                  busy: busy, error: error, onCancel: { isPresented.wrappedValue = false },
                                  onConfirm: onConfirm)
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
    let onCancel: () -> Void
    let onConfirm: () -> Void

    public init(title: String, message: String, cancelLabel: String, confirmLabel: String, busy: Bool = false,
                error: String? = nil, onCancel: @escaping () -> Void, onConfirm: @escaping () -> Void) {
        self.title = title
        self.message = message
        self.cancelLabel = cancelLabel
        self.confirmLabel = confirmLabel
        self.busy = busy
        self.error = error
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
                OrganicButton(cancelLabel, variant: .ghost, size: .sm, action: onCancel)
                OrganicButton(busy ? "…" : confirmLabel, size: .sm, action: onConfirm)
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
        CSSText(text, font: AppFonts.uiFont(.body, size: 14), lineHeight: 1.6, color: UIColor(color))
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
                Tokens.backdrop
                    .ignoresSafeArea()
                    .opacity(shown ? 1 : 0)
                    .accessibilityHidden(true)
                // The backdrop scrolls when the dialog is taller than the screen
                // (the web's overflow-y: auto); a tap beside the card closes it.
                ScrollView {
                    OrganicModalCard(seed: seed, maxWidth: maxWidth, closeLabel: closeLabel,
                                     onClose: dismissible ? { isPresented = false } : nil, content: card)
                        .contentShape(Rectangle())
                        .onTapGesture {}
                        .scaleEffect(shown ? 1 : 0.96)
                        .opacity(shown ? 1 : 0)
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: geo.size.height)
                        .contentShape(Rectangle())
                        .onTapGesture { if dismissible { isPresented = false } }
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollIndicators(.hidden)
            }
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
}

/// The dialog card: card paper with grain in the wobbly outline — radius 26,
/// the wobble 2.5% of its short side, three or four turns across and five or
/// six down — the ink border, and the hand-drawn ✕.
struct OrganicModalCard<Content: View>: View {
    let seed: Double
    let maxWidth: CGFloat
    let closeLabel: String
    let onClose: (() -> Void)?
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
            .overlay(alignment: .topTrailing) {
                Button { onClose?() } label: {
                    ModalCloseMark()
                        .stroke(Tokens.text, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                        .frame(width: 18, height: 18)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .opacity(0.55)
                .padding(.top, 17)
                .padding(.trailing, 13)
                .accessibilityLabel(closeLabel)
            }
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
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

/// Modal.tsx's own ✕: two pen strokes in an 18-unit box.
nonisolated struct ModalCloseMark: Shape {
    func path(in rect: CGRect) -> Path {
        let s = Double(rect.width) / 18
        func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: Double(rect.minX) + x * s, y: Double(rect.minY) + y * s) }
        var p = Path()
        p.move(to: pt(4, 4.2))
        p.addCurve(to: pt(13.8, 13.9), control1: pt(7, 6.4), control2: pt(11.8, 7.2))
        p.move(to: pt(13.9, 4.1))
        p.addCurve(to: pt(4.1, 13.8), control1: pt(11.6, 7), control2: pt(7.1, 10.2))
        return p
    }
}
