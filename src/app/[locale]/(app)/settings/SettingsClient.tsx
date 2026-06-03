'use client';

import { Fragment, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Field, Input, Select } from '@/components/atoms/Field/Field';
import { Divider } from '@/components/atoms/Divider/Divider';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import { OrganicTabs } from '@/components/molecules/OrganicTabs/OrganicTabs';
import { updateProfile } from '@/lib/db/firestore/client/profile';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTweaks } from '@/components/providers/TweaksPanel';
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

export interface SettingsClientProps {
  initial: {
    handle: string;
    bio: string;
    region: string;
    primaryLocale: Locale;
    autoTranslateTo: Locale[];
  };
}

export function SettingsClient({ initial }: SettingsClientProps) {
  const t = useTranslations('settings');
  const tTweaks = useTranslations('tweaks');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const { state: tweaks, update: updateTweaks } = useTweaks();
  const [active, setActive] = useState<Section>('profile');
  const [handle, setHandle] = useState(initial.handle);
  const [bio, setBio] = useState(initial.bio);
  const [region, setRegion] = useState(initial.region);
  const [primaryLocale, setPrimaryLocale] = useState<Locale>(initial.primaryLocale);
  const [savedTick, setSavedTick] = useState(false);
  const [pending, start] = useTransition();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
      window.location.href = `/${locale}/signin`;
    } catch {
      setSigningOut(false);
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

  function save() {
    start(async () => {
      const patch: Parameters<typeof updateProfile>[0] = { bio, region, primaryLocale };
      if (handle !== initial.handle) patch.handle = handle;
      await updateProfile(patch);
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px minmax(0, 1fr)',
        gap: 40,
      }}
      className="settings-grid"
    >
      <style>{`
        @media (max-width: 760px) {
          .settings-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
      `}</style>
      <OrganicTabs
        aria-label={t('sections.profile')}
        orientation="vertical"
        seed={41}
        className="settings-nav"
        tabs={SECTIONS.map((s) => ({ key: s, label: t(`sections.${s}`) }))}
        active={active}
        onChange={setActive}
      />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {active === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
              <Select seed={43} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="TW">🇹🇼 Taiwan</option>
                <option value="JP">🇯🇵 Japan</option>
                <option value="US">🇺🇸 United States</option>
                <option value="KR">🇰🇷 Korea</option>
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
              <OrganicButton variant="outline" onClick={signOut}>
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
                onChange={(e) => router.replace(pathname, { locale: e.target.value as Locale })}
              >
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label={t('language.original')}>
              <Select
                seed={63}
                value={primaryLocale}
                onChange={(e) => setPrimaryLocale(e.target.value as Locale)}
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
                onChange={(e) => updateTweaks({ accentColor: e.target.value })}
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
                onChange={(e) => updateTweaks({ fontFamily: e.target.value })}
              >
                <option value="default">{tTweaks('fontDefault')}</option>
                <option value="handwritten">{tTweaks('fontHandwritten')}</option>
              </Select>
            </Field>
            <Field label={tTweaks('cardDensity')}>
              <Select
                seed={83}
                value={tweaks.cardDensity}
                onChange={(e) => updateTweaks({ cardDensity: e.target.value })}
              >
                <option value="normal">{tTweaks('densityNormal')}</option>
                <option value="compact">{tTweaks('densityCompact')}</option>
                <option value="airy">{tTweaks('densityAiry')}</option>
              </Select>
            </Field>
            <Field label={tTweaks('grainIntensity')}>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={tweaks.grainIntensity}
                onChange={(e) => updateTweaks({ grainIntensity: Number(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--color-terracotta)' }}
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
