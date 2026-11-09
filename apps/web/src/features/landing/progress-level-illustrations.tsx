import { useId, type CSSProperties } from 'react';
import landingStyles from './landing.module.css';
import styles from './progress-level-illustrations.module.css';

export function ProgressIllustration() {
  const id = useId();
  const tileId = id + '-tile';
  const starId = id + '-star';

  return (
    <svg
      className={landingStyles.featureArt}
      width="530"
      height="530"
      viewBox="0 0 530 530"
      role="img"
      aria-label="Siswa melompat di lintasan latihan saat tiga bintang pencapaian terisi bergantian"
    >
      <defs>
        <g id={tileId}>
          <path
            d="M-71-11 2-49q8-4 17 1l58 35q7 5 5 12L77 14Q76 19 69 23L7 57q-9 5-18 0l-58-35q-7-4-7-13v-13Z"
            fill="var(--edge)"
          />
          <path
            d="M-71-11 2-49q8-4 17 1l58 35q9 6 0 12L8 37q-9 5-19 0l-58-34q-11-7-2-14Z"
            fill="var(--rim)"
          />
          <path
            d="M-64-8 5-44q5-3 12 0l55 34q5 3 0 7L5 33q-6 3-13 0l-56-32q-6-4 0-9Z"
            fill="var(--face)"
          />
        </g>
        <g id={starId}>
          <path
            d="M0-27c3 0 4 3 6 6l5 11 13 2c6 1 8 6 4 10L18 12l2 13c1 5-3 8-8 6L0 24l-12 7c-5 2-9-1-8-6l2-13L-28 2c-4-4-2-9 4-10l13-2 5-11c2-3 3-6 6-6Z"
            fill="#dd931f"
          />
          <path
            d="M0-32c3 0 4 3 6 6l5 11 13 2c6 1 8 6 4 10L18 7l2 13c1 5-3 8-8 6L0 19l-12 7c-5 2-9-1-8-6l2-13L-28-3c-4-4-2-9 4-10l13-2 5-11c2-3 3-6 6-6Z"
            fill="#ffd264"
          />
          <path
            d="m-19-7 11-2 6-12"
            fill="none"
            stroke="#fff0b1"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </defs>

      <path
        d="M106 423Q194 429 260 369T439 277"
        fill="none"
        stroke="#eee2fa"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray="6 18"
      />
      <g
        transform="translate(393 237) scale(.88)"
        style={{ '--edge': '#df9c2e', '--rim': '#f8cb6d', '--face': '#fff1c6' } as CSSProperties}
      >
        <use href={'#' + tileId} />
      </g>
      <g
        transform="translate(267 308) scale(.94)"
        style={{ '--edge': '#854bd3', '--rim': '#bb95ee', '--face': '#f1e2ff' } as CSSProperties}
      >
        <use href={'#' + tileId} />
      </g>
      <g
        transform="translate(135 378)"
        style={{ '--edge': '#9e72db', '--rim': '#cfa9f5', '--face': '#f6eaff' } as CSSProperties}
      >
        <use href={'#' + tileId} />
      </g>
      <path
        d="m111 395 10 6 30-16"
        fill="none"
        stroke="#9a6bdd"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m248 325 10 6 27-14"
        fill="none"
        stroke="#8a58d1"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M374 252l13 5 24-13"
        fill="none"
        stroke="#e7ac42"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g transform="translate(130 360) scale(.57)">
        <g className={styles.medal + ' ' + styles['medal-one']}>
          <use href={'#' + starId} />
        </g>
      </g>
      <g transform="translate(224 314) scale(.59)">
        <g className={styles.medal + ' ' + styles['medal-two']}>
          <use href={'#' + starId} />
        </g>
      </g>
      <g transform="translate(393 218) scale(.89)">
        <g className={styles.medal + ' ' + styles['medal-three']}>
          <use href={'#' + starId} />
        </g>
      </g>
      <g className={styles.burst} stroke="#f6b73e" strokeWidth="5" strokeLinecap="round">
        <path d="m359 198-8-6m69 7 10-5m-14 42 8 6" />
      </g>
      <path
        className={styles.glint}
        d="M432 144q4 13 16 16-12 3-16 16-3-13-16-16 13-3 16-16Z"
        fill="#efb443"
      />

      {/* The runner's arms and legs stay visually separate throughout the jump. */}
      <g transform="translate(126 139)">
        <g className={styles.runner}>
          <g className={styles.stride}>
            <path
              d="M87 105c8-4 17 1 24 7l15 11c5 3 7 7 7 12l-2 15-15 1-1-14-24-14c-8-4-10-14-4-18Z"
              fill="#51376e"
            />
            <path d="m116 145 15-1v10l-15 1Z" fill="#efe3ff" />
            <path d="M116 150c5 2 11 2 16-1l13 4c7 2 7 10 0 12h-23c-6 0-9-4-8-9Z" fill="#a575e7" />
            <path
              d="M119 162h27"
              fill="none"
              stroke="#dcc0fa"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
          <path d="M65 105h25c4 11 1 21-8 29l-12 10-18 3-4-15 14-4 8-9Z" fill="#35254f" />
          <path d="m47 132 10-2 5 14-12 2Z" fill="#f1e6ff" />
          <path d="M51 135c4 3 5 10 1 14l-16 11c-5 3-10-1-9-6l5-13c2-5 10-7 19-6Z" fill="#7652bf" />
          <path
            d="m30 155 19-11"
            fill="none"
            stroke="#c9a9f2"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M71 78c-5 10-12 17-22 17l-12-5"
            fill="none"
            stroke="#158b73"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M37 83c-5-4-12-2-14 3-2 6 4 12 10 12 6 1 10-2 10-7 0-3-2-6-6-8Z"
            fill="#d68a68"
          />
          <path
            d="M67 66c13-7 33-5 43 5 10 9 15 24 10 40-16 10-42 10-61 0l1-27q1-12 7-18Z"
            fill="#20a68a"
          />
          <path
            d="M71 72q14 17 37 10"
            fill="none"
            stroke="#107d67"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M81 96h23c0 8-4 12-11 12-6 0-10-3-12-12Z" fill="#168e76" />
          <path
            d="M109 83c8 5 14 5 19-1l12-15"
            fill="none"
            stroke="#25ac90"
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="m135 74 6-8"
            fill="none"
            stroke="#6bcdb8"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M137 64c-2-5 1-9 5-9 3 0 5 2 5 5l7-3c5-2 9 2 7 7-2 6-8 10-14 10-5-1-9-5-10-10Z"
            fill="#d68a68"
          />
          <path d="M79 55h21v12q-7 10-20 4Z" fill="#b86c53" />
          <path
            d="M55 33C56 14 72 5 91 7c18 2 31 14 33 30l5 8c2 4-1 6-6 7-3 14-15 23-30 22-22-1-40-16-38-41Z"
            fill="#d68a68"
          />
          <path
            d="M56 46c-11-5-16-17-11-29C51 5 64 2 75 3 89-4 110-1 123 10c6 6 6 15 0 19-7 4-15 1-21-4-8 7-21 8-33 5l-6 15Z"
            fill="#322538"
          />
          <path
            d="M52 21q9-13 25-13"
            fill="none"
            stroke="#543d5f"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="61" cy="47" r="7" fill="#d68a68" />
          <path
            d="M82 35q6-5 13-2m8 0q6-4 12-1"
            fill="none"
            stroke="#39293d"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse cx="90" cy="42" rx="7.4" ry="7" fill="#fff3e6" />
          <ellipse cx="111" cy="41" rx="6.8" ry="6.7" fill="#fff3e6" />
          <ellipse cx="92.6" cy="42" rx="3.1" ry="4.2" fill="#33253e" />
          <ellipse cx="113.5" cy="41" rx="2.9" ry="4.1" fill="#33253e" />
          <ellipse cx="78" cy="53" rx="5" ry="2.8" fill="#e89a83" />
          <path d="M96 55q11 2 20-5c-1 10-10 16-16 11Z" fill="#723744" />
          <path d="M98 55q9 1 17-4l-2 4q-7 4-13 2Z" fill="#fff4e7" />
        </g>
      </g>
      <g transform="translate(318 65) scale(.78)">
        <g className={styles.guide}>
          <BenefitOwl />
        </g>
      </g>
    </svg>
  );
}

