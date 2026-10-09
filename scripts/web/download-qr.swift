// Writes public/download-qr.svg, the QR code the website shows desktop
// visitors beside the store badges (GetTheApp). It encodes the /download link,
// which sends a phone to its own store (src/app/download/route.ts).
//
// Made once and committed: the picture only changes if the link does. Uses
// macOS's own Core Image QR encoder, so nothing is installed for it:
//
//   swift scripts/web/download-qr.swift
//
// Error correction M (the link fits version 3, 29 × 29 modules), the modules
// drawn as one path in the site's ink on card paper, with the 4-module quiet
// zone the QR standard asks for. src/components/molecules/GetTheApp/qr.test.ts
// checks the file's shape.
import CoreImage
import Foundation

let link = "https://resonance.channel/download"
let quiet = 4
let ink = "#2f2115" // --color-text, oklch(26% 0.03 60)
let paper = "#faf6ef" // --color-card-bg, oklch(97.5% 0.01 80)

let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(link.data(using: .utf8)!, forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
let image = filter.outputImage!
let width = Int(image.extent.width), height = Int(image.extent.height)
var pixels = [UInt8](repeating: 0, count: width * height * 4)
CIContext().render(
  image, toBitmap: &pixels, rowBytes: width * 4, bounds: image.extent,
  format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())

// One pixel per module; drop the encoder's own margin.
let dark: [[Bool]] = (0..<height).map { y in (0..<width).map { x in pixels[(y * width + x) * 4] < 128 } }
let rows = dark.indices.filter { dark[$0].contains(true) }
let cols = (0..<width).filter { x in dark.contains { $0[x] } }
let modules = rows.map { y in cols.map { x in dark[y][x] } }
let size = modules.count
precondition(size == cols.count && (size - 17) % 4 == 0, "not a QR symbol: \(size) × \(cols.count)")

var path = ""
for (y, row) in modules.enumerated() {
  var x = 0
  while x < size {
    guard row[x] else { x += 1; continue }
    var run = 1
    while x + run < size && row[x + run] { run += 1 }
    path += "M\(x + quiet) \(y + quiet)h\(run)v1h-\(run)z"
    x += run
  }
}

let side = size + 2 * quiet
let svg = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \(side) \(side)" shape-rendering="crispEdges" data-content="\(link)">
<!-- \(link): QR code, error correction M, made by scripts/web/download-qr.swift (Core Image). -->
<rect width="\(side)" height="\(side)" fill="\(paper)"/>
<path fill="\(ink)" d="\(path)"/>
</svg>

"""
let out = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("public/download-qr.svg")
try! svg.write(to: out, atomically: true, encoding: .utf8)
print("\(out.path): \(size) × \(size) modules + \(quiet) quiet")
