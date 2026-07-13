'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * A mobile "takeover" header requested by the current page. When set, the
 * {@link AppHeader} drops its brand + right-hand controls and shows just a back
 * control and the given title — the standard master/detail pattern (settings
 * detail, and anywhere else a phone screen wants to own the top bar). Desktop
 * layouts never set this, so the normal header stays.
 */
export interface MobileHeaderTakeover {
  title: string;
  onBack: () => void;
}

interface AppChromeValue {
  mobileHeader: MobileHeaderTakeover | null;
  setMobileHeader: (h: MobileHeaderTakeover | null) => void;
}

const AppChromeContext = createContext<AppChromeValue | null>(null);

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [mobileHeader, setMobileHeader] = useState<MobileHeaderTakeover | null>(null);
  const value = useMemo(() => ({ mobileHeader, setMobileHeader }), [mobileHeader]);
  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>;
}

/** Safe outside the provider (e.g. auth pages) — returns a no-op setter. */
export function useAppChrome(): AppChromeValue {
  return (
    useContext(AppChromeContext) ?? {
      mobileHeader: null,
      setMobileHeader: () => {},
    }
  );
}
