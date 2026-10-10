import DesignSystem
import ResonanceKit
import SwiftUI

/// A pen name's availability as it is typed (the signup page's handleState),
/// plus `failed` when the check itself couldn't be made.
enum PenNameStatus: Equatable { case idle, checking, available, taken, failed }

/// The pen-name field (signup's profile step, settings → profile): what a
/// name can't hold never lands, and 350 ms after typing stops the API says
/// whether it's free — checking, available ✿, taken. Too short stays quiet,
/// as on the web. `current` is the account's own name (settings), which
/// needs no check.
struct PenNameField: View {
    let label: String
    @Binding var text: String
    @Binding var status: PenNameStatus
    var current: String?
    var seed: Double = 31
    @Environment(SessionStore.self) private var session
    @State private var attempt = 0

    private struct Check: Equatable { let name: String; let attempt: Int }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            OrganicTextField(label, text: $text, seed: seed)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: text) { _, typed in
                    let clean = PenName.sanitized(typed)
                    if clean != typed { text = clean }
                }
            // The line keeps its height when empty, so the form doesn't jump as the check runs.
            statusLine.lineLimit(1).frame(height: 18, alignment: .leading)
        }
        .task(id: Check(name: PenName.normalized(text), attempt: attempt)) { await check() }
    }

    @ViewBuilder private var statusLine: some View {
        switch status {
        case .idle:
            Color.clear
        case .checking:
            note(L10n.Auth.handleChecking, color: Tokens.textMuted)
        case .available:
            HStack(spacing: 4) {
                OrganicIcon(.check, size: 12, color: Tokens.sage, strokeWidth: 1.8)
                note(L10n.Auth.handleAvailable, color: Tokens.sage)
            }
            .accessibilityElement(children: .combine)
        case .taken:
            note(L10n.Auth.handleTaken, color: Tokens.terracotta)
        case .failed:
            HStack(spacing: 8) {
                note(L10n.Native.loadError, color: Tokens.textMuted)
                Button(L10n.Native.retry) { attempt += 1 }
                    .font(AppFonts.body(12, weight: .semibold))
                    .foregroundStyle(Tokens.terracotta)
                    .buttonStyle(.plain)
            }
        }
    }

    private func note(_ text: String, color: Color) -> some View {
        Text(text).font(AppFonts.body(12)).foregroundStyle(color)
    }

    private func check() async {
        let name = PenName.normalized(text)
        guard PenName.isValid(name), name != current else { return status = .idle }
        status = .checking
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        do {
            let free = try await session.profiles.isAvailable(name)
            guard !Task.isCancelled else { return }
            status = free ? .available : .taken
        } catch {
            guard !Task.isCancelled else { return }
            status = .failed
        }
    }
}

/// The signup page's regions, in its order, named in the interface's
/// language (the web's regionDisplayName); each row shows the region's
/// SquareFlag beside the name (the web's settings), not an emoji flag.
enum ProfileRegion: String, CaseIterable {
    case tw = "TW", jp = "JP", us = "US", kr = "KR", hk = "HK"

    var label: String { Self.label(rawValue) }

    /// "TW" → "台灣" in the reader's language (its SquareFlag is drawn beside it); free text stays as it is.
    static func label(_ region: String) -> String {
        guard region.count == 2, region.allSatisfy(\.isLetter) else { return region }
        let code = code(region)
        return Strings.shared.locale.localizedString(forRegionCode: code) ?? code
    }

    /// The ISO code a stored region stands for: an older `UK` is `GB` (the web's regionCode).
    static func code(_ region: String) -> String {
        let code = region.trimmingCharacters(in: .whitespaces).uppercased()
        return code == "UK" ? "GB" : code
    }

    /// The region's SquareFlag code, or nil when the app has no flag art for it (the web's squareFlagCode).
    static func flagCode(_ region: String) -> String? {
        let code = code(region).lowercased()
        return code.count == 2 && SquareFlag.has(code) ? code : nil
    }
}

/// A labelled handful of choices as hand-drawn radios — the app's stand-in
/// for the web's organic select, as in the report form.
struct ChoiceList<Value: Hashable>: View {
    let label: String
    let options: [(value: Value, title: String)]
    @Binding var selection: Value
    var seed: Double = 21
    /// A choice's flag, as the web's settings set a SquareFlag before a region or a language.
    var flag: ((Value) -> String?)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FieldLabel(text: label)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(options.enumerated()), id: \.offset) { i, option in
                    let chosen = option.value == selection
                    Button { selection = option.value } label: {
                        HStack(spacing: 12) {
                            OrganicRadio(isOn: chosen, seed: seed + Double(i * 7))
                            if let code = flag?(option.value) { SquareFlag(code, size: 18) }
                            Text(option.title).font(AppFonts.body(15)).foregroundStyle(Tokens.text)
                            Spacer(minLength: 0)
                        }
                        .frame(minHeight: 40)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(chosen ? .isSelected : [])
                }
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
    }
}
