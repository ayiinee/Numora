'use client';

import { useEffect, useId, useRef, useState } from 'react';
import landingStyles from './landing.module.css';
import styles from './practice-illustration.module.css';

export function PracticeIllustration() {
  const root = useRef<HTMLDivElement>(null);
  const postId = useId();
  const postHref = '#' + postId;
  const [visibility, setVisibility] = useState<'waiting' | 'visible' | 'hidden'>('waiting');

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const threshold = 0.2;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setVisibility((previous) => {
          if (entry.intersectionRatio >= threshold) return 'visible';
          return previous === 'waiting' ? previous : 'hidden';
        });
      },
      { threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`${landingStyles.practiceArt} ${styles.illustration}`}
      ref={root}
      data-visibility={visibility}
    >
      <svg
        className={styles.scene}
        width="460"
        height="472"
        viewBox="0 0 460 472"
        role="img"
        aria-label="Ilustrasi latihan perkalian: siswa dan burung hantu Numora merayakan jawaban yang benar."
      >
        <defs>
          <g id={postId}>
            <rect x="-6" y="0" width="12" height="54" rx="5" fill="#f8d080" />
            <path d="M0 4v42" stroke="#ffeab2" strokeWidth="4" strokeLinecap="round" />
            <circle cy="-7" r="8" fill="#ffd56a" />
            <circle cx="-2" cy="-9" r="3" fill="#ffeaac" />
            <rect x="-10" y="0" width="20" height="6" rx="3" fill="#edb849" />
            <rect x="-18" y="50" width="36" height="11" rx="5.5" fill="#edb849" />
            <rect x="-18" y="49" width="36" height="7" rx="3.5" fill="#ffda78" />
          </g>
        </defs>

        {/* Upright exercise screen */}
        <rect x="123" y="26" width="213" height="331" rx="27" fill="#e7ac42" />
        <rect
          x="123"
          y="22"
          width="208"
          height="329"
          rx="26"
          fill="#fff"
          stroke="#f2bf59"
          strokeWidth="7"
        />
        <rect x="144" y="50" width="166" height="11" rx="5.5" fill="#ebe7ef" />
        <rect data-layer="meter" x="144" y="50" width="102" height="11" rx="5.5" fill="#a667ed" />
        <text x="227" y="105" fontSize="30" fontWeight="800" fill="#38234c" textAnchor="middle">
          3 × 4 = ?
        </text>
        <g fill="#f2edf7">
          <rect x="141" y="130" width="81" height="71" rx="12" />
          <rect x="232" y="130" width="81" height="71" rx="12" />
          <rect x="141" y="210" width="81" height="71" rx="12" />
          <rect x="232" y="210" width="81" height="71" rx="12" />
        </g>
        <g textAnchor="middle" fontSize="28" fontWeight="800" fill="#623594">
          <text x="181.5" y="175">
            8
          </text>
          <text x="272.5" y="175">
            12
          </text>
          <text x="181.5" y="255">
            16
          </text>
          <text x="272.5" y="255">
            24
          </text>
        </g>
        <g data-layer="correct">
          <rect x="232" y="130" width="81" height="71" rx="12" fill="#e9d4ff" />
          <rect
            x="233.5"
            y="131.5"
            width="78"
            height="68"
            rx="10.5"
            fill="none"
            stroke="#b880f0"
            strokeWidth="3"
          />
          <text x="272.5" y="175" textAnchor="middle" fontSize="28" fontWeight="800" fill="#5f20b4">
            12
          </text>
          <circle cx="301" cy="142" r="8" fill="#722cce" />
          <path
            d="m297.7 142 2.2 2.3 4.1-4.2"
            stroke="#fff"
            strokeWidth="1.9"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <rect x="204" y="318" width="46" height="5" rx="2.5" fill="#ece7f3" />

        {/* Level plaque and small stage */}
        <rect x="181" y="361" width="95" height="31" rx="8" fill="#edb849" />
        <rect x="181" y="357" width="95" height="30" rx="8" fill="#ffe6a4" />
        <text x="228.5" y="377" fontSize="14" fontWeight="800" fill="#774613" textAnchor="middle">
          LEVEL 1
        </text>
        <path
          d="M106 375C150 435 301 435 350 375"
          fill="none"
          stroke="#8942d4"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M113 379C161 432 294 432 343 379"
          fill="none"
          stroke="#ae72ee"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <use href={postHref} x="100" y="372" />
        <use href={postHref} x="356" y="372" />

        {/* Original flat rendering of the Numora owl */}
        <g transform="translate(298 168)">
          <g data-layer="owl">
            <path d="M52 96c13-4 44-4 61-11 3 7-3 21-16 23l-18 2z" fill="#62269a" />
            <path
              d="M31 96c3-4 9-3 14 0l8 5c3 3 0 9-5 9l-12-2c-6-1-8-8-5-12Zm45 9 9-3c6-2 10 2 10 6-1 3-4 6-9 6l-11 1c-5 0-5-8 1-10Z"
              fill="#f4af42"
            />
            <path
              d="M28 34C17 29 15 13 19 6c2-3 6-2 8 0l19 15c15-4 32-3 47 1l15-14c4-3 8-1 8 3 2 10 0 21-8 28 7 9 9 18 8 28-3 24-25 40-50 40-27 0-49-17-51-40-1-13 4-25 13-33Z"
              fill="#7935ba"
            />
            <path
              d="M36 75c9-10 19-13 29-13 13 0 25 5 34 15-6 15-17 23-33 23-12 0-23-6-30-16Z"
              fill="#c28ce9"
            />
            <path
              d="M34 35c12-13 21-11 31-5 11-7 25-8 35 4 11 12 7 31-2 40-9 8-22 8-33 1-12 6-23 5-32-2-10-10-11-27 1-38Z"
              fill="#fff1d9"
            />
            <path d="m46 21 20 20 23-20c-12-4-32-4-43 0Z" fill="#fa9a71" />
            <circle cx="46" cy="53" r="15" fill="#f6c452" />
            <circle cx="85" cy="53" r="15" fill="#f6c452" />
            <circle cx="46" cy="53" r="11.5" fill="#fff" />
            <circle cx="85" cy="53" r="11.5" fill="#fff" />
            <circle cx="43" cy="54" r="6.5" fill="#321944" />
            <circle cx="82" cy="54" r="6.5" fill="#321944" />
            <circle cx="45" cy="51.5" r="2.3" fill="#fff" />
            <circle cx="84" cy="51.5" r="2.3" fill="#fff" />
            <ellipse cx="36" cy="69" rx="6" ry="2.8" fill="#f5a4a8" />
            <ellipse cx="94" cy="69" rx="6" ry="2.8" fill="#f5a4a8" />
            <path d="M58 67q7-9 14 0l-7 9Z" fill="#eda333" />
            <path d="M58 67q7-9 14 0Z" fill="#ffd064" />
            <g data-layer="wing">
              <path
                d="M26 64C14 67 7 63 1 55c-2-2-5-1-5 3 0 17 15 29 35 29 6-1 7-8 2-14Z"
                fill="#7935ba"
              />
              <path d="M-2 62q11 12 30 12l4 10C16 84 2 74-2 62Z" fill="#9752cc" />
            </g>
            <path
              d="M104 69c7-4 14-3 23-8 3-2 5 1 4 4-3 14-15 23-31 23-4-1-5-4-3-8Z"
              fill="#9752cc"
            />
          </g>
        </g>
        <g data-layer="spark" fill="#efb84a">
          <path d="M398 152q3 10 13 13-10 2-13 13-3-11-13-13 10-3 13-13Z" />
          <circle cx="416" cy="181" r="4" fill="#fa9a71" />
        </g>

        {/* Student celebrating, with a separate reaching arm */}
        <g transform="translate(3 297)">
          <g data-layer="student">
            <g transform="rotate(-8 69 112)">
              {/* Short, offset feet give the jump a clear direction. */}
              <path
                d="M52 125v12m31-14 11 9"
                fill="none"
                stroke="#a9614d"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M51 134h10c4 0 7 3 7 6 0 4-3 6-6 6H44c-4 0-6-3-6-6 0-2 2-4 5-5Z"
                fill="#6c46c7"
              />
              <path
                d="m91 131 11-5c4-2 7 0 8 3 2 3 0 6-3 8l-15 7c-4 2-7 0-8-3-1-4 2-8 7-10Z"
                fill="#6c46c7"
              />
              <path
                d="M44 143h17m29-1 14-7"
                fill="none"
                stroke="#bb9ded"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* One broad color block per garment. */}
              <path
                d="M43 91c7-8 32-9 48 1 9 6 12 17 6 28-7 13-23 19-38 15-14-4-24-14-24-26 0-7 2-13 8-18Z"
                fill="#453067"
              />
              <path d="M38 106c15 6 36 5 58-8l3 8c-18 15-45 19-61 9Z" fill="#33234e" />
              <path
                d="M40 73c9-10 23-14 37-10 13 3 21 14 21 26-1 14-15 23-32 24-16 1-29-5-32-17-3-9-1-17 6-23Z"
                fill="#20a68a"
              />
              <path
                d="M42 82q-13 5-18 19l-5-8"
                fill="none"
                stroke="#20a68a"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <ellipse cx="17" cy="92" rx="8.5" ry="9" fill="#d68a68" />
              <path d="M53 59h23v11c-5 9-14 12-22 6l-5-6Z" fill="#ba6c55" />

              {/* Rounded hair, open cheeks, and a two-tone smile. */}
              <path
                d="M31 28c-1-12 9-23 21-23 5-7 18-9 27-4 8 3 12 9 12 16 8 3 13 12 11 22-2 9-9 14-17 14L43 45c-8-2-13-8-12-17Z"
                fill="#322538"
              />
              <path
                d="M41 29c4-11 13-16 26-15 13 0 24 7 27 19l4 10c2 3 0 6-5 6-2 15-13 25-28 25-17 0-31-12-32-27 0-7 3-13 8-18Z"
                fill="#d68a68"
              />
              <path
                d="M33 37c-5-7-1-17 7-22 9-7 27-9 39-5 8 3 14 8 14 16-7 3-14-1-18-6-5 5-14 7-23 4-4 7-10 12-19 13Z"
                fill="#322538"
              />
              <path d="M37 46c-8-4-14 4-9 10 3 4 8 5 13 2Z" fill="#d68a68" />
              <path
                d="M49 34q6-4 12-1m12-2q5-4 11-1"
                fill="none"
                stroke="#322538"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M48 40q7-5 14-1v7q-1 6-8 5-6-1-6-6Zm23-2q6-5 13-2v6q0 6-6 6-6 0-7-5Z"
                fill="#fff4e9"
              />
              <path d="M57 40v5m22-7v5" stroke="#322538" strokeWidth="4" strokeLinecap="round" />
              <ellipse cx="46" cy="53" rx="4" ry="2.8" fill="#eb9b86" />
              <path d="M63 52c7 3 15 2 23-2-1 10-7 15-14 14-5-1-8-5-9-12Z" fill="#6d3443" />
              <path d="M65 53c7 1 13 0 18-2l-1 4c-5 3-11 4-16 2Z" fill="#fff4e9" />

              <g transform="translate(74 91)">
                <g data-layer="arm">
                  <path
                    d="M0 1C12-1 26-9 32-19l14-18"
                    fill="none"
                    stroke="#1da98c"
                    strokeWidth="15"
                    strokeLinecap="round"
                  />
                  <path
                    d="m41-30 6-8"
                    fill="none"
                    stroke="#67cdb8"
                    strokeWidth="13"
                    strokeLinecap="round"
                  />
                  <path
                    d="M43-42c-1-4 1-7 4-7 2 0 4 2 4 4l5-5c4-4 8-1 9 2 2 5-1 10-5 12-5 3-12 1-17-6Z"
                    fill="#d68a68"
                  />
                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
