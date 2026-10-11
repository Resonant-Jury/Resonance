'use client';

import { useLocale, useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { DriftingBlobs, type DriftPaint } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicLink } from '@/components/atoms/OrganicLink/OrganicLink';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import { INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import { BeliefCycle, BeliefMotif, PaperCard, ResonanceSketch, type Belief } from './AboutArt';
import styles from './AboutPage.module.css';

const BELIEFS: Belief[] = ['resonance', 'depth', 'insight'];
const STEPS = ['write', 'read', 'resonate'] as const;
const SHIFTS = ['fatigue', 'depth', 'warmth'] as const;
const CONTRASTS = ['traffic', 'algorithm', 'performance', 'roles', 'followers', 'likes'] as const;

/**
 * The team, by name and face only: no school, major, year or title — we'd
 * rather be met as whole people, as the page says. The pictures are square
 * crops of the pitch deck's photos; the English names as their passports
 * spell them.
 */
const TEAM = [
  { zh: '陳念誠', en: 'Nian-Cheng Chen', src: '/team/chen.webp', seed: 11 },
  { zh: '蕭力文', en: 'Li-Wen Hsiao', src: '/team/hsiao.webp', seed: 37 },
  { zh: '方昱晴', en: 'Yu-Ching Fang', src: '/team/fang.webp', seed: 61 },
  { zh: '鄭義信', en: 'Yi-Hsin Cheng', src: '/team/cheng.webp', seed: 83 },
];

/** The course where the team met. */
const WMM_URL = 'https://www.facebook.com/friendsofstanforduniversityintaiwan/';

/** The landing hero's drifting blobs, in this hero's colours. */
const BLOB_PAINTS: DriftPaint[] = [
  { color: '--color-sage', alpha: 0.26 },
  { color: '--color-terracotta-light', alpha: 0.32 },
  { color: '--color-lavender', alpha: 0.24 },
  { color: '--color-yellow', alpha: 0.28 },
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
      {/* The hero and the mission share one paper, and the landing hero's blobs drift over all of it:
          still as the server draws them, alive once the page is, five or six at a time in this height. */}
      <div className={styles.opening}>
        <DriftingBlobs palette={BLOB_PAINTS} crowd={[5, 6]}>
          <div className={styles.blobA} data-drift="1,0.1" data-drift-color="--color-sage">
            <OrganiBlob variant={1} fill="var(--color-sage)" size={320} grain={0.2} />
          </div>
          <div className={styles.blobB} data-drift="-1,-0.08" data-drift-color="--color-terracotta-light">
            <OrganiBlob variant={3} fill="var(--color-terracotta-light)" size={260} grain={0.2} />
          </div>
          <div className={styles.blobC} data-drift="1,-0.12" data-drift-color="--color-lavender">
            <OrganiBlob variant={2} fill="var(--color-lavender)" size={240} grain={0.2} />
          </div>
          <div className={styles.blobD} data-drift="-1,0.06" data-drift-color="--color-yellow">
            <OrganiBlob variant={0} fill="var(--color-yellow)" size={200} grain={0.2} />
          </div>
        </DriftingBlobs>

        <section className={styles.hero}>
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
            <div className={styles.pull}>
              <Divider orientation="vertical" seed={53} amplitude={2.2} strokeWidth={INK_STRONG} color="var(--about-insight)" spacing={0} />
              <p className={styles.prose}>{t('belief.p3')}</p>
            </div>
          </div>
        </section>
      </div>

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
              <li key={s}>
                <PaperCard seed={97 + i * 23} className={styles.shift}>
                  <span className={styles.shiftNum} aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className={styles.shiftTitle}>{t(`shift.${s}.title`)}</h3>
                  <p className={styles.shiftBody}>{t(`shift.${s}.body`)}</p>
                </PaperCard>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="about-compare">
        <SectionEdge topColor="var(--color-cream-dark)" seed={383} height={80} amplitude={0.14} stroke={EDGE_PEN} strokeWidth={INK_LIGHT} />
        <div className={styles.wide}>
          <Heading kicker={t('compare.kicker')} title={t('compare.title')} id="about-compare" />
          {/* Centred on the arrows: what platforms do set flush against them, ours leading away. */}
          <div className={styles.compare} role="table" aria-label={t('compare.title')}>
            <div className={styles.compareRow} role="row">
              <span className={`${styles.them} ${styles.compareHead}`} role="columnheader">
                {t('compare.them')}
              </span>
              <span aria-hidden="true" />
              <span className={`${styles.us} ${styles.compareHead}`} role="columnheader">
                {t('compare.us')}
              </span>
            </div>
            {CONTRASTS.map((c, i) => (
              <div key={c} role="rowgroup">
                <Divider seed={211 + i * 7} amplitude={1.6} steps={9} spacing={0} />
                <div className={styles.compareRow} role="row">
                  <span className={styles.them} role="cell">
                    {t(`compare.${c}.them`)}
                  </span>
                  <span className={styles.arrow} aria-hidden="true">
                    <svg viewBox="0 0 40 16" width={40} height={16}>
                      <path d="M 2,8.5 C 12,6.5 24,10 35,8" fill="none" stroke="var(--color-terracotta)" strokeWidth={INK_LIGHT} strokeLinecap="round" />
                      <path d="M 29,3.5 L 36,8 L 29.5,12.5" fill="none" stroke="var(--color-terracotta)" strokeWidth={INK_LIGHT} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className={styles.us} role="cell">
                    {t(`compare.${c}.us`)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.band} ${styles.dark}`} aria-labelledby="about-team">
        <SectionEdge topColor="var(--color-cream)" seed={409} height={80} amplitude={0.14} stroke={EDGE_PEN} strokeWidth={INK_LIGHT} />
        <div className={styles.wide}>
          <Heading kicker={t('team.kicker')} title={t('team.title')} id="about-team" />
          <p className={styles.intro}>
            {t.rich('team.body', {
              wmm: (chunks) => (
                <OrganicLink href={WMM_URL} seed={29}>
                  {chunks}
                </OrganicLink>
              ),
            })}
          </p>
          <ul className={styles.team}>
            {TEAM.map((m) => (
              <li key={m.zh} className={styles.member}>
                <HandDrawnAvatar src={m.src} initials={latin ? m.en : m.zh} size={112} seed={m.seed} />
                <span className={styles.memberName}>{latin ? m.en : m.zh}</span>
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
