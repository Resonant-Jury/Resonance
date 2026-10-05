import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A bell row: who did what, then a note's own words under it. The unread dot ends the first line,
/// beside who it is from — on a note's row too, never after the note's words (the web's
/// NotificationBell and Android's NotificationRow put it there). VoiceOver hears "Unread", never the
/// dot's glyph.
@MainActor @Suite(.serialized) struct NotificationRowTests {
    /// What VoiceOver reads of the row as the bell's list draws it: a button around the label.
    private func elements(_ row: NotificationRowLabel) async throws -> [NSObject] {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.rootViewController = UIHostingController(rootView: VStack {
            Button {} label: { row }.buttonStyle(.plain)
            Spacer()
        })
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var found: [NSObject] = []
        _ = await eventually {
            found = AccessibilityOn.elements(in: window).filter { !($0.accessibilityLabel ?? "").isEmpty }
            return found.contains { ($0.accessibilityLabel ?? "").contains(row.text) }
        }
        return found
    }

    @Test func voiceOverHearsUnreadNeverTheDotsGlyph() async throws {
        let found = try await elements(NotificationRowLabel(text: "Mei sent you a little note", preview: "謝謝你寫這篇。", unread: true))
        let row = try #require(found.first { ($0.accessibilityLabel ?? "").contains("Mei sent you a little note") })
        #expect(row.accessibilityValue == L10n.App.Notifications.unread)
        #expect(found.contains { ($0.accessibilityLabel ?? "").contains("「謝謝你寫這篇。」") })
        #expect(!found.contains { "\($0.accessibilityLabel ?? "")\($0.accessibilityValue ?? "")".contains("\u{25CF}") })
    }

    @Test func aReadRowSaysNothingOfIt() async throws {
        let found = try await elements(NotificationRowLabel(text: "Mei sent you a message", preview: nil, unread: false))
        let row = try #require(found.first { ($0.accessibilityLabel ?? "").contains("Mei sent you a message") })
        #expect((row.accessibilityValue ?? "").isEmpty)
        #expect(!found.contains { ($0.accessibilityLabel ?? "").contains("\u{25CF}") })
    }

    /// `view` drawn at 2x, as RGBA bytes, rows top down.
    private func bitmap(_ view: some View) throws -> (pixels: [UInt8], width: Int, height: Int) {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let image = try #require(renderer.cgImage)
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                             space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return (pixels, width, height)
    }

    /// Where the row's terracotta ink is (the dot is the only thing drawn in it), in points.
    private func dot(_ row: NotificationRowLabel) throws -> (ink: CGRect?, size: CGSize) {
        // The accent as the same drawing renders it.
        let swatch = try bitmap(Rectangle().fill(Tokens.terracotta).frame(width: 8, height: 8))
        let accent = Array(swatch.pixels[((swatch.height / 2) * swatch.width + swatch.width / 2) * 4 ..< ((swatch.height / 2) * swatch.width + swatch.width / 2) * 4 + 3])
        let (pixels, width, height) = try bitmap(row.frame(width: 402).background(Tokens.cream))
        var ink: CGRect?
        for y in 0..<height {
            for x in 0..<width {
                let i = (y * width + x) * 4
                let distance = (0..<3).reduce(0) { $0 + abs(Int(pixels[i + $1]) - Int(accent[$1])) }
                guard distance < 30 else { continue }
                let point = CGRect(x: CGFloat(x) / 2, y: CGFloat(y) / 2, width: 0.5, height: 0.5)
                ink = ink.map { $0.union(point) } ?? point
            }
        }
        return (ink, CGSize(width: CGFloat(width) / 2, height: CGFloat(height) / 2))
    }

    @Test func anUnreadNotesDotEndsItsFirstLineNotTheNotesWords() throws {
        let (ink, size) = try dot(NotificationRowLabel(text: "Mei sent you a little note", preview: "謝謝你寫這篇。", unread: true))
        let mark = try #require(ink)
        // A dot, about the web's 6px.
        #expect(mark.width > 3 && mark.width < 9)
        #expect(mark.height > 3 && mark.height < 9)
        // On the first line, beside who it is from — not under it, after the note's words.
        #expect(mark.midY < size.height / 2)
        #expect(mark.minX > 60 && mark.maxX < size.width - 40)
    }

    @Test func aReadRowHasNoDot() throws {
        #expect(try dot(NotificationRowLabel(text: "Mei sent you a little note", preview: "謝謝你寫這篇。", unread: false)).ink == nil)
        #expect(try dot(NotificationRowLabel(text: "Mei sent you a message", preview: nil, unread: true)).ink != nil)
    }
}
