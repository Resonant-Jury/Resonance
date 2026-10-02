import DesignSystem
import ResonanceKit
import SwiftUI

/// The guided first-card moment (FirstCardGuide.tsx, ux §5): above the editor
/// only while the writer has no cards at all. Three guiding questions in a
/// soft panel; picking one drops it into the story as a quote to write
/// against, and the guide steps aside.
struct FirstCardGuide: View {
    let onPick: (String) -> Void

    private let questions = [L10n.Write.FirstCard.q1, L10n.Write.FirstCard.q2, L10n.Write.FirstCard.q3]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Panel's title: the pen, then the heading at 17 bold.
            HStack(spacing: 8) {
                OrganicIcon(.pen, size: 16, color: Tokens.terracotta)
                CSSText(L10n.Write.FirstCard.title, font: AppFonts.scaledUIFont(.heading, size: 17, weight: .bold), lineHeight: 1.3)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .padding(.bottom, 8)
            CSSText(L10n.Write.FirstCard.intro, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.7,
                    color: UIColor(Tokens.textMuted))
            ForEach(Array(questions.enumerated()), id: \.offset) { i, question in
                WavyDivider(seed: Double(19 + i * 7)).padding(.vertical, 2)
                Button { onPick(question) } label: { EmptyView() }
                    .buttonStyle(GuideQuestion(text: question))
                    .accessibilityLabel(question)
            }
        }
        .padding(18)
        .background {
            // border-radius: 20px 24px 18px 22px on cream-dark at half strength.
            UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 22, bottomTrailingRadius: 18, topTrailingRadius: 24)
                .fill(Tokens.creamDark.opacity(0.5))
        }
    }
}

/// One question: the ✎ and the line share a 1.6 line box, so they sit on one
/// baseline (align-items: baseline); it turns terracotta while pressed (the
/// web's hover / focus).
private struct GuideQuestion: ButtonStyle {
    let text: String

    func makeBody(configuration: Configuration) -> some View {
        let ink = UIColor(configuration.isPressed ? Tokens.terracotta : Tokens.text)
        HStack(alignment: .top, spacing: 10) {
            // In its own 1.6 line box (the line's, at the person's text size), centred as CSS centres the glyph's content area.
            Text("✎").font(AppFonts.heading(15)).foregroundStyle(Tokens.terracotta)
                .frame(height: 15 * 1.6 * TextScale.factor(relativeTo: .body))
                .accessibilityHidden(true)
            CSSText(text, font: AppFonts.scaledUIFont(.body, size: 15), lineHeight: 1.6, color: ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 2)
        .contentShape(Rectangle())
        .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}
