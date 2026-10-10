import CoreGraphics
import Foundation
import ImageIO
import SwiftUI
import Testing
import UIKit
import UniformTypeIdentifiers
@testable import Resonance

/// Framing a profile photo (round 5 B7): the crop maths every platform shares (design-b §B7's
/// table), the picture as it is read and drawn, and how a framed photo is saved.
@MainActor @Suite struct AvatarCropTests {
    private func near(_ r: CGRect, _ x: CGFloat, _ y: CGFloat, _ side: CGFloat) -> Bool {
        abs(r.minX - x) < 0.01 && abs(r.minY - y) < 0.01 && abs(r.width - side) < 0.01 && abs(r.height - side) < 0.01
    }

    @Test func theSharedTable() {
        // 4000 × 3000 under a 272 mask: at first the whole height, centred.
        var crop = AvatarCrop(imageSize: CGSize(width: 4000, height: 3000), mask: 272)
        #expect(near(crop.cropRect, 500, 0, 3000))
        // Zoom 2 about the mask's centre.
        var zoomed = crop
        zoomed.zoom(to: 2)
        #expect(near(zoomed.cropRect, 1250, 750, 1500))
        // From the start, a pan right as far as it goes (clamped), and left.
        var right = crop
        right.pan(by: CGSize(width: 100, height: 0))
        #expect(near(right.cropRect, 0, 0, 3000))
        crop.pan(by: CGSize(width: -100, height: 0))
        #expect(near(crop.cropRect, 1000, 0, 3000))
        // 1000 × 2000 under 250: the whole width, centred; at zoom 4 a quarter of it.
        var tall = AvatarCrop(imageSize: CGSize(width: 1000, height: 2000), mask: 250)
        #expect(near(tall.cropRect, 0, 500, 1000))
        tall.zoom(to: 4)
        #expect(abs(tall.cropRect.width - 250) < 0.01)
    }

    @Test func zoomStaysBetweenOneAndFourAndTheMaskStaysCovered() {
        var crop = AvatarCrop(imageSize: CGSize(width: 1200, height: 800), mask: 272)
        crop.zoom(to: 9)
        #expect(crop.zoom == 4)
        crop.zoom(to: 0.2)
        #expect(crop.zoom == 1)
        // Anywhere it is dragged, the crop stays inside the picture.
        for d in [CGSize(width: 5000, height: 5000), CGSize(width: -5000, height: 300), CGSize(width: 0, height: -5000)] {
            crop.zoom(to: 2.5, about: CGPoint(x: 40, y: -30))
            crop.pan(by: d)
            let r = crop.cropRect
            #expect(r.minX >= -0.01 && r.minY >= -0.01 && r.maxX <= 1200.01 && r.maxY <= 800.01)
        }
    }

    @Test func aPinchKeepsThePointUnderTheFingersWhereItIs() {
        var crop = AvatarCrop(imageSize: CGSize(width: 3000, height: 3000), mask: 272)
        crop.zoom(to: 2)
        let anchor = CGPoint(x: 30, y: -20)
        // The image point under the anchor, before and after.
        func under(_ c: AvatarCrop) -> CGPoint {
            CGPoint(x: (anchor.x - c.offset.width) / c.scale, y: (anchor.y - c.offset.height) / c.scale)
        }
        let before = under(crop)
        crop.zoom(to: 3, about: anchor)
        let after = under(crop)
        #expect(abs(before.x - after.x) < 0.01 && abs(before.y - after.y) < 0.01)
    }

    @Test func theOutputIsTheCropsOwnPixelsBetween256And512() {
        #expect(AvatarCrop(imageSize: CGSize(width: 4000, height: 3000), mask: 272).outputSide == 512)
        var small = AvatarCrop(imageSize: CGSize(width: 1000, height: 2000), mask: 250)
        small.zoom(to: 4)
        #expect(small.outputSide == 256)
        #expect(AvatarCrop(imageSize: CGSize(width: 300, height: 300), mask: 250).outputSide == 300)
    }

    @Test func aRotatedStageKeepsTheFraming() {
        var crop = AvatarCrop(imageSize: CGSize(width: 4000, height: 3000), mask: 272)
        crop.zoom(to: 2)
        crop.pan(by: CGSize(width: 40, height: -30))
        let before = crop.cropRect
        crop.resize(mask: 200)
        #expect(near(crop.cropRect, before.minX, before.minY, before.width))
    }

