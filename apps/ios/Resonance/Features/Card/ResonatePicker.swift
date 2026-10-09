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
            ModalTitle(L10n.Card.ResonatePicker.title).padding(.bottom, 4)
            Text(L10n.Card.ResonatePicker.subtitle)
                .font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).lineSpacing(14 * 0.4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 12)
            CardPickList(cards: choices?.cards ?? [], choosing: true, selectedId: selectedId, disabled: busy,
                         anonymousLabel: L10n.Card.ResonatePicker.anonymous, footnote: choices?.footnote,
                         onPick: choose) {
                WriteNewRow(action: onWriteNew).disabled(busy).opacity(busy ? 0.5 : 1)
                if choices?.nothingToPick != true {
                    WavyDivider(seed: 59).padding(.vertical, 8)
                    Text(L10n.Card.ResonatePicker.pickHeading)
                        .font(AppFonts.body(13, weight: .semibold)).tracking(13 * 0.02).foregroundStyle(Tokens.textMuted)
                        .padding(.horizontal, 6).padding(.top, 4).padding(.bottom, 2)
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
                        OrganicButton(L10n.Native.retry, variant: .textAccent, size: .sm) { Task { await load() } }
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

/// Row 0: write a new card in answer — shaped like a card row so it reads as the first choice, its
/// thumb a blank tile drawn in dashes with the pen: a card not written yet.
private struct WriteNewRow: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                let tile = WobRectShape(radius: 14, seed: 29, mag: 1.6, options: WobRectOptions(
                    curve: 1.2, segmentsH: .count(2), segmentsV: .count(2)))
                OrganicIcon(.pen, size: 22, color: Tokens.terracotta)
                    .frame(width: 48, height: 48)
                    .background {
                        tile.fill(Tokens.terracotta.opacity(0.1))
                        tile.stroke(Tokens.terracotta.opacity(0.7),
                                    style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round, dash: [4, 3.5]))
                    }
                VStack(alignment: .leading, spacing: 3) {
                    Text(L10n.Card.ResonatePicker.writeNew).font(AppFonts.body(15, weight: .semibold)).foregroundStyle(Tokens.text)
                    Text(L10n.Card.ResonatePicker.writeNewHint)
                        .font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted).lineSpacing(13 * 0.3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                OrganicIcon(.arrowRight, size: 18, color: Tokens.textMuted)
            }
            .padding(.vertical, 10).padding(.horizontal, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The rows' footprint while the shelf is read: plain blocks, nothing drawn before it is measured.
private struct PickSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(0..<3, id: \.self) { i in
                HStack(spacing: 12) {
                    SkeletonBlock(width: 48, height: 48, radius: 14)
                    SkeletonBlock(fraction: 0.62 - Double(i) * 0.12, height: 14)
                }
            }
        }
        .padding(.horizontal, 6).padding(.top, 10).padding(.bottom, 6)
        .accessibilityHidden(true)
    }
}
