'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Button, Icon } from '@tka/ui';
import styles from './landing.module.css';

const artwork = {
  src: '/illustrations/landing/numora-hero-approved.png',
  alt: '',
  width: 1254,
  height: 1254,
  sizes: '(min-width: 768px) 424px, 273px',
};

const layers = [
  { name: 'owl', motion: styles.heroOwl, masks: [styles.heroOwlMask] },
  { name: 'book', motion: styles.heroBook, masks: [styles.heroBookMask] },
  { name: 'pencil', motion: styles.heroPencil, masks: [styles.heroPencilMask] },
  { name: 'ruler', motion: styles.heroRuler, masks: [styles.heroRulerMask] },
  { name: 'star', motion: styles.heroStar, masks: [styles.heroStarMask, styles.heroSparkMask] },
];

export function HeroIllustration() {
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const motionLabel = paused ? 'Lanjutkan animasi hero' : 'Jeda animasi hero';

  return (
    <div className={styles.heroArt} data-hero-ready={ready} data-hero-paused={paused}>
      <Image {...artwork} className={styles.heroStill} onLoad={() => setReady(true)} preload />
      <div className={styles.heroLayers} aria-hidden="true">
        {layers.map(({ name, motion, masks }) => (
          <div key={name} className={`${styles.heroLayer} ${motion}`} data-hero-layer={name}>
            {masks.map((mask) => (
              <Image
                key={mask}
                {...artwork}
                className={`${styles.heroLayer} ${mask}`}
                loading="eager"
              />
            ))}
          </div>
        ))}
      </div>
      <div className={styles.heroMotionControl}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={motionLabel}
          title={motionLabel}
          style={{ width: 44, padding: 0 }}
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? (
            <Icon name="play" width={16} height={16} />
          ) : (
            <span className={styles.pauseMark} aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}
