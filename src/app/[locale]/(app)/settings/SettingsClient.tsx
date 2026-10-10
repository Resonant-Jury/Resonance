'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { useAppChrome } from '@/components/providers/AppChrome';
import { Field, Input, Select } from '@/components/atoms/Field/Field';
import { SquareFlag } from '@/components/atoms/SquareFlag/SquareFlag';
import { PROFILE_REGIONS, regionDisplayName } from '@/lib/regionName';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicLink } from '@/components/atoms/OrganicLink/OrganicLink';
import { OrganicSlider } from '@/components/atoms/OrganicSlider/OrganicSlider';
import { OrganicTabs } from '@/components/molecules/OrganicTabs/OrganicTabs';
import { AvatarUpload } from '@/components/molecules/AvatarUpload/AvatarUpload';
import { HANDLE_FORBIDDEN, isHandleTaken, updateProfile } from '@/lib/db/firestore/client/profile';
import { requestRevalidate } from '@/lib/db/firestore/client/revalidate';
import { SignOutConfirmModal } from '@/components/molecules/SignOutConfirmModal/SignOutConfirmModal';
import { DeleteAccountSection } from './DeleteAccountSection';
import { NotificationsSection } from './NotificationsSection';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTweaks } from '@/components/providers/TweaksPanel';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/lib/db/types';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';

// The block list loads when first opened, not with the settings page.
const BlockedListModal = dynamic(() =>
  import('@/components/molecules/BlockedListModal/BlockedListModal').then((m) => m.BlockedListModal),
);

type Section =
  | 'profile'
  | 'account'
  | 'privacy'
  | 'notifications'
  | 'language'
  | 'appearance'
  | 'terms'
  | 'delete';

const SECTIONS: Section[] = [
  'profile',
  'account',
  'privacy',
  'notifications',
  'language',
  'appearance',
  'terms',
  'delete',
];

/** The public profile page (/u/{handle}) is ISR-cached; its share metadata
 *  only changes when the profile is saved, so bust the cache on save instead
 *  of polling. CJK handles live at a percent-encoded URL — revalidate both. */
function profilePaths(...handles: string[]): string[] {
  return [...new Set(handles.flatMap((h) => [`/u/${h}`, `/u/${encodeURIComponent(h)}`]))];
}

/** Hand-drawn glyph leading each row in the phone settings menu. */
const SECTION_ICONS: Record<Section, IconName> = {
  profile: 'user',
  account: 'key',
  privacy: 'lock',
  notifications: 'bell',
  language: 'globe',
  appearance: 'palette',
  terms: 'document',
  delete: 'trash',
};

export interface SettingsClientProps {
  initial: {
    handle: string;
    bio: string;
    region: string;
    primaryLocale: Locale;
    autoTranslateTo: Locale[];
    avatarUrl?: string;
    initials: string;
    accentColor: string;
  };
}

