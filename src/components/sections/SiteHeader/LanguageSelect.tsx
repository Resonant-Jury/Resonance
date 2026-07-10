'use client';

import { useLocale } from 'next-intl';
import { Select } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/lib/db/types';
import styles from './SiteHeader.module.css';

/** Language self-labels — a language names itself, so these never translate. */
const LOCALE_LABELS: Record<string, string> = { en: 'English', 'zh-TW': '繁體中文' };

/**
 * The header's language picker: the same organic dropdown as the settings
 * page, compacted for header chrome. Closed it shows a globe + the current
 * language; the open panel lists each locale behind its hand-drawn flag.
 */
export function LanguageSelect() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Select
      seed={53}
      value={locale}
      ariaLabel="Language"
      className={styles.langSelect}
      onChange={(v) => router.replace(pathname, { locale: v as Locale })}
      renderValue={() => (
        <>
          <Icon name="globe" size={17} />
          {LOCALE_LABELS[locale] ?? locale}
        </>
      )}
    >
      <option value="zh-TW">
        <Icon name="flag-tw" size={17} />
        {LOCALE_LABELS['zh-TW']}
      </option>
      <option value="en">
        <Icon name="flag-en" size={17} />
        {LOCALE_LABELS.en}
      </option>
    </Select>
  );
}
