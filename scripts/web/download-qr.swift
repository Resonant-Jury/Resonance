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
// zone the QR standard asks for. Each run of dark modules in a row is one
// subpath, its corners rounded (RADIUS of a module) where nothing dark meets
// them above or below — lone modules come out as pills, while every module
// still fills its own cell, which is what a scanner samples. The three finder
// squares are drawn whole as their own path: a ring with round corners round a
// round-cornered centre, their 1 : 1 : 3 : 1 : 1 proportions as the standard
// has them. src/components/molecules/GetTheApp/qr.test.ts
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

/// How round a free corner is, in modules (0.5 would make a lone module a circle).
let RADIUS = 0.45

/// The finder squares' top-left modules; their 7 × 7 modules are drawn apart.
let finders = [(0, 0), (size - 7, 0), (0, size - 7)]
func inFinder(_ x: Int, _ y: Int) -> Bool { finders.contains { x >= $0.0 && x < $0.0 + 7 && y >= $0.1 && y < $0.1 + 7 } }

func dark(_ x: Int, _ y: Int) -> Bool { x >= 0 && y >= 0 && x < size && y < size && modules[y][x] && !inFinder(x, y) }
func num(_ v: Double) -> String {
  let s = String(format: "%.2f", v)
  return s.replacingOccurrences(of: #"\.?0+$"#, with: "", options: .regularExpression)
}

var path = ""
for y in 0..<size {
  var x = 0
  while x < size {
    guard dark(x, y) else { x += 1; continue }
    var end = x
    while dark(end + 1, y) { end += 1 }
    // A corner is free when the module beside it, above or below, is light (the run's ends have nothing beside them).
    let tl = dark(x, y - 1) ? 0 : RADIUS, tr = dark(end, y - 1) ? 0 : RADIUS
    let br = dark(end, y + 1) ? 0 : RADIUS, bl = dark(x, y + 1) ? 0 : RADIUS
    let left = Double(x + quiet), right = Double(end + 1 + quiet), top = Double(y + quiet), bottom = top + 1
    func arc(_ r: Double, _ dx: Double, _ dy: Double) -> String { r > 0 ? "a\(num(r)) \(num(r)) 0 0 1 \(num(dx)) \(num(dy))" : "" }
    path += "M\(num(left + tl)) \(num(top))H\(num(right - tr))" + arc(tr, tr, tr)
      + "V\(num(bottom - br))" + arc(br, -br, br)
      + "H\(num(left + bl))" + arc(bl, -bl, -bl)
      + "V\(num(top + tl))" + arc(tl, tl, -tl) + "z"
    x = end + 1
  }
}

/// A rounded rectangle, clockwise from its top edge.
func roundRect(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ r: Double) -> String {
  "M\(num(x + r)) \(num(y))h\(num(w - 2 * r))a\(num(r)) \(num(r)) 0 0 1 \(num(r)) \(num(r))v\(num(h - 2 * r))"
    + "a\(num(r)) \(num(r)) 0 0 1 \(num(-r)) \(num(r))h\(num(-(w - 2 * r)))a\(num(r)) \(num(r)) 0 0 1 \(num(-r)) \(num(-r))"
    + "v\(num(-(h - 2 * r)))a\(num(r)) \(num(r)) 0 0 1 \(num(r)) \(num(-r))z"
}
var finderPath = ""
for (fx, fy) in finders {
  let x = Double(fx + quiet), y = Double(fy + quiet)
  // The ring (its hole cut by the even-odd rule), then the centre.
  finderPath += roundRect(x, y, 7, 7, 2) + roundRect(x + 1, y + 1, 5, 5, 1.2) + roundRect(x + 2, y + 2, 3, 3, 1)
}

let side = size + 2 * quiet
let svg = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \(side) \(side)" data-content="\(link)">
<!-- \(link): QR code, error correction M, made by scripts/web/download-qr.swift (Core Image). -->
<rect width="\(side)" height="\(side)" fill="\(paper)"/>
<path fill="\(ink)" d="\(path)"/>
<path fill-rule="evenodd" fill="\(ink)" data-finders="" d="\(finderPath)"/>
</svg>

"""
let out = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("public/download-qr.svg")
try! svg.write(to: out, atomically: true, encoding: .utf8)
print("\(out.path): \(size) × \(size) modules + \(quiet) quiet")
