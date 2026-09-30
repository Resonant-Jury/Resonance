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
    @State private var scrolled = false
    @State private var unblocking = false

    var body: some View {
        ScrollView {
            switch model?.phase ?? .loading {
            case .loading:
                ProfileSkeleton()
            case .notFound:
                OrganicEmptyState(title: L10n.Profile.notFound, actionTitle: L10n.Profile.backHome, actionStyle: .link) {
                    openRoute.dismissToRoot()
                }
            case .failed:
                OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                    Task { await model?.load() }
                }
            case .loaded:
                if let model, let profile = model.profile { page(model, profile) }
            }
        }
        .onHeaderScroll($scrolled)
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            OrganicInlineBar("", backLabel: L10n.App.Nav.back, scrolled: scrolled) {
                if let profile = model?.profile, !profile.isSelf {
                    SafetyMenu(target: .user(id: profile.author.id), handle: profile.author.handle, isBlocked: profile.isBlocked,
                               seed: Double(seedFromString(profile.author.id)), triggerSize: 36) {
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
                    OrganicButton(L10n.Profile.editProfile, variant: .ghost) { openRoute(.settings) }
                } else if !profile.isBlocked, profile.isConnected {
                    // Connected: a way into the conversation (the web's small ghost button with the chat glyph).
                    OrganicButton(L10n.Messages.messageLink, icon: .chat, variant: .ghost, size: .sm) {
                        openRoute(.thread(handle: author.handle, note: nil))
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 36)

            if profile.isBlocked {
                blockedNotice(author)
            } else if !model.cards.isEmpty || profile.isSelf {
                heading(L10n.Profile.publishedHeading)
                if model.cards.isEmpty {
                    // The owner's empty page teaches rather than apologizes.
                    VStack(spacing: 18) {
                        Text(L10n.Profile.emptyPublishedSelf)
                            .font(AppFonts.body(15))
                            .foregroundStyle(Tokens.textMuted)
                            .multilineTextAlignment(.center)
                        OrganicButton(L10n.Profile.emptyPublishedCta) { writer.open() }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 24)
                } else {
                    StoryCardList(cards: model.cards) { Task { await model.loadMore() } }
                }
            }
            if !model.linked.isEmpty {
                heading(L10n.Profile.linkedCards).padding(.top, 48)
                MiniCardList(cards: model.linked)
            }
            Color.clear.frame(height: 48)
        }
    }

    /// BlockedNotice: in place of their cards, with the way back.
    private func blockedNotice(_ author: Author) -> some View {
        VStack(spacing: 8) {
            Text(L10n.Safety.blockedNotice(handle: author.handle)).font(AppFonts.heading(20)).foregroundStyle(Tokens.text)
            Text(L10n.Safety.blockedNoticeBody).font(AppFonts.body(14.5)).foregroundStyle(Tokens.textMuted)
                .padding(.bottom, 8)
            OrganicButton(unblocking ? "…" : L10n.Safety.unblock, variant: .textAccent, size: .sm) {
                Task { await unblock(author.id) }
            }
            .disabled(unblocking)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 24)
    }

    private func unblock(_ id: String) async {
        guard !unblocking else { return }
        unblocking = true
        defer { unblocking = false }
        try? await session.safety?.unblock(id)
        await model?.load()
    }

    /// The web's section heading: Playfair 20, set tight, on the left.
    private func heading(_ title: String) -> some View {
        Text(title)
            .font(AppFonts.heading(20))
            .tracking(-0.01 * 20)
            .foregroundStyle(Tokens.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .accessibilityAddTraits(.isHeader)
    }

    private func meta(_ profile: Profile, author: Author) -> some View {
        let joined = ISO8601.date(profile.joinedAt).map {
            // The web's joined date: year and the month in full ("August 2026", "2026年8月").
            $0.formatted(.dateTime.year().month(.wide).locale(Strings.shared.locale))
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
    static func regionLabel(_ region: String) -> String { ProfileRegion.label(region) }
}

/// The profile's loading state: the hero's avatar, name, bio and meta as
/// blocks, then four loading cards (u/[handle]/page.tsx).
private struct ProfileSkeleton: View {
    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 16) {
                SkeletonBlock(width: 96, circle: true)
                SkeletonBlock(width: 220, height: 34, radius: 10)
                SkeletonBlock(fraction: 0.8, height: 16, alignment: .center)
                SkeletonBlock(fraction: 0.6, height: 16, alignment: .center)
                SkeletonBlock(fraction: 0.7, height: 13, alignment: .center)
            }
            // The blocks are centred like the hero they stand in for.
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 36)
            FeedSkeleton(count: 4)
        }
    }
}

private extension View {
    func metaStyle() -> some View {
        font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
    }
}
