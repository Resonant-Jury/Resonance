import SwiftUI

/// S2 — is the GPU grain (Grain.metal) the web's noise, pixel for pixel?
/// Renders the parity probes (opaque luminance / opaque noise alpha) for the
/// card grain at 3× and writes PNGs to Documents; compare them with the TS
/// reference: `npx tsx scripts/native/grain-parity.ts <dir>`.
struct GrainParity: View {
    var autorun = false
    @State private var status = ""

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 12) {
                probe(mode: 2)
                probe(mode: 3)
            }
            Text(status).font(.caption.monospaced())
        }
        .padding()
        .task {
            guard autorun else { return }
            let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            for mode: Float in [2, 3] {
                let renderer = ImageRenderer(content: probe(mode: mode))
                renderer.scale = 3
                if let data = renderer.uiImage?.pngData() {
                    try? data.write(to: dir.appendingPathComponent("grain-probe-\(Int(mode)).png"))
                }
            }
            status = dir.path
            print("GRAINPARITY \(dir.path)")
        }
    }

    private func probe(mode: Float) -> some View {
        let spec = GrainSpec.named("grain-card")
        return Rectangle().fill(.black)
            .turbulenceGrain(frequency: spec.frequency, octaves: spec.octaves, seed: spec.seed, opacity: 1, mode: mode)
            .frame(width: 128, height: 128)
    }
}
