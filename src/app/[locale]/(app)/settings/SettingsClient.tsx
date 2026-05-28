'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Field, authInputStyle } from '@/components/molecules/AuthCard/AuthCard';
import { updateProfile } from '@/lib/db/firestore/client/profile';
import type { Locale } from '@/lib/db/types';

type Section = 'profile' | 'account' | 'privacy' | 'notifications' | 'language' | 'ai' | 'terms' | 'delete';

const SECTIONS: Section[] = [
  'profile',
  'account',
  'privacy',
  'notifications',
  'language',
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
  const [active, setActive] = useState<Section>('profile');
  const [handle, setHandle] = useState(initial.handle);
  const [bio, setBio] = useState(initial.bio);
  const [region, setRegion] = useState(initial.region);
  const [primaryLocale, setPrimaryLocale] = useState<Locale>(initial.primaryLocale);
  const [savedTick, setSavedTick] = useState(false);
  const [pending, start] = useTransition();

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
      await updateProfile({ handle, bio, region, primaryLocale });
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1800);
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
          .settings-nav { flex-direction: row !important; overflow-x: auto; padding-bottom: 8px; }
        }
      `}</style>
      <nav
        className="settings-nav"
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            style={{
              padding: '10px 14px',
              textAlign: 'left',
              border: 'none',
              background: active === s ? 'oklch(92% 0.05 55 / 0.45)' : 'transparent',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: active === s ? 600 : 500,
              color: active === s ? 'var(--color-terracotta)' : 'var(--color-text)',
              cursor: 'pointer',
              borderRadius: 10,
              whiteSpace: 'nowrap',
            }}
          >
            {t(`sections.${s}`)}
          </button>
        ))}
      </nav>

      <section>
        {active === 'profile' && (
          <>
            <Field label={t('profile.handle')} hint={t('profile.handleCooldown')}>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.slice(0, 20))}
                style={authInputStyle}
              />
            </Field>
            <Field label={t('profile.bio')}>
              <input
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 80))}
                style={authInputStyle}
              />
            </Field>
            <Field label={t('profile.region')}>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{ ...authInputStyle, appearance: 'none' }}
              >
                <option value="TW">🇹🇼 Taiwan</option>
                <option value="JP">🇯🇵 Japan</option>
                <option value="US">🇺🇸 United States</option>
                <option value="KR">🇰🇷 Korea</option>
              </select>
            </Field>
          </>
        )}
        {active === 'account' && (
          <>
            <Field label={t('account.email')}>
              <input style={authInputStyle} defaultValue="you@example.com" disabled />
            </Field>
            <Field label={t('account.phone')}>
              <input style={authInputStyle} defaultValue="+886 ••• ••• 123" disabled />
            </Field>
            <Field label={t('account.password')}>
              <input style={authInputStyle} type="password" defaultValue="••••••••" />
            </Field>
          </>
        )}
        {active === 'privacy' && (
          <>
            <ToggleRow
              label={t('privacy.searchable')}
              on={prefs.searchable}
              onToggle={() => togglePref('searchable')}
            />
            <ToggleRow
              label={t('privacy.aiOptIn')}
              on={prefs.aiOptIn}
              onToggle={() => togglePref('aiOptIn')}
            />
            <div style={{ marginTop: 18 }}>
              <OrganicButton variant="outline">{t('privacy.manageBlocks')}</OrganicButton>
            </div>
          </>
        )}
        {active === 'notifications' && (
          <>
            <ToggleRow label={t('notifications.resonance')} on={prefs.notifResonance} onToggle={() => togglePref('notifResonance')} />
            <ToggleRow label={t('notifications.connection')} on={prefs.notifConnection} onToggle={() => togglePref('notifConnection')} />
            <ToggleRow label={t('notifications.dm')} on={prefs.notifDm} onToggle={() => togglePref('notifDm')} />
            <ToggleRow label={t('notifications.translation')} on={prefs.notifTranslation} onToggle={() => togglePref('notifTranslation')} />
          </>
        )}
        {active === 'language' && (
          <>
            <Field label={t('language.original')}>
              <select
                value={primaryLocale}
                onChange={(e) => setPrimaryLocale(e.target.value as Locale)}
                style={{ ...authInputStyle, appearance: 'none' }}
              >
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
              </select>
            </Field>
          </>
        )}
        {active === 'ai' && (
          <>
            <ToggleRow label={t('ai.polish')} on={prefs.aiPolish} onToggle={() => togglePref('aiPolish')} />
            <ToggleRow label={t('ai.tags')} on={prefs.aiTags} onToggle={() => togglePref('aiTags')} />
            <ToggleRow label={t('ai.hints')} on={prefs.aiHints} onToggle={() => togglePref('aiHints')} />
          </>
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
          <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
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

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 0',
        borderBottom: '1px solid oklch(85% 0.02 75)',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 15, color: 'var(--color-text)' }}>{label}</span>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          border: 'none',
          background: on
            ? 'var(--color-terracotta)'
            : 'oklch(85% 0.02 75)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 150ms',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--color-cream)',
            transition: 'left 150ms',
          }}
        />
      </button>
    </label>
  );
}
