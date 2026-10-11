'use client';

import { useLocale, useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import { INK_LIGHT } from '@/lib/design/strokes';
import { BeliefCycle, BeliefMotif, ResonanceSketch, type Belief } from './AboutArt';
import styles from './AboutPage.module.css';

const BELIEFS: Belief[] = ['resonance', 'depth', 'insight'];
const STEPS = ['write', 'read', 'resonate'] as const;
const SHIFTS = ['fatigue', 'depth', 'warmth'] as const;
const CONTRASTS = ['traffic', 'algorithm', 'performance', 'roles', 'followers', 'likes'] as const;

/**
 * The team, by name and face only: no school, major, year or title — we'd
 * rather be met as whole people, as the page says. The pictures are square
 * crops of the pitch deck's photos.
 */
const TEAM = [
  { name: '陳念誠', src: '/team/chen.webp', seed: 11 },
  { name: '蕭力文', src: '/team/hsiao.webp', seed: 37 },
  { name: '方昱晴', src: '/team/fang.webp', seed: 61 },
  { name: '鄭義信', src: '/team/cheng.webp', seed: 83 },
];

const EDGE_PEN = 'oklch(55% 0.05 60 / 0.3)';

function Heading({ kicker, title, id }: { kicker: string; title: string; id: string }) {
  return (
    <header className={styles.heading}>
      <p className={styles.kicker}>{kicker}</p>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
    </header>
  );
}

/** /about: what we believe, how Resonance answers it, and who we are. */
export function AboutPage() {
  const t = useTranslations('about');
  const latin = useLocale() !== 'zh-TW';
  const quote = (s: string) => (latin ? `“${s}”` : `「${s}」`);
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBlobA} aria-hidden="true">
          <OrganiBlob variant={1} fill="var(--color-sage)" size={320} grain={0.2} />
        </div>
        <div className={styles.heroBlobB} aria-hidden="true">
          <OrganiBlob variant={3} fill="var(--color-terracotta-light)" size={260} grain={0.2} />
        </div>
        <div className={styles.heroContent}>
          <TagPill color="var(--color-terracotta-light)">{t('tag')}</TagPill>
          <h1 className={styles.heroTitle}>{t('title')}</h1>
          <p className={styles.lead}>{t('lead')}</p>
        </div>
      </section>

      <section className={styles.belief} aria-labelledby="about-belief">
        <div className={styles.measure}>
          <Heading kicker={t('belief.kicker')} title={t('belief.title')} id="about-belief" />
          <p className={styles.prose}>{t('belief.p1')}</p>
          <p className={styles.prose}>{t('belief.p2')}</p>
          <p className={`${styles.prose} ${styles.pull}`}>{t('belief.p3')}</p>
        </div>
      </section>

      <section className={`${styles.band} ${styles.dark}`} aria-labelledby="about-cycle">
        <SectionEdge topColor="var(--color-cream)" seed={311} height={80} amplitude={0.14} stroke={EDGE_PEN} strokeWidth={INK_LIGHT} />
        <div className={styles.wide}>
          <Heading kicker={t('cycle.kicker')} title={t('cycle.title')} id="about-cycle" />
          <p className={styles.intro}>{t('cycle.intro')}</p>
          <div className={styles.cycle}>
            <div className={styles.cycleArt}>
              <BeliefCycle
                labels={{ resonance: t('cycle.resonance.name'), depth: t('cycle.depth.name'), insight: t('cycle.insight.name') }}
                center={t('cycle.center')}
                ariaLabel={t('cycle.diagramLabel')}
                compactLabels={latin}
              />
            </div>
            <ul className={styles.beliefs}>
              {BELIEFS.map((b) => (
                <li key={b} className={styles.beliefItem}>
                  <BeliefMotif belief={b} />
                  <div>
                    <h3 className={styles.beliefName}>
                      {t(`cycle.${b}.name`)}
                      <span className={styles.motto}>{quote(t(`cycle.${b}.motto`))}</span>
                    </h3>
                    <p className={styles.beliefBody}>{t(`cycle.${b}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="about-how">
        <SectionEdge topColor="var(--color-cream-dark)" seed={337} height={80} amplitude={0.14} stroke={EDGE_PEN} strokeWidth={INK_LIGHT} />
        <div className={styles.wide}>
          <Heading kicker={t('how.kicker')} title={t('how.title')} id="about-how" />
          <div className={styles.how}>
            <div className={styles.sketch}>
              <ResonanceSketch ariaLabel={t('how.sketchLabel')} />
            </div>
            <ol className={styles.steps}>
              {STEPS.map((s, i) => (
                <li key={s} className={styles.step}>
                  <span className={styles.stepNum} aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className={styles.stepTitle}>{t(`how.${s}.title`)}</h3>
                    <p className={styles.stepBody}>{t(`how.${s}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className={`${styles.band} ${styles.dark}`} aria-labelledby="about-shift">
        <SectionEdge topColor="var(--color-cream)" seed={359} height={80} amplitude={0.14} stroke={EDGE_PEN} strokeWidth={INK_LIGHT} />
        <div className={styles.wide}>
          <Heading kicker={t('shift.kicker')} title={t('shift.title')} id="about-shift" />
          <ol className={styles.shifts}>
            {SHIFTS.map((s, i) => (
              <li key={s} className={styles.shift}>
                <span className={styles.shiftNum} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.shiftTitle}>{t(`shift.${s}.title`)}</h3>
                <p className={styles.shiftBody}>{t(`shift.${s}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="about-compare">
        <SectionEdge topColor="var(--color-cream-dark)" seed={383} height={80} amplitude={0.14} stroke={EDGE_PEN} strokeWidth={INK_LIGHT} />
        <div className={styles.wide}>
          <Heading kicker={t('compare.kicker')} title={t('compare.title')} id="about-compare" />
          <table className={styles.compare}>
            <thead>
              <tr>
                <th scope="col" className={styles.them}>
                  {t('compare.them')}
                </th>
                <td aria-hidden="true" />
                <th scope="col" className={styles.us}>
                  {t('compare.us')}
                </th>
              </tr>
            </thead>
            <tbody>
              {CONTRASTS.map((c) => (
                <tr key={c}>
                  <td className={styles.them}>{t(`compare.${c}.them`)}</td>
                  <td className={styles.arrow} aria-hidden="true">
                    <svg viewBox="0 0 40 16" width={40} height={16}>
                      <path d="M 2,8.5 C 12,6.5 24,10 35,8" fill="none" stroke="var(--color-terracotta)" strokeWidth={INK_LIGHT} strokeLinecap="round" />
                      <path d="M 29,3.5 L 36,8 L 29.5,12.5" fill="none" stroke="var(--color-terracotta)" strokeWidth={INK_LIGHT} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                  <td className={styles.us}>{t(`compare.${c}.us`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${styles.band} ${styles.dark}`} aria-labelledby="about-team">
        <SectionEdge topColor="var(--color-cream)" seed={409} height={80} amplitude={0.14} stroke={EDGE_PEN} strokeWidth={INK_LIGHT} />
        <div className={styles.wide}>
          <Heading kicker={t('team.kicker')} title={t('team.title')} id="about-team" />
          <p className={styles.intro}>{t('team.body')}</p>
          <ul className={styles.team}>
            {TEAM.map((m) => (
              <li key={m.name} className={styles.member}>
                <HandDrawnAvatar src={m.src} initials={m.name} size={112} seed={m.seed} />
                <span className={styles.memberName}>{m.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.closing}>
        <SectionEdge topColor="var(--color-cream-dark)" seed={431} height={90} amplitude={0.13} stroke="oklch(40% 0.12 45 / 0.35)" strokeWidth={INK_LIGHT} />
        <div className={styles.closingBlob} aria-hidden="true">
          <OrganiBlob variant={2} fill="oklch(98% 0.01 75)" size={240} />
        </div>
        <div className={styles.closingContent}>
          <h2 className={styles.closingTitle}>{t('closing.title')}</h2>
          <p className={styles.closingBody}>{t('closing.body')}</p>
          {/* The deck's closing line, in English in both languages, as the brand's own words. */}
          <p className={styles.motto2} lang="en">
            Let lives influence lives
          </p>
          <Link href="/write" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="ctaLight">{t('closing.start')}</OrganicButton>
          </Link>
        </div>
      </section>
    </main>
  );
}
