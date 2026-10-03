import DesignSystem
import ResonanceKit
import SwiftUI

// Search in a conversation, the way LINE does it: what is typed in the bar lists the messages that
// match, newest first, over the thread; a tap on one leaves the list and takes the thread to that
// message with the words marked, and the bar then steps from match to match. The twin of Android's
// ThreadSearch.

/// The bar's search field: the glyph, the field, and (once a result was chosen and the list is
/// put away) where in the matches the thread is, with the way to the older and newer ones.
struct ThreadSearchField: View {
    @Binding var query: String
    var focused: FocusState<Bool>.Binding
    /// "3/12" and the steps: the position of the hit being looked at, when the list is put away.
    let position: (index: Int, count: Int)?
    let onShowResults: () -> Void
    let onOlder: () -> Void
    let onNewer: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            OrganicIcon(.search, size: 17, color: Tokens.textMuted)
            TextField(text: $query, prompt: fieldPrompt(L10n.Messages.searchPlaceholder, size: 14)) { Text(L10n.Messages.menuSearch) }
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.text)
                .focused(focused)
                .submitLabel(.search)
                .onSubmit(onShowResults)
                .frame(height: 40)
            if let position {
                Text(L10n.Messages.searchPosition(index: "\(position.index)", count: position.count))
                    .font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.textMuted)
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize()
                step(up: true, label: L10n.Messages.searchPrevious, enabled: position.index < position.count, action: onOlder)
                step(up: false, label: L10n.Messages.searchNext, enabled: position.index > 1, action: onNewer)
            }
        }
        .onChange(of: focused.wrappedValue) { _, isFocused in
            if isFocused { onShowResults() }
        }
    }

    /// A bare chevron: up to the older match, down to the newer.
    private func step(up: Bool, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            OrganicIcon(.chevronDown, size: 18, color: enabled ? Tokens.text : Tokens.textMuted.opacity(0.4))
                .rotationEffect(.degrees(up ? 180 : 0))
                .frame(width: 36, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle())
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

/// The list of matches that covers the thread: how many, a loader while older messages are still
/// being read in for the search, then a row for each — who, when, and the words around the match
/// with the match marked — parted by wavy rules.
struct ThreadSearchResults: View {
    let model: ThreadModel
    let query: String
    /// The bar lies over the top of the list.
    let topMargin: CGFloat
    /// Whether results are scrolled under the bar (its pen line darkens).
    @Binding var underBar: Bool
    let onPick: (SearchHit) -> Void

    var body: some View {
        let hits = model.searchHits
        let byId = Dictionary(model.messages.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        Group {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(L10n.Messages.searchHint)
                    .font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(14 * 0.4)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 40)
                    .padding(.top, topMargin + 48)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .onAppear { underBar = false }
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 8) {
                            // Hits grow while older messages arrive: the count says what is known so far.
                            if !hits.isEmpty || !model.searchLoading {
                                Text(L10n.Messages.searchCount(count: hits.count))
                                    .font(AppFonts.body(12.5, weight: .semibold)).foregroundStyle(Tokens.textMuted)
                            }
                            if model.searchLoading {
                                SketchLoader(size: 16)
                                Text(L10n.Messages.searchSearching).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        ForEach(Array(hits.enumerated()), id: \.element.messageId) { i, hit in
                            if i > 0 { WavyDivider(seed: Double(131 + (i % 7) * 17)).padding(.horizontal, 20) }
                            if let message = byId[hit.messageId] {
                                ResultRow(message: message, hit: hit, mine: model.isMine(message), otherHandle: model.displayHandle) { onPick(hit) }
                            }
                        }
                    }
                }
                .contentMargins(.top, topMargin + 4, for: .scrollContent)
                .contentMargins(.bottom, 24, for: .scrollContent)
                .scrollDismissesKeyboard(.interactively)
                .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 1 } action: { _, under in
                    underBar = under
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.cream)
    }
}

private struct ResultRow: View {
    let message: ChatMessage
    let hit: SearchHit
    let mine: Bool
    let otherHandle: String
    let onPick: () -> Void

    var body: some View {
        let snippet = SearchSnippet.of(message.text, ranges: hit.ranges)
        Button(action: onPick) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(mine ? L10n.Messages.you : otherHandle)
                        .font(AppFonts.body(12.5, weight: .semibold))
                        .foregroundStyle(mine ? Tokens.terracotta : Tokens.text)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(ThreadScreen.resultTime(message.sentAt)).font(AppFonts.body(11)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
                ChatText(snippet.text, size: 14, lineHeight: 1.5, highlights: snippet.ranges, highlightColor: highlightWash(strong: false),
                         highlightWeight: .semibold, maxLines: 2)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(ResultPress())
        .accessibilityElement(children: .combine)
    }
}

/// A row of results under the finger: a light wash across it.
private struct ResultPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Tokens.terracotta.opacity(configuration.isPressed ? 0.08 : 0))
            .animation(.easeOut(duration: configuration.isPressed ? 0.06 : 0.2), value: configuration.isPressed)
    }
}
