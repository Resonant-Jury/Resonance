import DesignSystem
import ResonanceKit
import SwiftUI

/// Which of the viewer's published cards may resonate with the card `target` (the web's
/// `resonateChoices`): the public ones not answering a card already (one card answers one card),
/// never the target itself nor the card the target answers (it would answer its own answer).
/// `hidden` counts the public cards left out for answering another card — the picker says why
/// they are missing; `open` all the public cards there are to choose from, left out or not — none
/// at all is when the viewer has "no public cards yet".
struct ResonateChoices {
    let cards: [FeedCard]
    let hidden: Int
    let open: Int

    static func of(_ cards: [FeedCard], target: String, targetReference: String?) -> ResonateChoices {
        let open = cards.filter { $0.visibility == ._public && $0.publishedAt != nil && $0.id != target }
        return ResonateChoices(cards: open.filter { $0.referenceCardId == nil && $0.id != targetReference },
                               hidden: open.filter { $0.referenceCardId != nil && $0.referenceCardId != target }.count,
                               open: open.count)
    }

    /// What stands in the list's place when none is listed: "no public cards yet" only when there
    /// are none; when every one answers another card already, why they aren't listed (once — no
    /// footnote under it); otherwise nothing.
    var emptyNote: String? {
        guard cards.isEmpty else { return nil }
        if open == 0 { return L10n.Card.ResonatePicker.empty }
        return hidden > 0 ? L10n.Card.ResonatePicker.hiddenNote : nil
    }

    /// The quiet line under the cards listed: some were left out for answering another card.
    var footnote: String? { !cards.isEmpty && hidden > 0 ? L10n.Card.ResonatePicker.hiddenNote : nil }

    /// Public cards there are, but none may answer this one and none was left out for answering
    /// another (the only one is the card this one answers): nothing to pick and nothing to say, so
    /// no rule and no "Or pick one you've written" over an empty list — only the way to write one.
    var nothingToPick: Bool { open > 0 && cards.isEmpty && hidden == 0 }
}

/// 共振 opens this (ResonatePicker.tsx): write a new card in answer — the writer, as before — or
/// pick one of your published public cards about something similar, which the server then points
/// at this card (POST /api/v1/cards/{id}/resonances). A tap marks a card and 共振 confirms it: the
/// choice rings someone's phone, so a stray tap in a scrolling list must not send it.
///
/// A quiet list (round 4, variant A): the title alone; "write a new card" as one terracotta line
/// with the pen; one wavy rule; rows of a 40pt thumb, the title on one line and one muted line
/// (when it came out, 匿名 · first for an anonymous card); why some cards are missing only when
/// some are; the error line; then cancel | 共振.
struct ResonatePickerContent: View {
    /// The card being answered, and the card it answers itself (never offered).
    let targetId: String
    let targetReferenceId: String?
    /// A request is on its way: the modal stays until it is answered.
    @Binding var busy: Bool
    let onWriteNew: () -> Void
    /// The card that now resonates, once the server said so.
    let onResonated: (FeedCard) -> Void
    let onCancel: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var cards: [FeedCard]?
    @State private var readFailed = false
    @State private var selectedId: String?
    @State private var failure: String?

