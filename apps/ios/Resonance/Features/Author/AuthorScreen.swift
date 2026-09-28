import DesignSystem
import ResonanceKit
import SwiftUI

/// A person's page (u/[handle]/page.tsx): avatar, name, bio, region · cards ·
/// joined · connected; then their public cards and the cards linking to theirs.
struct AuthorScreen: View {
    let handle: String
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @State private var model: ProfileModel?

    var body: some View {
        ScrollView {
            switch model?.phase ?? .loading {
            case .loading:
                SketchLoader(size: 48).frame(maxWidth: .infinity).padding(.top, 120)
            case .notFound:
                OrganicEmptyState(L10n.Profile.notFound, actionTitle: L10n.Profile.backHome) { openRoute.dismissToRoot() }
                    .padding(.top, 80)
            case .failed:
                OrganicEmptyState(L10n.Native.loadError, actionTitle: L10n.Native.retry) { Task { await model?.load() } }
                    .padding(.top, 80)
            case .loaded:
                if let model, let profile = model.profile { page(model, profile) }
            }
        }
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            OrganicInlineBar("", backLabel: L10n.App.Nav.back) {
                if let profile = model?.profile, !profile.isSelf {
                    SafetyMenu(target: .user(id: profile.author.id), handle: profile.author.handle, isBlocked: profile.isBlocked) {
                        Task { await model?.load() }
                    }
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if model == nil { model = ProfileModel(handle: handle, api: session.reading) }
            if let model, model.profile == nil { await model.load() }
        }
    }

    private func page(_ model: ProfileModel, _ profile: Profile) -> some View {
        let author = profile.author
        return VStack(spacing: 0) {
            VStack(spacing: 14) {
                HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                color: author.accent, size: 96, seed: author.avatarSeedValue)
                Text(author.handle)
                    .font(AppFonts.heading(32))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                Text(profile.bio ?? L10n.Profile.bioEmpty)
                    .font(AppFonts.body(15))
                    .foregroundStyle(profile.bio == nil ? Tokens.textMuted.opacity(0.8) : Tokens.textMuted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(15 * 0.6)
                meta(profile, author: author)
                if !profile.isBlocked, profile.isSelf {
                    OrganicButton(L10n.Profile.editProfile, variant: .ghost) {}
                        .disabled(true) // Settings arrive in M2.
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 36)

            if profile.isBlocked {
                VStack(spacing: 6) {
                    Text(L10n.Safety.blockedNotice(handle: author.handle)).font(AppFonts.heading(18)).foregroundStyle(Tokens.text)
                    Text(L10n.Safety.blockedNoticeBody).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                }
                .multilineTextAlignment(.center)
                .padding(24)
            } else if !model.cards.isEmpty || profile.isSelf {
                heading(L10n.Profile.publishedHeading)
                if model.cards.isEmpty {
                    OrganicEmptyState(L10n.Profile.emptyPublishedSelf, actionTitle: L10n.Profile.emptyPublishedCta) { writer.open() }
                } else {
                    StoryCardList(cards: model.cards) { Task { await model.loadMore() } }
                }
            }
            if !model.linked.isEmpty {
                heading(L10n.Profile.linkedCards).padding(.top, 48)
                StoryCardList(cards: model.linked)
            }
            Color.clear.frame(height: 48)
        }
    }

    private func heading(_ title: String) -> some View {
        Text(title)
            .font(AppFonts.heading(22))
            .foregroundStyle(Tokens.text)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 24)
    }

    private func meta(_ profile: Profile, author: Author) -> some View {
        let joined = ISO8601.date(profile.joinedAt).map {
            $0.formatted(.dateTime.year().month(.abbreviated).locale(Strings.shared.locale))
        } ?? ""
        return FlowRow(spacing: 14) {
            if let region = author.region {
                Text(Self.regionLabel(region)).metaStyle()
            }
            Label { Text(L10n.Profile.cardCount(count: profile.cardCount)) } icon: { OrganicIcon(.cards, size: 16, strokeWidth: Tokens.ink) }.metaStyle()
            Text(L10n.Profile.joined(date: joined)).metaStyle()
            if !profile.isSelf && profile.isConnected {
                OrganicIcon(.userCheck, size: 20, color: Tokens.terracotta)
                    .accessibilityLabel(L10n.Profile.connected)
            }
        }
    }

    /// "TW" → "🇹🇼 台灣" in the reader's language; free text stays as it is.
    static func regionLabel(_ region: String) -> String {
        guard region.count == 2, region.allSatisfy(\.isLetter) else { return region }
        let code = region.uppercased()
        let flag = code.unicodeScalars.compactMap { Unicode.Scalar(127397 + $0.value) }.map(String.init).joined()
        let name = Strings.shared.locale.localizedString(forRegionCode: code) ?? code
        return "\(flag) \(name)"
    }
}

private extension View {
    func metaStyle() -> some View {
        font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
    }
}
