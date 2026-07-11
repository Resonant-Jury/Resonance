'use client';

import { useLocale } from 'next-intl';
import { Select } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { SquareFlag } from '@/components/atoms/SquareFlag/SquareFlag';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/lib/db/types';
import styles from './SiteHeader.module.css';

/** Language self-labels — a language names itself, so these never translate. */
const LOCALE_LABELS: Record<string, string> = { en: 'English', 'zh-TW': '繁體中文' };

/**
 * The header's language picker: the same organic dropdown as the settings
 * page, compacted for header chrome. Closed it shows a globe + the current
 * language; the open panel lists each locale behind its square flag, cropped
 * by the same hand-drawn mask as avatars.
 *
 * `compact` (used on mobile) collapses the closed trigger to just the globe
 * icon — the open panel still lists the full language names, kept readable via
 * `menuMinWidth`.
 */
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Select
      seed={53}
      value={locale}
      ariaLabel="Language"
      className={compact ? `${styles.langSelect} ${styles.langSelectCompact}` : styles.langSelect}
      menuMinWidth={compact ? 172 : undefined}
      onChange={(v) => router.replace(pathname, { locale: v as Locale })}
      renderValue={() =>
        compact ? (
          <Icon name="globe" size={19} />
        ) : (
          <>
            <Icon name="globe" size={17} />
            {LOCALE_LABELS[locale] ?? locale}
          </>
        )
      }
    >
      <option value="zh-TW">
        <SquareFlag code="tw" size={18} />
        {LOCALE_LABELS['zh-TW']}
      </option>
      <option value="en">
        <SquareFlag code="gb" size={18} />
        {LOCALE_LABELS.en}
      </option>
    </Select>
  );
}
