'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { toggleResonance } from '@/lib/db/firestore/client/resonances';

export interface ResonateButtonProps {
  cardId: string;
  initialResonated: boolean;
}

export function ResonateButton({ cardId, initialResonated }: ResonateButtonProps) {
  const [on, setOn] = useState(initialResonated);
  const [pending, start] = useTransition();
  const t = useTranslations('card');

  return (
    <OrganicButton
      variant={on ? 'secondary' : 'primary'}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          try {
            await toggleResonance(cardId, on);
          } catch {
            setOn(on);
          }
        });
      }}
    >
      <span
        style={{
          opacity: pending ? 0.7 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
        }}
      >
        <Icon name="wave" size={16} />
        {on ? t('resonated') : t('resonate')}
      </span>
    </OrganicButton>
  );
}
