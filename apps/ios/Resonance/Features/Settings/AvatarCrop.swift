import DesignSystem
import FirebaseFirestore
import ImageIO
import ResonanceKit
import SwiftUI
import UIKit

/// Framing a profile photo (round 5 B7, the same on the web and Android): the photo under the
/// avatar's mask, a diameter `mask` across. It is never smaller than the mask (`scale` ≥ `mask /
/// min(iw, ih)`), may be zoomed 1…4 times that, and is moved by its centre's offset from the mask's
/// centre, in the stage's points — always clamped so the mask stays covered. What the mask shows is
/// exactly the future avatar (`cropRect`, in the image's pixels).
struct AvatarCrop: Equatable {
    /// The image's size in pixels, upright (its orientation applied) and downsampled.
    let imageSize: CGSize
    /// The mask's diameter on the stage (`S − 48`).
    private(set) var mask: CGFloat
    private(set) var zoom: CGFloat = 1
    /// The photo's centre from the mask's centre, in stage points.
    private(set) var offset: CGSize = .zero

    static let zoomRange: ClosedRange<CGFloat> = 1...4

    init(imageSize: CGSize, mask: CGFloat) {
        self.imageSize = imageSize
        self.mask = mask
    }

    /// Stage points per image pixel at zoom 1: the shorter side just covers the mask.
    var minScale: CGFloat { mask / max(1, min(imageSize.width, imageSize.height)) }
    var scale: CGFloat { minScale * zoom }

    /// The photo moved by `delta` stage points, then clamped.
    mutating func pan(by delta: CGSize) {
        offset = CGSize(width: offset.width + delta.width, height: offset.height + delta.height)
        clamp()
    }

    /// Zoomed to `z` (clamped to 1…4) keeping the image point under `anchor` (from the mask's centre,
    /// in stage points: the mask's centre for the slider, the fingers' centroid for a pinch) where it
    /// is, then clamped.
    mutating func zoom(to z: CGFloat, about anchor: CGPoint = .zero) {
        let next = min(max(z, Self.zoomRange.lowerBound), Self.zoomRange.upperBound)
        let ratio = next / zoom
        offset = CGSize(width: anchor.x - (anchor.x - offset.width) * ratio,
                        height: anchor.y - (anchor.y - offset.height) * ratio)
        zoom = next
        clamp()
    }

    /// The same framing on a stage of another size (a rotation): the offset scaled with the mask.
    mutating func resize(mask newMask: CGFloat) {
        guard newMask > 0, mask > 0, newMask != mask else { return }
        let f = newMask / mask
        offset = CGSize(width: offset.width * f, height: offset.height * f)
        mask = newMask
        clamp()
    }

    private mutating func clamp() {
        let s = scale
        let maxX = max(0, (imageSize.width * s - mask) / 2)
        let maxY = max(0, (imageSize.height * s - mask) / 2)
        offset = CGSize(width: min(max(offset.width, -maxX), maxX), height: min(max(offset.height, -maxY), maxY))
    }

    /// The square the mask shows, in image pixels.
    var cropRect: CGRect {
        let s = scale
        let side = mask / s
        return CGRect(x: imageSize.width / 2 - offset.width / s - side / 2,
                      y: imageSize.height / 2 - offset.height / s - side / 2,
                      width: side, height: side)
    }

    /// The square the upload is drawn at: the crop's own pixels, between 256 (what the server keeps)
    /// and 512.
    var outputSide: Int { min(512, max(256, Int(cropRect.width.rounded()))) }
}

/// Reading and drawing the photo (round 5 B7).
enum AvatarImage {
    /// The picked file decoded upright (EXIF orientation applied), at most 2048 on its long side, an
    /// animated GIF's first frame; nil when it can't be read as a picture.
    static func load(_ data: Data, maxSide: Int = 2048) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0 else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSide,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    /// The crop drawn on cream first (a transparent picture never turns black), `side` pixels square,
    /// as JPEG at 0.9.
    static func render(_ image: CGImage, crop: CGRect, side: Int) -> Data? {
        let size = CGSize(width: side, height: side)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let drawn = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(Tokens.cream).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            let k = CGFloat(side) / crop.width
            UIImage(cgImage: image).draw(in: CGRect(x: -crop.minX * k, y: -crop.minY * k,
                                                    width: CGFloat(image.width) * k, height: CGFloat(image.height) * k))
        }
        return drawn.jpegData(compressionQuality: 0.9)
    }
}

/// Saving a framed photo (round 5 B7): uploaded as an avatar (the server fits it to 256), then
/// written on the profile the way the web writes it — the person's own `users/{uid}` document,
/// `avatarUrl` merged in (the rules take a stored file's URL from its owner; `PATCH /api/v1/me`
/// has no such field) — and the profile asked for again so every avatar of theirs follows.
struct AvatarSaver {
    var upload: (Data) async throws -> URL
    var write: ([String: Any]) async throws -> Void
    var refresh: () async -> Void

    /// What goes on the profile document.
    static func fields(_ url: URL) -> [String: Any] { ["avatarUrl": url.absoluteString] }

    func save(_ jpeg: Data) async throws {
        let url = try await upload(jpeg)
        try await write(Self.fields(url))
        await refresh()
    }

    @MainActor static func live(_ session: SessionStore, uid: String) -> AvatarSaver {
        AvatarSaver(
            upload: { try await session.writing.upload($0, filename: "avatar.jpg", purpose: "avatar") },
            write: { try await FirebaseBootstrap.db.collection("users").document(uid).setData($0, merge: true) },
            refresh: {
                // Written past the API: the HTTP cache asks the server again, and Me comes back with it.
                session.noteOwnWrite()
                await session.loadMe()
            })
    }
}