    /// A small PNG with the given EXIF orientation, `w` × `h` as stored.
    private func png(width w: Int, height h: Int, orientation: Int = 1, alpha: Bool = false) throws -> Data {
        let context = try #require(CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                             space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: alpha ? CGImageAlphaInfo.premultipliedLast.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue))
        if !alpha {
            context.setFillColor(red: 0.2, green: 0.4, blue: 0.8, alpha: 1)
            context.fill(CGRect(x: 0, y: 0, width: w, height: h))
        }
        let image = try #require(context.makeImage())
        let data = NSMutableData()
        let dest = try #require(CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(dest, image, [kCGImagePropertyOrientation: orientation] as CFDictionary)
        #expect(CGImageDestinationFinalize(dest))
        return data as Data
    }

    @Test func thePictureIsReadUprightAndNoLargerThan2048() throws {
        // Stored 300 × 200 but turned a quarter (EXIF 6): read as 200 × 300.
        let turned = try #require(AvatarImage.load(try png(width: 300, height: 200, orientation: 6)))
        #expect(turned.width == 200 && turned.height == 300)
        let big = try #require(AvatarImage.load(try png(width: 3000, height: 1500)))
        #expect(max(big.width, big.height) == 2048)
        #expect(AvatarImage.load(Data("not a picture".utf8)) == nil)
    }

    @Test func aTransparentPictureIsDrawnOnCreamNeverBlack() throws {
        let clear = try #require(AvatarImage.load(try png(width: 64, height: 64, alpha: true)))
        let jpeg = try #require(AvatarImage.render(clear, crop: CGRect(x: 0, y: 0, width: 64, height: 64), side: 256))
        let drawn = try #require(UIImage(data: jpeg)?.cgImage)
        #expect(drawn.width == 256 && drawn.height == 256)
        var pixel = [UInt8](repeating: 0, count: 4)
        let ctx = try #require(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        ctx.draw(drawn, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        #expect(pixel[0] > 200 && pixel[1] > 200 && pixel[2] > 180, "cream, not black: \(pixel)")
    }

    @Test func theStageDimsThePhotoOutsideTheAvatarOnly() throws {
        // A white photo zoomed past the stage: white inside the mask, scrimmed beside it.
        let context = try #require(CGContext(data: nil, width: 400, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
                                             space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: 400, height: 400))
        let white = try #require(context.makeImage())
        var crop = AvatarCrop(imageSize: CGSize(width: 400, height: 400), mask: 272)
        crop.zoom(to: 2)
        let stage = AvatarCropStage(image: white, crop: .constant(crop), side: 320)
        let renderer = ImageRenderer(content: stage)
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        var pixels = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let read = try #require(CGContext(data: &pixels, width: image.width, height: image.height, bitsPerComponent: 8,
                                          bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        read.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        func red(_ x: Int, _ y: Int) -> UInt8 { pixels[(y * image.width + x) * 4] }
        #expect(red(160, 160) > 240, "inside the mask: the photo as it is")
        #expect(red(12, 160) < 180, "beside the mask: under the scrim (\(red(12, 160)))")
    }

    @MainActor final class Calls {
        var uploads: [Data] = []
        var writes: [[String: Any]] = []
        var refreshes = 0
    }

    @Test func aFramedPhotoIsUploadedThenWrittenOnTheProfileThenTheProfileIsAskedAgain() async throws {
        let calls = Calls()
        let saver = AvatarSaver(
            upload: { calls.uploads.append($0); return URL(string: "https://img.test/avatar/2026-10/a.webp")! },
            write: { calls.writes.append($0) },
            refresh: { calls.refreshes += 1 })
        try await saver.save(Data([1, 2, 3]))
        #expect(calls.uploads == [Data([1, 2, 3])])
        #expect(calls.writes.count == 1)
        #expect(calls.writes.first?["avatarUrl"] as? String == "https://img.test/avatar/2026-10/a.webp")
        #expect(calls.writes.first?.count == 1)
        #expect(calls.refreshes == 1)
    }

    @Test func aFailedUploadWritesNothing() async {
        let calls = Calls()
        let saver = AvatarSaver(
            upload: { _ in throw URLError(.badServerResponse) },
            write: { calls.writes.append($0) },
            refresh: { calls.refreshes += 1 })
        await #expect(throws: URLError.self) { try await saver.save(Data([1])) }
        #expect(calls.writes.isEmpty && calls.refreshes == 0)
    }
}