    var body: some View {
        let choices = cards.map { ResonateChoices.of($0, target: targetId, targetReference: targetReferenceId) }
        VStack(alignment: .leading, spacing: 0) {
            // The title alone: the two ways below say what they are.
            ModalTitle(L10n.Card.ResonatePicker.title).padding(.bottom, 12)
            CardPickList(cards: choices?.cards ?? [], choosing: true, selectedId: selectedId, disabled: busy,
                         label: L10n.Card.ResonatePicker.title, anonymousLabel: L10n.Card.ResonatePicker.anonymous,
                         footnote: choices?.footnote, onPick: choose) {
                WriteNewRow(action: onWriteNew).disabled(busy)
                // Nothing to pick and nothing to say: no rule over an empty list.
                if choices?.nothingToPick != true {
                    WavyDivider(seed: 59).padding(.vertical, 8)
                }
            } empty: {
                if let choices {
                    // Public cards there are, only none may answer this one: never "no public cards yet".
                    if let note = choices.emptyNote {
                        Text(note)
                            .font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).lineSpacing(14 * 0.5)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 6).padding(.top, 10).padding(.bottom, 4)
                    }
                } else if readFailed {
                    HStack(spacing: 10) {
                        Text(L10n.Native.loadError).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                        OrganicButton(L10n.Native.retry, variant: .tonal, size: .sm) { Task { await load() } }
                    }
                    .padding(.horizontal, 6).padding(.top, 6)
                } else {
                    PickSkeleton()
                }
            }
            if let failure {
                ModalError(failure).padding(.bottom, 12)
            }
            ModalActions {
                // The modal is the frame: cancel is the tonal pill, out of reach while the choice is on its way.
                OrganicButton(L10n.Card.ResonatePicker.cancel, variant: .tonal, size: .sm, action: onCancel)
                    .disabled(busy)
            } verb: {
                // While the server answers, the pen keeps inking where the wave was (the web's SketchLoader).
                OrganicButton(L10n.Card.ResonatePicker.confirm, icon: .wave, variant: .solid, size: .sm) {
                    Task { await confirm() }
                }
                .working(busy)
                .disabled(selectedId == nil)
            }
        }
        .task { await load() }
    }

    /// The card box's published shelf (the server's, so anonymous and answering cards say so).
    private func load() async {
        readFailed = false
        do {
            cards = try await session.reading.cardBox(.published)
        } catch {
            readFailed = cards == nil
        }
    }

    private func choose(_ card: FeedCard) {
        guard !busy else { return }
        failure = nil
        selectedId = card.id
    }

    private func confirm() async {
        guard let selectedId, !busy else { return }
        busy = true
        failure = nil
        defer { busy = false }
        do {
            let result = try await session.writing.resonate(with: targetId, cardId: selectedId)
            session.cardPreviews.remember(result.card)
            onResonated(result.card)
        } catch let refused as APIFailure where refused.status == 409 {
            failure = L10n.Card.ResonatePicker.alreadyAnswering
            // What was listed is out of date (the card answers another by now, or another of yours answers this one).
            self.selectedId = nil
            await load()
        } catch {
            failure = L10n.Card.ResonatePicker.failed
        }
    }
}

/// Row 0: write a new card in answer — one line, a way rather than a card: the pen in terracotta
/// and the words in the deep terracotta (6.3:1 on the modal's paper), 44pt tall; pressed, the
/// words darken and the story link's pen wave runs under them, as a row's ink answers.
private struct WriteNewRow: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                OrganicIcon(.pen, size: 18, color: Tokens.terracotta)
                WriteNewWords()
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10).padding(.horizontal, 6)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(WriteNewStyle())
    }
}

/// The words, with the story link's wave under them while pressed (LinkWaves' depth and pen).
private struct WriteNewWords: View {
    @Environment(\.writeNewPressed) private var pressed
    private let size: CGFloat = 15

    var body: some View {
        Text(L10n.Card.ResonatePicker.writeNew).font(AppFonts.body(size, weight: .semibold))
            .overlay(alignment: .bottomLeading) {
                PenWaveShape(seed: 59, amp: 1.2)
                    .stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                    .frame(height: 6)
                    // The wave's centre LinkWaves.depthEm under the baseline (the line box's foot is ~0.27em under it).
                    .offset(y: LinkWaves.drop(fontSize: size) - size * 0.27 + 3)
                    .opacity(pressed ? 1 : 0)
                    .accessibilityHidden(true)
            }
    }
}

private extension EnvironmentValues {
    @Entry var writeNewPressed = false
}

private struct WriteNewStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? WriteNewStyle.pressedInk : Tokens.buttonOnTonal)
            .environment(\.writeNewPressed, configuration.isPressed)
            .opacity(isEnabled ? 1 : 0.5)
    }

    /// color-mix(in oklch, terracotta, black 34%): the words' ink under a finger.
    static let pressedInk = OKLCHColor.color(0.62 * 0.66, 0.14 * 0.66, 45)
}

/// The rows' footprint while the shelf is read: plain blocks, nothing drawn before it is measured.
private struct PickSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(0..<3, id: \.self) { i in
                HStack(spacing: 12) {
                    SkeletonBlock(width: 40, height: 40, radius: 12)
                    VStack(alignment: .leading, spacing: 7) {
                        SkeletonBlock(fraction: 0.7 - Double(i) * 0.12, height: 14)
                        SkeletonBlock(width: 64, height: 11)
                    }
                }
            }
        }
        .padding(.horizontal, 6).padding(.top, 10).padding(.bottom, 6)
        .accessibilityHidden(true)
    }
}