/// The crop modal's inside (round 5 B7): title, the hint, the stage, the zoom row, then Cancel and
/// 使用 at the bottom right. 使用 shows the button loader while the photo goes up and is saved; a
/// failure says so above the actions and 使用 can be pressed again.
struct AvatarCropContent: View {
    let image: CGImage
    let busy: Bool
    let error: String?
    let onCancel: () -> Void
    let onUse: (_ crop: CGRect, _ side: Int) -> Void
    @State private var width: CGFloat = 0
    @State private var crop: AvatarCrop?

    private var stageSide: CGFloat { min(320, width) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Settings.Profile.cropTitle)
            Text(L10n.Settings.Profile.cropHint)
                .font(AppFonts.body(13.5))
                .foregroundStyle(Tokens.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            if stageSide > 48, let binding = Binding($crop) {
                AvatarCropStage(image: image, crop: binding, side: stageSide)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 16)
                    .allowsHitTesting(!busy)
                HStack(spacing: 10) {
                    OrganicIcon(.minus, size: 16).foregroundStyle(Tokens.textMuted).accessibilityHidden(true)
                    OrganicSlider(value: Binding(get: { Double(binding.wrappedValue.zoom) },
                                                 set: { binding.wrappedValue.zoom(to: CGFloat($0)) }),
                                  in: Double(AvatarCrop.zoomRange.lowerBound)...Double(AvatarCrop.zoomRange.upperBound),
                                  label: L10n.Settings.Profile.cropZoom)
                    OrganicIcon(.plus, size: 16).foregroundStyle(Tokens.textMuted).accessibilityHidden(true)
                }
                .padding(.top, 14)
                .disabled(busy)
            }
            if let error { ModalError(error).padding(.top, 12) }
            ModalActions(busy: busy) {
                OrganicButton(L10n.Settings.Profile.cropCancel, variant: .tonal, size: .sm, action: onCancel)
            } verb: {
                OrganicButton(L10n.Settings.Profile.cropUse, variant: .solid, size: .sm) {
                    guard let crop else { return }
                    onUse(crop.cropRect, crop.outputSide)
                }
            }
            .padding(.top, 20)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .onChange(of: stageSide, initial: true) { _, side in
            let mask = side - 48
            guard mask > 0 else { return }
            if crop == nil {
                crop = AvatarCrop(imageSize: CGSize(width: image.width, height: image.height), mask: mask)
            } else {
                crop?.resize(mask: mask)
            }
        }
    }
}

/// The stage: the dialog's darker paper in the picture frame's outline, the photo moved and zoomed
/// under a scrim that leaves the avatar's shape clear, outlined in cream. One finger (or the
/// pointer) moves it, two pinch about their centroid.
struct AvatarCropStage: View {
    let image: CGImage
    @Binding var crop: AvatarCrop
    let side: CGFloat
    @State private var lastDrag: CGSize = .zero
    @State private var lastMagnification: CGFloat = 1
    /// `oklch(30% 0.02 70 / 0.5)`.
    static let scrim = OKLCHColor.color(0.30, 0.02, 70, alpha: 0.5)

    var body: some View {
        let frame = AutoWobRectShape(radius: 16, seed: 79, curve: 0.8)
        let mask = side - 48
        let s = crop.scale
        ZStack {
            frame.fill(Tokens.creamDark)
            Image(decorative: image, scale: 1)
                .resizable()
                .interpolation(.high)
                .frame(width: CGFloat(image.width) * s, height: CGFloat(image.height) * s)
                .offset(crop.offset)
        }
        .frame(width: side, height: side)
        // Over the photo: the scrim everywhere but the avatar's shape, and that shape's cream line.
        .overlay {
            CropScrimShape(mask: mask)
                .fill(Self.scrim, style: FillStyle(eoFill: true))
                .allowsHitTesting(false)
        }
        .overlay {
            AvatarOutlineShape(seed: 77)
                .stroke(Tokens.cream.opacity(0.9), style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
                .frame(width: mask, height: mask)
                .allowsHitTesting(false)
        }
        .clipShape(frame)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { g in
                    let d = CGSize(width: g.translation.width - lastDrag.width, height: g.translation.height - lastDrag.height)
                    lastDrag = g.translation
                    crop.pan(by: d)
                }
                .onEnded { _ in lastDrag = .zero }
                .simultaneously(with: MagnifyGesture()
                    .onChanged { g in
                        let ratio = g.magnification / lastMagnification
                        lastMagnification = g.magnification
                        let anchor = CGPoint(x: g.startLocation.x - side / 2, y: g.startLocation.y - side / 2)
                        crop.zoom(to: crop.zoom * ratio, about: anchor)
                    }
                    .onEnded { _ in lastMagnification = 1 })
        )
        .accessibilityElement()
        .accessibilityLabel(L10n.Settings.Profile.cropStage)
    }
}

/// The stage with the avatar's shape cut out of its middle (even-odd).
nonisolated struct CropScrimShape: Shape {
    let mask: CGFloat

    func path(in rect: CGRect) -> Path {
        var p = Path(rect)
        let box = CGRect(x: rect.midX - mask / 2, y: rect.midY - mask / 2, width: mask, height: mask)
        p.addPath(AvatarOutlineShape(seed: 77).path(in: box))
        return p
    }
}
