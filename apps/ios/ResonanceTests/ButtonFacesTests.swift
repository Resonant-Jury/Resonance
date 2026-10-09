import DesignSystem
import SwiftUI
import Testing

/// Every button has a fill and none draws a pen line (the owner's rule, as on the web): the verb
/// solid, everything beside it tonal, the way into a deletion a soft red, its final confirm solid
/// red — and the older variant names wear the new faces.
@MainActor @Suite struct ButtonFacesTests {
    @Test func everyRankIsAFilledFaceAndTheOldNamesWearTheNewOnes() {
        for variant in OrganicButton.Variant.allCases {
            #expect(OrganicButtonFace.of(variant).fill != .clear, "\(variant) has a fill")
        }
        // The verb: deep terracotta (cream on plain terracotta was 3.5:1), cream words.
        for verb: OrganicButton.Variant in [.solid, .primary] {
            #expect(OrganicButtonFace.of(verb).fill == Tokens.buttonFill)
            #expect(OrganicButtonFace.of(verb).label == Tokens.cream)
        }
        // Cancel, Close, Keep, Load more, Retry, Unblock: the tonal pill, whatever their call site still says.
        for quiet: OrganicButton.Variant in [.tonal, .text, .textAccent, .ghost, .outline] {
            #expect(OrganicButtonFace.of(quiet).fill == Tokens.buttonTonal, "\(quiet)")
            #expect(OrganicButtonFace.of(quiet).label == Tokens.buttonOnTonal, "\(quiet)")
        }
        #expect(OrganicButtonFace.of(.dangerTonal).fill == Tokens.buttonDangerTonal)
        #expect(OrganicButtonFace.of(.dangerTonal).label == Tokens.buttonOnDangerTonal)
        #expect(OrganicButtonFace.of(.danger).fill == Tokens.dangerFill)
        #expect(OrganicButtonFace.of(.danger).label == Tokens.cream)
        // Each wobbles like the variant it grew out of (the web's BTN_SEEDS).
        #expect(OrganicButtonFace.of(.solid).seed == 3 && OrganicButtonFace.of(.text).seed == 401)
        #expect(OrganicButtonFace.of(.tonal).seed == 601 && OrganicButtonFace.of(.dangerTonal).seed == 601)
        // Every face carries the buttons' grain but the paper, which carries the cards'.
        #expect(OrganicButtonFace.of(.tonal).grain == "grain-button" && OrganicButtonFace.of(.paper).grain == "grain-card")
    }
}