export function LevelsIllustration() {
  return (
    <svg
      className={landingStyles.featureArt}
      width="530"
      height="530"
      viewBox="0 0 530 530"
      role="img"
      aria-label="Dua papan materi, Bilangan dan Geometri, memperlihatkan pilihan level. Siswa memilih level berikutnya."
    >
      {/* Two angled topic boards, with a different color for each route. */}
      <path
        d="M260 270q1-12 13-16l136-32q11-2 17 11l41 146q3 13-2 28-3 10-14 14l-139 33q-15 4-22-8l-36-155q-2-11 6-21Z"
        fill="#187f76"
      />
      <path
        d="M259 268q2-11 13-14l137-32q13-2 17 11l41 146q4 14-10 18l-147 37q-13 3-18-9l-36-144q-2-8 3-13Z"
        fill="#62cbbb"
      />
      <path
        d="M265 271q2-7 10-9l133-32q10-2 13 9l39 141q3 9-7 12l-144 35q-9 2-13-8l-35-140q-2-5 4-8Z"
        fill="#f1fffc"
      />
      <path
        d="M147 208q8-9 20-6l105 24q14 3 13 17l-38 168q-3 13-17 15L70 399q-16-3-14-20l2-18Z"
        fill="#8251ce"
      />
      <path
        d="M148 207q8-9 20-6l104 24q15 3 12 17l-37 154q-3 13-16 15L71 384q-16-3-14-17 1-7 8-14Z"
        fill="#bf9aef"
      />
      <path
        d="M154 213q6-7 15-5l102 24q9 2 7 10l-37 151q-2 10-11 10L72 377q-10-2-8-10l4-8Z"
        fill="#fffaff"
      />

      <g fontFamily="system-ui,sans-serif" textAnchor="middle" fontWeight="800">
        <g transform="translate(207 240) rotate(13)">
          <rect x="-46" y="-13" width="92" height="26" rx="13" fill="#ead9fb" />
          <text y="5" fontSize="15" fill="#603c94">
            Bilangan
          </text>
        </g>
        <g transform="translate(371 251) rotate(-13)">
          <rect x="-48" y="-13" width="96" height="26" rx="13" fill="#d6f7ef" />
          <text y="5" fontSize="15" fill="#196c60">
            Geometri
          </text>
        </g>

        <path
          d="M129 348q38-7 34-35t28-34"
          fill="none"
          stroke="#d3b5f2"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="1 16"
        />
        <path
          d="M345 387q39-22 28-41t-25-22q-16-16 6-39"
          fill="none"
          stroke="#9ee0d1"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="1 16"
        />

        <g transform="translate(129 348)">
          <ellipse cy="5" rx="25" ry="13" fill="#a88ade" />
          <ellipse rx="25" ry="13" fill="#e6d6fa" />
          <text y="5" fontSize="14" fill="#68429a">
            1
          </text>
        </g>
        <g transform="translate(164 313)">
          <ellipse cy="5" rx="24" ry="13" fill="#9a6bdc" />
          <g className={styles['node-a']}>
            <ellipse rx="24" ry="13" fill="#c49af2" />
            <text y="5" fontSize="14" fill="#522781">
              2
            </text>
          </g>
        </g>
        <g transform="translate(192 279)">
          <ellipse cy="5" rx="23" ry="12" fill="#ab8bdc" />
          <ellipse rx="23" ry="12" fill="#eee1fb" />
          <text y="5" fontSize="14" fill="#7049a5">
            3
          </text>
        </g>
        <g transform="translate(346 386)">
          <ellipse cy="5" rx="25" ry="13" fill="#71c9b9" />
          <ellipse rx="25" ry="13" fill="#d9f6f0" />
          <text y="5" fontSize="14" fill="#186b60">
            1
          </text>
        </g>
        <g transform="translate(375 347)">
          <ellipse cy="5" rx="24" ry="13" fill="#5fc6b5" />
          <g className={styles['node-b']}>
            <ellipse rx="24" ry="13" fill="#9ce5d8" />
            <text y="5" fontSize="14" fill="#176356">
              2
            </text>
          </g>
        </g>
        <g transform="translate(351 286)">
          <ellipse cy="5" rx="23" ry="12" fill="#6ac5b5" />
          <ellipse rx="23" ry="12" fill="#d9f6f0" />
          <text y="5" fontSize="14" fill="#186b60">
            3
          </text>
        </g>
      </g>

      <g transform="translate(155 303)">
        <g className={styles.marker}>
          <path
            d="M-12-18c0-7 5-12 12-12s12 5 12 12c0 9-12 20-12 20s-12-11-12-20Z"
            fill="#edac35"
          />
          <circle cy="-18" r="5" fill="#fff0b3" />
        </g>
      </g>

      <g transform="translate(135 116) scale(.83)">
        <g className={styles.owl}>
          <BenefitOwl />
        </g>
      </g>
      <g transform="translate(93 160)">
        <g className={styles.topic}>
          <rect x="-28" y="-26" width="56" height="59" rx="15" fill="#9a68df" />
          <rect x="-28" y="-29" width="56" height="56" rx="15" fill="#dbbdf8" />
          <text
            y="10"
            fill="#67399e"
            textAnchor="middle"
            fontFamily="system-ui,sans-serif"
            fontSize="35"
            fontWeight="800"
          >
            ½
          </text>
        </g>
      </g>

      {/* The student points out the geometry route. */}
      <g transform="translate(313 86)">
        <g className={styles.learner}>
          <path d="M52 101h22l-4 17-16 10-7 15-13-4 6-17q2-5 7-9Z" fill="#43305e" />
          <path d="M66 104h18l-3 16 8 13-11 8-14-17c-4-5-4-13 2-20Z" fill="#5d427d" />
          <path d="m35 134 14 4-3 7-13-4Zm42 1 12-7 5 8-12 7Z" fill="#e9dcf7" />
          <path
            d="M34 139c4 3 9 5 13 3l1 5c0 4-3 6-7 6H24c-5 0-7-4-5-7 2-4 10-6 15-7Z"
            fill="#8d60d0"
          />
          <path
            d="M83 140c4-2 9-5 11-8l8 4c5 3 6 8 1 11l-16 6c-6 2-9-1-9-6 0-3 2-6 5-7Z"
            fill="#a071dc"
          />
          <path
            d="M23 150h21m39-1 20-7"
            fill="none"
            stroke="#d7bbed"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M46 66c10-8 25-7 34 0 12 10 15 32 7 46-14 8-35 8-49 0-5-10-7-34 8-46Z"
            fill="#8d60cf"
          />
          <path
            d="M48 69q8 11 22 11 9 0 16-6"
            fill="none"
            stroke="#7045a9"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M45 78c-7 10-11 17-8 23l9 5"
            fill="none"
            stroke="#8156bb"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path d="M45 101c4 0 9 3 10 6 0 4-4 6-8 5-5-1-8-4-7-7 0-2 3-4 5-4Z" fill="#e7a783" />
          <path d="M51 52h20v17c-5 7-14 7-20 0Z" fill="#cf8c70" />
          <path
            d="M33 48c-3-24 6-39 25-45 22-7 41 6 46 23 4 14 0 32 1 44-5 5-12 6-21 3l-39-4c-7-4-11-10-12-21Z"
            fill="#443452"
          />
          <path
            d="M47 29c6-11 17-15 31-12 14 3 20 13 20 26-1 17-11 28-26 28-16 0-27-11-28-25Z"
            fill="#e7a783"
          />
          <path
            d="M33 47c-4-19 4-33 16-41 14-9 31-8 43-1 10 5 15 16 15 26-11 6-23-1-30-10-7 7-17 10-30 8l-2 31c-7-2-12-7-12-13Z"
            fill="#443452"
          />
          <path
            d="M43 21q8-12 24-12"
            fill="none"
            stroke="#685174"
            strokeWidth="3.8"
            strokeLinecap="round"
          />
          <path
            d="M55 36q5-3 10-1m12 0q5-3 10-1"
            fill="none"
            stroke="#4a3650"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse cx="60" cy="43" rx="7" ry="6.7" fill="#fff3e6" />
          <ellipse cx="82" cy="42" rx="6.8" ry="6.5" fill="#fff3e6" />
          <ellipse cx="62.5" cy="45" rx="2.8" ry="3.7" fill="#443452" />
          <ellipse cx="84.5" cy="44" rx="2.8" ry="3.6" fill="#443452" />
          <path
            d="M72 43q4 4 1 6"
            fill="none"
            stroke="#c98267"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <ellipse cx="52" cy="52" rx="4.7" ry="2.5" fill="#e59588" />
          <path d="M68 54q7 2 13-2-1 8-7 8-4 0-6-6Z" fill="#87465a" />
          <g className={styles.hand}>
            <path
              d="M82 83q13 5 18 17l15 7"
              fill="none"
              stroke="#a77add"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <path
              d="M111 103c2-3 6-4 9-2l5 3 7 2c4 1 4 5 0 6l-8-1 3 4c2 3-1 6-4 4l-9-6c-4-2-5-7-3-10Z"
              fill="#e7a783"
            />
          </g>
        </g>
      </g>

      <g transform="translate(440 277)">
        <g className={styles.unlock}>
          <rect x="-23" y="-22" width="46" height="50" rx="13" fill="#208a7c" />
          <rect x="-23" y="-26" width="46" height="48" rx="13" fill="#95e3d2" />
          <path
            d="m-13 11 15-25 13 25Z"
            fill="#e9fff9"
            stroke="#278c7d"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M1 5h6v6" fill="none" stroke="#278c7d" strokeWidth="2.3" />
        </g>
      </g>
      <path
        className={styles.spark}
        d="M466 246q3 10 13 13-10 3-13 13-3-10-13-13 10-3 13-13Z"
        fill="#f3b849"
      />
    </svg>
  );
}

function BenefitOwl() {
  return (
    <g>
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
      <g>
        <path
          d="M26 64C14 67 7 63 1 55c-2-2-5-1-5 3 0 17 15 29 35 29 6-1 7-8 2-14Z"
          fill="#7935ba"
        />
        <path d="M-2 62q11 12 30 12l4 10C16 84 2 74-2 62Z" fill="#9752cc" />
      </g>
      <path d="M104 69c7-4 14-3 23-8 3-2 5 1 4 4-3 14-15 23-31 23-4-1-5-4-3-8Z" fill="#9752cc" />
    </g>
  );
}
