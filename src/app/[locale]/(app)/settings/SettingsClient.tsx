'use client';

import { Fragment, useEffect, useState, useTransition, type CSSProperties } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { useAppChrome } from '@/components/providers/AppChrome';
import { Field, Input, Select } from '@/components/atoms/Field/Field';
import { SquareFlag } from '@/components/atoms/SquareFlag/SquareFlag';
import { regionDisplayName } from '@/lib/regionName';
import { Divider } from '@/components/atoms/Divider/Divider';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import { OrganicSlider } from '@/components/atoms/OrganicSlider/OrganicSlider';
import { OrganicTabs } from '@/components/molecules/OrganicTabs/OrganicTabs';
import { AvatarUpload } from '@/components/molecules/AvatarUpload/AvatarUpload';
import { updateProfile } from '@/lib/db/firestore/client/profile';
import { requestRevalidate } from '@/lib/db/firestore/client/revalidate';
import { SignOutConfirmModal } from '@/components/molecules/SignOutConfirmModal/SignOutConfirmModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTweaks } from '@/components/providers/TweaksPanel';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/lib/db/types';

type Section =
  | 'profile'
  | 'account'
  | 'privacy'
  | 'notifications'
  | 'language'
  | 'appearance'
  | 'ai'
  | 'terms'
  | 'delete';

/** Selectable home regions — each renders its masked square flag plus the
 *  country's full name localized to the current UI language. */
const REGIONS = ['TW', 'JP', 'US', 'KR'] as const;

const SECTIONS: Section[] = [
  'profile',
  'account',
  'privacy',
  'notifications',
  'language',
  'appearance',
  'ai',
  'terms',
  'delete',
];

