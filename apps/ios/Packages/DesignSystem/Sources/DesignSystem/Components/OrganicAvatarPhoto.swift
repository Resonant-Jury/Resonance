import NukeUI
import SwiftUI

struct OrganicAvatarPhoto: View {
    let url: URL
    var body: some View {
        LazyImage(url: url) { state in
            if let image = state.image { image.resizable().scaledToFill() }
        }
    }
}
