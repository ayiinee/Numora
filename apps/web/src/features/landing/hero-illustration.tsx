'use client';

import Image from 'next/image';
import { useState } from 'react';
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

  return (
    <div className={styles.heroArt} aria-hidden="true" data-hero-ready={ready}>
      <Image {...artwork} className={styles.heroStill} onLoad={() => setReady(true)} preload />
      <div className={styles.heroLayers}>
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
    </div>
  );
}
