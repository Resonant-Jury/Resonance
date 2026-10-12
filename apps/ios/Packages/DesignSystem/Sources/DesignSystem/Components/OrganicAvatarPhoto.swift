import NukeUI
import SwiftUI

/// A photo cover-fitted into exactly the room it is offered (the web's `object-fit: cover`, Android's
/// `ContentScale.Crop` in a sized box). The room is taken first and the picture laid over it: a bare
/// `scaledToFill()` reports the picture's own proportions, so a photo stored before avatars were cut
/// square (a tall one) stood taller than its avatar and its clip ran down past the rim.
struct OrganicAvatarPhoto: View {
    let url: URL
    var body: some View {
        Color.clear
            .overlay {
                LazyImage(url: url) { state in
                    if let image = state.image { image.resizable().scaledToFill() }
                }
            }
            .clipped()
    }
}