/** Hand-drawn glyph leading each row in the phone settings menu. */
const SECTION_ICONS: Record<Section, IconName> = {
  profile: 'user',
  account: 'key',
  privacy: 'lock',
  notifications: 'bell',
  language: 'globe',
  appearance: 'palette',
  ai: 'sparkle',
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
  const tTweaks = useTranslations('tweaks');
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
  const [bio, setBio] = useState(initial.bio);
  const [region, setRegion] = useState(initial.region);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [primaryLocale, setPrimaryLocale] = useState<Locale>(initial.primaryLocale);
  const [savedTick, setSavedTick] = useState(false);
  const [pending, start] = useTransition();
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  // Below this width the layout switches to the phone master/detail flow.
  const isMobile = useIsMobile(760);

  // In the phone detail view the app header takes over as the screen chrome:
  // a back control + the current section's name, nothing else. Cleared whenever
  // we're on the menu, on desktop, or when leaving settings entirely.
  useEffect(() => {
    if (!(isMobile && mobileView === 'detail')) {
      setMobileHeader(null);
      return;
    }
    setMobileHeader({ title: t(`sections.${active}`), onBack: () => setMobileView('menu') });
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

  const [prefs, setPrefs] = useState({
    searchable: true,
    aiOptIn: false,
    notifResonance: true,
    notifConnection: true,
    notifDm: true,
    notifTranslation: true,
    aiPolish: true,
    aiTags: true,
    aiHints: false,
  });
  function togglePref<K extends keyof typeof prefs>(k: K) {
    setPrefs((p) => ({ ...p, [k]: !p[k] }));
  }

  // The public profile page (/u/{handle}) is ISR-cached; its share metadata
  // only changes when the profile is saved, so bust the cache here instead of
  // polling. CJK handles live at a percent-encoded URL — revalidate both forms.
  function profilePaths(...handles: string[]): string[] {
    return [...new Set(handles.flatMap((h) => [`/u/${h}`, `/u/${encodeURIComponent(h)}`]))];
  }

  function save() {
    start(async () => {
      const patch: Parameters<typeof updateProfile>[0] = { bio, region, primaryLocale };
      if (handle !== initial.handle) patch.handle = handle;
      if (avatarUrl !== initial.avatarUrl) patch.avatarUrl = avatarUrl;
      await updateProfile(patch);
      // Old handle too when it changed — that cached page must stop serving
      // the profile under its former name.
      void requestRevalidate(profilePaths(handle, initial.handle));
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1800);
      // If the UI locale needs to change, navigate (next-intl Link handles
      // locale prefix). Saving primaryLocale does not change the URL locale
      // automatically — user must confirm switch.
      if (
        (primaryLocale === 'en' || primaryLocale === 'zh-TW') &&
        primaryLocale !== locale
      ) {
        router.replace('/settings', { locale: primaryLocale });
      }
    });
  }

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
              onUploaded={(url) => {
                setAvatarUrl(url);
                // Persist immediately so the header avatar updates without
                // waiting for the Save button; the public profile is saved
                // under the *current* handle, so bust that cache entry.
                void updateProfile({ avatarUrl: url }).then(() =>
                  requestRevalidate(profilePaths(initial.handle)),
                );
              }}
            />
            <Field label={t('profile.handle')} hint={t('profile.handleCooldown')}>
              <Input
                seed={31}
                value={handle}
                onChange={(e) => setHandle(e.target.value.slice(0, 20))}
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
                {REGIONS.map((r) => (
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
            <Field label={t('account.phone')}>
              <Input
                seed={57}
                value={auth.user?.phoneNumber ?? ''}
                placeholder="—"
                disabled
              />
            </Field>
            <div style={{ marginTop: 4 }}>
              <OrganicButton variant="outline" onClick={() => setConfirmingSignOut(true)}>
                {signingOut ? '…' : t('account.signOut')}
              </OrganicButton>
            </div>
          </div>
        )}
        {active === 'privacy' && (
          <>
            <ToggleGroup
              seed={71}
              rows={[
                { key: 'searchable', label: t('privacy.searchable'), on: prefs.searchable, onToggle: () => togglePref('searchable') },
                { key: 'aiOptIn', label: t('privacy.aiOptIn'), on: prefs.aiOptIn, onToggle: () => togglePref('aiOptIn') },
              ]}
            />
            <div style={{ marginTop: 28 }}>
              <OrganicButton variant="outline">{t('privacy.manageBlocks')}</OrganicButton>
            </div>
          </>
        )}
        {active === 'notifications' && (
          <ToggleGroup
            seed={83}
            rows={[
              { key: 'resonance', label: t('notifications.resonance'), on: prefs.notifResonance, onToggle: () => togglePref('notifResonance') },
              { key: 'connection', label: t('notifications.connection'), on: prefs.notifConnection, onToggle: () => togglePref('notifConnection') },
              { key: 'dm', label: t('notifications.dm'), on: prefs.notifDm, onToggle: () => togglePref('notifDm') },
              { key: 'translation', label: t('notifications.translation'), on: prefs.notifTranslation, onToggle: () => togglePref('notifTranslation') },
            ]}
          />
        )}
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
            <Field label={tTweaks('cardDensity')}>
              <Select
                seed={83}
                value={tweaks.cardDensity}
                onChange={(v) => updateTweaks({ cardDensity: v })}
              >
                <option value="normal">{tTweaks('densityNormal')}</option>
                <option value="compact">{tTweaks('densityCompact')}</option>
                <option value="airy">{tTweaks('densityAiry')}</option>
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
        {active === 'ai' && (
          <ToggleGroup
            seed={97}
            rows={[
              { key: 'polish', label: t('ai.polish'), on: prefs.aiPolish, onToggle: () => togglePref('aiPolish') },
              { key: 'tags', label: t('ai.tags'), on: prefs.aiTags, onToggle: () => togglePref('aiTags') },
              { key: 'hints', label: t('ai.hints'), on: prefs.aiHints, onToggle: () => togglePref('aiHints') },
            ]}
          />
        )}
        {active === 'terms' && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            The terms page will live here — {t('sections.terms')}.
          </p>
        )}
        {active === 'delete' && (
          <>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, marginBottom: 8 }}>
              {t('delete.title')}
            </h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 18 }}>
              {t('delete.warn')}
            </p>
            <OrganicButton variant="outline">{t('delete.button')}</OrganicButton>
          </>
        )}

        {(active === 'profile' || active === 'account' || active === 'language') && (
          <div style={{ marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
            <OrganicButton variant="primary" onClick={save}>
              {pending ? '…' : t('save')}
            </OrganicButton>
            {savedTick && (
              <span style={{ color: 'var(--color-sage, oklch(55% 0.13 140))', fontSize: 13 }}>
                {t('saved')}
              </span>
            )}
          </div>
        )}
    </section>
  );

  const modal = (
    <SignOutConfirmModal
      open={confirmingSignOut}
      busy={signingOut}
      onCancel={() => setConfirmingSignOut(false)}
      onConfirm={() => void signOut()}
    />
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
                    onClick={() => {
                      setActive(s);
                      setMobileView('detail');
                    }}
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

interface ToggleRowSpec {
  key: string;
  label: string;
  on: boolean;
  onToggle: () => void;
}

/** A stack of toggle rows separated by wavy hand-drawn dividers (no flat
 * borders), with generous row padding so the section breathes. */
function ToggleGroup({ rows, seed = 17 }: { rows: ToggleRowSpec[]; seed?: number }) {
  return (
    <div>
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          {i > 0 && <Divider seed={seed + i * 4} spacing={6} />}
          <ToggleRow label={row.label} on={row.on} onToggle={row.onToggle} seed={seed + i * 13} />
        </Fragment>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onToggle,
  seed,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  seed?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '20px 2px',
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--color-text)' }}>{label}</span>
      <ToggleSwitch checked={on} onChange={onToggle} ariaLabel={label} seed={seed} />
    </div>
  );
}