export function SettingsClient({ initial }: SettingsClientProps) {
  const t = useTranslations('settings');
  const tAuth = useTranslations('auth');
  const tTweaks = useTranslations('tweaks');
  const tFooter = useTranslations('footer');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const { setMobileHeader } = useAppChrome();
  const { state: tweaks, update: updateTweaks } = useTweaks();
  const [active, setActive] = useState<Section>('profile');
  // Phones use a two-level master/detail flow: 'menu' lists the sections as
  // tappable rows, 'detail' shows one section's controls. Desktop ignores this
  // and renders the side-nav + content grid.
  const [mobileView, setMobileView] = useState<'menu' | 'detail'>('menu');
  const [handle, setHandle] = useState(initial.handle);
  // The server refused the typed pen name: someone else holds it.
  const [handleTaken, setHandleTaken] = useState(false);
  const [bio, setBio] = useState(initial.bio);
  const [region, setRegion] = useState(initial.region);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [primaryLocale, setPrimaryLocale] = useState<Locale>(initial.primaryLocale);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [blockListOpen, setBlockListOpen] = useState(false);
  const blockListLoaded = useOpenedOnce(blockListOpen);
  // Below this width the layout switches to the phone master/detail flow.
  const isMobile = useIsMobile(760);

  // The phone detail view exists as a real history entry, so the hardware /
  // browser Back key steps detail → menu instead of leaving /settings.
  // Opening a section pushes a sentinel entry (Next's own state spread in —
  // the router reads its tree from history.state); the popstate that consumes
  // it folds the view back to the menu. The header's ← is history.back(), so
  // both back affordances travel the same path and the sentinel never leaks.
  const mobileViewRef = useRef(mobileView);
  mobileViewRef.current = mobileView;
  const openSection = (s: Section) => {
    setActive(s);
    setMobileView('detail');
    const base = (window.history.state ?? {}) as Record<string, unknown>;
    window.history.pushState({ ...base, __settingsDetail: true }, '', window.location.href);
  };
  useEffect(() => {
    const onPop = () => {
      if (mobileViewRef.current === 'detail') setMobileView('menu');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // In the phone detail view the app header takes over as the screen chrome:
  // a back control + the current section's name, nothing else. Cleared whenever
  // we're on the menu, on desktop, or when leaving settings entirely.
  useEffect(() => {
    if (!(isMobile && mobileView === 'detail')) {
      setMobileHeader(null);
      return;
    }
    setMobileHeader({ title: t(`sections.${active}`), onBack: () => window.history.back() });
    return () => setMobileHeader(null);
  }, [isMobile, mobileView, active, t, setMobileHeader]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
      window.location.href = `/${locale}/signin`;
    } catch {
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  }


  // Autosave: profile fields persist on their own a moment after editing stops
  // (no Save button). Values travel through refs so the debounce timer, the
  // unmount flush, and the UI-locale switch (which remounts this component)
  // all save the same latest state. Only fields that differ from the last
  // successful save are written; a failed save keeps them marked dirty so the
  // next edit retries.
  const savedProfileRef = useRef({
    handle: initial.handle,
    bio: initial.bio,
    region: initial.region,
    primaryLocale: initial.primaryLocale,
  });
  const profileRef = useRef({ handle, bio, region, primaryLocale });
  profileRef.current = { handle, bio, region, primaryLocale };
  // The last pen name the server refused, so later flushes don't resend it.
  const refusedHandleRef = useRef<string | null>(null);

  const flushProfile = useCallback(() => {
    const prev = savedProfileRef.current;
    const cur = profileRef.current;
    const patch: Parameters<typeof updateProfile>[0] = {};
    if (cur.bio !== prev.bio) patch.bio = cur.bio;
    if (cur.region !== prev.region) patch.region = cur.region;
    if (cur.primaryLocale !== prev.primaryLocale) patch.primaryLocale = cur.primaryLocale;
    if (Object.keys(patch).length) {
      const saved = { bio: cur.bio, region: cur.region, primaryLocale: cur.primaryLocale };
      void updateProfile(patch)
        .then(() => {
          savedProfileRef.current = { ...savedProfileRef.current, ...saved };
          void requestRevalidate(profilePaths(savedProfileRef.current.handle));
        })
        .catch((err) => console.error('Profile autosave failed:', err));
    }

    // The pen name saves on its own, so a name someone else holds never holds
    // back the rest. One too short to be a name (an emptied field included)
    // is never saved — the field stays dirty until it holds a real name again.
    const name = cur.handle.trim();
    if (name === prev.handle || name.length < 2 || name === refusedHandleRef.current) return;
    void updateProfile({ handle: name })
      .then(() => {
        const old = savedProfileRef.current.handle;
        savedProfileRef.current = { ...savedProfileRef.current, handle: name };
        // Old handle too — that cached page must stop serving the profile
        // under its former name.
        void requestRevalidate(profilePaths(name, old));
      })
      .catch((err) => {
        if (!isHandleTaken(err)) return console.error('Profile autosave failed:', err);
        refusedHandleRef.current = name;
        setHandleTaken(true);
      });
  }, []);

  useEffect(() => {
    const h = setTimeout(flushProfile, 800);
    return () => clearTimeout(h);
  }, [handle, bio, region, primaryLocale, flushProfile]);

  // Edits younger than the debounce would be lost when the component unmounts
  // (leaving /settings, or the UI-locale switch remounting the tree) — flush
  // them; the async write outlives the component.
  useEffect(() => () => flushProfile(), [flushProfile]);

  const titleStyle: CSSProperties = {
    fontFamily: 'var(--font-heading)',
    fontSize: 'clamp(28px, 4vw, 36px)',
    fontWeight: 700,
  };

  const sectionContent = (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {active === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <AvatarUpload
              src={avatarUrl}
              initials={initial.initials || handle.slice(0, 2).toUpperCase()}
              accentColor={initial.accentColor}
              seed={77}
              onUploaded={async (url) => {
                // Saved before the crop dialog closes, so a failure is said there;
                // then the public profile — under the last-saved handle — is refreshed.
                await updateProfile({ avatarUrl: url });
                setAvatarUrl(url);
                void requestRevalidate(profilePaths(savedProfileRef.current.handle));
              }}
            />
            <Field
              label={t('profile.handle')}
              hint={handleTaken ? tAuth('handleTaken') : undefined}
              hintTone={handleTaken ? 'error' : 'default'}
            >
              <Input
                seed={31}
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value.replace(HANDLE_FORBIDDEN, '').slice(0, 20));
                  setHandleTaken(false);
                }}
              />
            </Field>
            <Field label={t('profile.bio')}>
              <Input
                seed={37}
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 80))}
              />
            </Field>
            <Field label={t('profile.region')}>
              <Select seed={43} value={region} onChange={setRegion}>
                {PROFILE_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    <SquareFlag code={r.toLowerCase()} size={18} />
                    {regionDisplayName(r, locale)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {active === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Field label={t('account.email')}>
              <Input
                seed={51}
                value={auth.user?.email ?? ''}
                placeholder="you@example.com"
                disabled
              />
            </Field>
            <Field label={t(auth.user?.phoneNumber ? 'account.phoneVerified' : 'account.phone')}>
              <Input
                seed={57}
                value={auth.user?.phoneNumber ?? ''}
                placeholder="—"
                disabled
              />
            </Field>
            <div style={{ marginTop: 4 }}>
              <OrganicButton variant="outline" onClick={() => setConfirmingSignOut(true)} loading={signingOut}>
                {t('account.signOut')}
              </OrganicButton>
            </div>
          </div>
        )}
        {active === 'privacy' && (
          <div>
            <OrganicButton variant="outline" onClick={() => setBlockListOpen(true)}>
              {t('privacy.manageBlocks')}
            </OrganicButton>
          </div>
        )}
        {active === 'notifications' && <NotificationsSection />}
        {active === 'language' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Field label={t('language.ui')}>
              <Select
                seed={61}
                value={locale}
                onChange={(v) => router.replace(pathname, { locale: v as Locale })}
              >
                <option value="zh-TW">
                  <SquareFlag code="tw" size={18} />
                  繁體中文
                </option>
                <option value="en">
                  <SquareFlag code="gb" size={18} />
                  English
                </option>
              </Select>
            </Field>
            <Field label={t('language.original')}>
              <Select
                seed={63}
                value={primaryLocale}
                onChange={(v) => setPrimaryLocale(v as Locale)}
              >
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
              </Select>
            </Field>
          </div>
        )}
        {active === 'appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Field label={tTweaks('accentColor')}>
              <Select
                seed={71}
                value={tweaks.accentColor}
                onChange={(v) => updateTweaks({ accentColor: v })}
              >
                <option value="terracotta">{tTweaks('accentTerracotta')}</option>
                <option value="sage">{tTweaks('accentSage')}</option>
                <option value="lavender">{tTweaks('accentLavender')}</option>
                <option value="yellow">{tTweaks('accentYellow')}</option>
              </Select>
            </Field>
            <Field label={tTweaks('fontFamily')}>
              <Select
                seed={77}
                value={tweaks.fontFamily}
                onChange={(v) => updateTweaks({ fontFamily: v })}
              >
                <option value="default">{tTweaks('fontDefault')}</option>
                <option value="handwritten">{tTweaks('fontHandwritten')}</option>
              </Select>
            </Field>
            <Field label={tTweaks('grainIntensity')}>
              <OrganicSlider
                seed={91}
                min={0}
                max={3}
                step={1}
                value={tweaks.grainIntensity}
                onChange={(v) => updateTweaks({ grainIntensity: v })}
                ariaLabel={tTweaks('grainIntensity')}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  marginTop: 4,
                }}
              >
                <span>{tTweaks('grainNone')}</span>
                <span>{tTweaks('grainSoft')}</span>
                <span>{tTweaks('grainMedium')}</span>
                <span>{tTweaks('grainHeavy')}</span>
              </div>
            </Field>
          </div>
        )}
        {active === 'terms' && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 18, fontSize: 16 }}>
            {(['privacy', 'terms', 'contact'] as const).map((k) => (
              <li key={k}>
                <OrganicLink href={`/${locale}/${k === 'contact' ? 'support' : k}`}>{tFooter(k)}</OrganicLink>
              </li>
            ))}
          </ul>
        )}
        {active === 'delete' && <DeleteAccountSection />}
    </section>
  );

  const modal = (
    <>
      <SignOutConfirmModal
        open={confirmingSignOut}
        busy={signingOut}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => void signOut()}
      />
      {blockListLoaded && <BlockedListModal open={blockListOpen} onClose={() => setBlockListOpen(false)} />}
    </>
  );

  // Phone layout: a settings menu (rows → detail) that mirrors how native OS
  // settings work, so the sections read as tappable destinations rather than a
  // sideways-scrolling strip whose overflow was invisible.
  if (isMobile) {
    if (mobileView === 'menu') {
      return (
        <div>
          <h1 style={{ ...titleStyle, marginBottom: 18 }}>{t('title')}</h1>
          <div>
            {SECTIONS.map((s, i) => {
              const danger = s === 'delete';
              const tint = danger
                ? 'var(--color-danger, oklch(58% 0.16 25))'
                : 'var(--color-terracotta)';
              return (
                <Fragment key={s}>
                  {i > 0 && <Divider seed={40 + i * 6} spacing={2} />}
                  <button
                    type="button"
                    onClick={() => openSection(s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      width: '100%',
                      padding: '18px 4px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontSize: 16,
                      textAlign: 'left',
                      color: danger ? tint : 'var(--color-text)',
                    }}
                  >
                    <Icon name={SECTION_ICONS[s]} size={22} color={tint} />
                    <span style={{ flex: 1, minWidth: 0 }}>{t(`sections.${s}`)}</span>
                    <Icon
                      name="chevron-down"
                      size={18}
                      color="var(--color-text-muted)"
                      style={{ transform: 'rotate(-90deg)' }}
                    />
                  </button>
                </Fragment>
              );
            })}
          </div>
          {modal}
        </div>
      );
    }

    // Back control + section title live in the app header (takeover, set
    // above), so the detail body is just the controls.
    return (
      <div>
        {sectionContent}
        {modal}
      </div>
    );
  }

  // Desktop: title + vertical section nav in the left column, content on the
  // right, level with the title.
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px minmax(0, 1fr)',
        columnGap: 40,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ ...titleStyle, marginBottom: 28 }}>{t('title')}</h1>
        <OrganicTabs
          aria-label={t('sections.profile')}
          orientation="vertical"
          seed={41}
          tabs={SECTIONS.map((s) => ({ key: s, label: t(`sections.${s}`) }))}
          active={active}
          onChange={setActive}
        />
      </div>

      {sectionContent}

      {modal}
    </div>
  );
}
