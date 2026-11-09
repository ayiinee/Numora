import { useId, type CSSProperties } from 'react';
import styles from './landing.module.css';
import { NumoraOwl } from './numora-owl';

export function ClosingScene() {
  const id = useId();
  const device = id + '-device';
  const screen = id + '-screen';

  return (
    <svg
      className={styles.closingScene}
      viewBox="0 0 1440 949"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path
          id={device}
          d="M666 444H774Q800 444 805 472L834 687Q840 723 806 723H634Q600 723 606 687L635 472Q640 444 666 444Z"
        />
        <clipPath id={screen}>
          <use href={'#' + device} />
        </clipPath>
      </defs>

      <path
        fill="currentColor"
        d="M0 533H143C195 533 231 554 262 589C301 641 328 685 400 688C475 690 507 708 548 761C586 809 635 823 720 823C805 823 854 809 892 761C933 708 965 690 1040 688C1112 685 1139 641 1178 589C1209 554 1245 533 1297 533H1440V949H0Z"
      />

      {/* Open practice book and pencil. */}
      <g className={styles.closingBook} transform="translate(269 450) rotate(-13 88 45)">
        <g
          className={styles.closingFloat}
          style={{ '--float-y': '-17px', '--float-delay': '-1.1s' } as CSSProperties}
        >
          <path
            d="M4 16Q47 3 87 26Q126 2 171 12l12 75q1 8-9 10-47-5-84 14Q48 95 17 105q-8 2-10-6L0 27q-1-7 4-11Z"
            fill="#d77845"
          />
          <path
            d="M3 13Q44 0 87 23Q128 0 171 8l11 72q1 8-8 9-45-6-84 14Q47 85 17 96q-8 3-10-5L0 22q-1-6 3-9Z"
            fill="#ffb56f"
          />
          <path d="M6 12Q45-3 87 21l3 71Q50 76 16 86q-4 1-5-3L4 19q0-5 2-7Z" fill="#fffaf1" />
          <path d="M87 21Q125-2 167 6l10 69q1 5-4 5-44-4-83 12Z" fill="#fff0dc" />
          <path d="m87 23 3 66" stroke="#ebc8ad" strokeWidth="3.5" strokeLinecap="round" />
          <path
            d="M22 29q21-5 46 5M24 43q20-4 33 2m51-17q18-7 42-5m-40 19q18-7 35-6"
            fill="none"
            stroke="#d7b2ea"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <path
            d="M29 70l10-16 14 15Z"
            fill="none"
            stroke="#9e5ed4"
            strokeWidth="4.5"
            strokeLinejoin="round"
          />
          <path
            d="m111 63 9 7 17-17"
            fill="none"
            stroke="#299f89"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <g className={styles.closingPencil} transform="translate(364 587) rotate(-36 64 16)">
        <g
          className={styles.closingFloat}
          style={{ '--float-y': '-13px', '--float-delay': '-2.4s' } as CSSProperties}
        >
          <path d="M27 3h93q13 0 13 12v8q0 11-13 11H27L4 22q-7-4 0-8Z" fill="#db8041" />
          <path d="M27 0h93q13 0 13 12v6q0 10-13 10H27L4 17q-6-3 0-6Z" fill="#ffca69" />
          <path d="M27 0v28L4 17q-6-3 0-6Z" fill="#ffe8ba" />
          <path d="M10 8v12l-6-3q-6-3 0-6Z" fill="#63416d" />
          <path d="M108 0h12q13 0 13 12v6q0 10-13 10h-12Z" fill="#ffabac" />
          <path d="M101 0h10v28h-10Z" fill="#a873e0" />
          <path d="M33 7h63" stroke="#ffe5a1" strokeWidth="4" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(481 420) rotate(10 39 36)">
        <g className={styles.closingFloat} style={{ '--float-delay': '-2.2s' } as CSSProperties}>
          <rect x="3" y="7" width="78" height="70" rx="18" fill="#7142bc" />
          <rect width="78" height="70" rx="18" fill="#ac7de9" />
          <text x="39" y="49" fill="#fff" fontSize="40" fontWeight="800" textAnchor="middle">
            ½
          </text>
        </g>
      </g>
      <g transform="translate(519 610) rotate(-15 21 20)">
        <g className={styles.closingFloat} style={{ '--float-delay': '-.4s' } as CSSProperties}>
          <rect x="2" y="4" width="42" height="40" rx="12" fill="#269e93" />
          <rect width="42" height="40" rx="12" fill="#53caba" />
          <path d="M21 11v18m-9-9h18" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </g>
      </g>

      {/* A Numora exercise with the same mascot as the school scene. */}
      <use href={'#' + device} fill="var(--numora-purple-700)" transform="translate(0 12)" />
      <g clipPath={`url(#${screen})`}>
        <path fill="var(--paper)" d="M600 441H840V727H600Z" />
        <path fill="var(--numora-purple-200)" d="M629 442H810V468H629Z" />
        <path
          d="M656 456h1m11 0h1m11 0h1"
          fill="none"
          stroke="#8a54c9"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <rect x="654" y="484" width="132" height="8" rx="4" fill="#eee0fa" />
        <rect x="654" y="484" width="93" height="8" rx="4" fill="#9c62dc" />
        <text x="720" y="538" fill="#592890" fontSize="27" fontWeight="800" textAnchor="middle">
          3 × 4 = 12
        </text>
        <ellipse cx="720" cy="711" rx="64" ry="9" fill="#e8d7fa" />
        <g transform="translate(638 563) scale(1.28)">
          <NumoraOwl eyesClassName={styles.closingEyes} />
        </g>
      </g>
      <use href={'#' + device} fill="none" stroke="var(--numora-purple-500)" strokeWidth="4" />

      {/* Mastery star, progress, and geometry tools. */}
      <g transform="translate(924 404) rotate(10 41 41)">
        <g
          className={styles.closingFloat}
          style={{ '--float-y': '12px', '--float-delay': '-.8s' } as CSSProperties}
        >
          <path
            d="M36 7q5-10 10 0l9 19 21 3q10 1 3 9L64 54l3 22q1 10-8 6L41 72 23 82q-9 4-8-6l4-22L3 38q-7-8 3-9l21-3Z"
            fill="#d49328"
          />
          <path
            d="M36 2q5-10 10 0l9 19 21 3q10 1 3 9L64 49l3 22q1 10-8 6L41 67 23 77q-9 4-8-6l4-22L3 33q-7-8 3-9l21-3Z"
            fill="#ffcb60"
          />
          <path
            d="m14 31 17-2 8-17"
            fill="none"
            stroke="#fff1b3"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </g>
      </g>
      <g className={styles.closingProgress} transform="translate(1063 410) rotate(10 53 31)">
        <g className={styles.closingFloat} style={{ '--float-delay': '-3.3s' } as CSSProperties}>
          <rect x="4" y="7" width="108" height="63" rx="16" fill="#7964c7" />
          <rect width="108" height="63" rx="16" fill="#d8c0f7" />
          <path
            d="M22 44V32m20 12V26m20 18V20m20 24V13"
            fill="none"
            stroke="#7744c3"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>
      </g>
      <g className={styles.closingRuler} transform="translate(863 518) rotate(-11 56 43)">
        <g
          className={styles.closingFloat}
          style={{ '--float-y': '-16px', '--float-delay': '-1.6s' } as CSSProperties}
        >
          <path d="M7 95Q0 95 0 86V14Q0 1 10 7l103 72q12 12-1 16Z" fill="#129d90" />
          <path d="M7 86Q0 86 0 77V7Q0-4 10 3l103 68q12 12-1 15Z" fill="#4cd0b7" />
          <path
            d="M22 34v32h48Z"
            fill="#d7f9ed"
            stroke="#269f91"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M13 76v-5m16 5v-5m16 5v-5m16 5v-5m16 5v-5m16 5v-5"
            stroke="#238d85"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      </g>
      <ellipse
        className={styles.closingCalculatorShadow}
        cx="1097"
        cy="679"
        rx="54"
        ry="13"
        fill="#54249c"
        opacity=".27"
        transform="rotate(-7 1097 679)"
      />
      <g className={styles.closingCalculator} transform="translate(1045 535) rotate(12 45 60)">
        <g
          className={styles.closingFloat}
          style={{ '--float-y': '-20px', '--float-delay': '-1.2s' } as CSSProperties}
        >
          <rect x="5" y="8" width="91" height="125" rx="22" fill="#5c36a1" />
          <rect width="91" height="125" rx="22" fill="#9265dc" />
          <rect x="11" y="13" width="69" height="35" rx="9" fill="#f1e6ff" />
          <text x="70" y="38" fill="#6237aa" fontSize="22" fontWeight="800" textAnchor="end">
            12
          </text>
          <path
            d="M22 66h6m15 0h6m15 0h6M22 84h6m15 0h6m15 0h6M22 102h6m15 0h6"
            stroke="#edddff"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path d="M65 103h5" stroke="#ffd073" strokeWidth="8" strokeLinecap="round" />
        </g>
      </g>
      <g className={styles.closingFloat} style={{ '--float-delay': '-2.8s' } as CSSProperties}>
        <path d="M941 654q4 13 16 16-12 3-16 16-3-13-16-16 13-3 16-16Z" fill="#f3bd73" />
        <rect
          className={styles.closingConfetti}
          x="986"
          y="642"
          width="15"
          height="15"
          rx="4"
          fill="#b2eadc"
          transform="rotate(27 994 650)"
        />
      </g>
    </svg>
  );
}
