import landingStyles from './landing.module.css';
import styles from './explanation-illustration.module.css';

export function ExplanationIllustration() {
  return (
    <svg
      className={landingStyles.explanationArt + ' ' + styles.scene}
      width="530"
      height="530"
      viewBox="0 0 530 530"
      role="img"
      aria-label="Dua siswa mengamati langkah penyelesaian persamaan pada tablet."
    >
      {/* Fixed microscope stand, partly behind the tablet. */}
      <path d="M317 330c12-35 37-70 59-102l-11-38 35 6c29 1 41 20 32 47l-43 101Z" fill="#65b4ef" />
      <path d="M318 331c14-34 39-70 61-104l26-4c-13 38-38 77-49 124Z" fill="#9dd9f6" />
      <path d="M367 318c3-29 23-62 45-68 14-5 24 2 33 9l-38 75c-14 0-33-5-40-16Z" fill="#368cdb" />
      <ellipse cx="420" cy="292" rx="24" ry="44" transform="rotate(25 420 292)" fill="#3f58a6" />

      {/* Far leg is behind the blue barrel, with the shoe visible on its left. */}
      <g className={styles.student + ' ' + styles.observer} data-motion="far-leg">
        <g className={styles.shoes}>
          <path
            d="M402 189c7 4 8 13 4 19-4 6-11 8-18 5l-87-31-17 25-14-8 14-28c4-9 14-12 23-9Z"
            fill="#513579"
          />
          <path d="m273 193 14 7-5 9-14-7Z" fill="#eee2ff" />
          <path
            d="M270 201c3 4 8 6 13 5l1 6c1 5-3 8-8 7l-19-5c-5-1-7-5-5-9 2-3 7-4 12-3Z"
            fill="#a878df"
          />
          <path
            d="m255 211 23 5"
            fill="none"
            stroke="#e8d5fc"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </g>
      </g>

      {/* The blue lens separates the two legs. */}
      <path d="M331 133q5-18 20-23c9-2 18 2 24 8l-8 29Z" fill="#3956a2" />
      <path
        d="M260 236 307 137c6-15 20-16 37-9l18 8c14 6 18 18 13 30l-46 98c-5 12-23 14-40 6-19-8-35-22-29-34Z"
        fill="#5baded"
      />
      <path
        d="M260 238c5-10 23-9 41-1 17 8 28 20 24 30-5 11-25 11-43 2-17-8-27-20-22-31Z"
        fill="#94d8f8"
      />
      <path
        d="M266 250c5-8 19-7 32-1 13 6 21 15 17 23-4 8-20 8-33 2-13-6-20-16-16-24Z"
        fill="#3d54a1"
      />
      <g className={styles['lens-eye']}>
        <path
          d="M270 258c4-6 16-4 27 1 10 5 17 12 13 17-4 5-16 4-26-1-11-5-17-12-14-17Z"
          fill="#d8f4ff"
        />
        <path d="M283 263c2-3 7-1 11 1 4 2 6 5 4 8-3 2-8 0-12-2-4-3-5-6-3-7Z" fill="#2a3e78" />
      </g>
      {/* Student astride the microscope, with the near leg on its right. */}
      <g className={styles.student + ' ' + styles.observer} data-motion="observer">
        <path
          d="M365 126c10-11 29-13 40-4 9 7 10 22 11 37l4 25c1 8-5 15-13 16l-22 2c-16-1-24-9-23-23l-6-29c-3-10 0-18 9-24Z"
          fill="#bbe6de"
        />
        <path d="M361 149l20 3 4 49c-12-2-18-7-21-17Z" fill="#83cdbf" />
        <g className={styles.shoes}>
          <path
            d="M412 191c10 0 17 8 14 17-2 9-11 14-22 12l-24-8 6 26-16 4-10-34c-4-12 5-22 17-20Z"
            fill="#7553a7"
          />
          <path d="m369 235 16-3 3 11-16 4Z" fill="#f5e9ff" />
          <path
            d="M371 244c5 1 11 0 16-3l6 6c4 5 2 11-4 12l-21 4c-6 1-9-2-9-7 0-4 5-7 12-12Z"
            fill="#c292ed"
          />
          <path
            d="m364 260 25-5"
            fill="none"
            stroke="#e8d5fc"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </g>
        <path d="M362 116h21v13c-5 8-16 9-22 2Z" fill="#b86b50" />
        <path
          d="M328 88c-1-20 15-36 36-38 23-2 42 12 46 34 4 23-9 43-32 49-21 5-44-8-49-30Z"
          fill="#d6a2f5"
        />
        <path
          d="M395 63c12 9 17 24 15 38-3 18-14 27-32 32l-10-7c24-10 31-35 27-63Z"
          fill="#b67ce3"
        />
        <path
          d="M342 82c10-12 28-15 41-8 11 7 16 20 12 32-5 14-14 21-28 20-15-1-29-12-30-26-1-7 1-13 5-18Z"
          fill="#d98d65"
        />
        <path
          d="M327 82c8 1 13-6 20-11 11-7 27-6 37 3-3 8-9 12-15 13-7 2-14 0-18-4-6 7-16 9-24 3-2-1-2-3 0-4Z"
          fill="#33253e"
        />
        <path
          d="M342 90q5-4 10-2m12-1q5-4 11-1"
          fill="none"
          stroke="#483044"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <g className={styles.eyes}>
          <ellipse cx="347.5" cy="97.5" rx="7" ry="7.8" fill="#fff3e6" />
          <ellipse cx="371" cy="95.5" rx="7.6" ry="8.2" fill="#fff3e6" />
          <ellipse cx="345" cy="99" rx="3" ry="4.4" fill="#33253e" />
          <ellipse cx="368.5" cy="97" rx="3.2" ry="4.5" fill="#33253e" />
        </g>
        <path
          d="M357 99q-4 7 0 8"
          fill="none"
          stroke="#b86b50"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <ellipse cx="389" cy="102" rx="5" ry="6" fill="#be6e53" transform="rotate(14 389 102)" />
        <path d="M366 111q7 3 13-3-2 8-8 8-4 0-5-5Z" fill="#844253" />
        <path
          d="M370 139q-6 10-15 12"
          fill="none"
          stroke="#83cdbf"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path d="M357 144c-4-2-9 0-10 4-1 5 3 8 7 8 5 0 9-3 9-7 0-2-3-4-6-5Z" fill="#d98d65" />
        <path
          d="M401 135c6 15 6 31-1 40l-7 7"
          fill="none"
          stroke="#9ad8ca"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <ellipse cx="392" cy="183" rx="7.5" ry="6" fill="#d98d65" transform="rotate(-22 392 183)" />
      </g>

      {/* Student with a flask, seated behind the tablet. */}
      <g className={styles.student + ' ' + styles.chemist} data-motion="chemist">
        <path
          d="M189 239c16-3 27 4 33 17l9 22c4 10 4 24-6 34l-38 6c-11-11-14-29-16-43l-3-17c-1-10 7-17 21-19Z"
          fill="#664390"
        />
        <path
          d="M191 251c-20 12-38 11-51-5l-15-12c-6-5-3-12 3-14 4-1 7 1 11 5l14 12c8 7 17 6 31-2Z"
          fill="#664390"
        />
        <path
          d="M151 236c-1-22 7-44 21-52 16-10 42-8 55 8 11 15 10 42 13 58-7 9-16 12-25 11l-50-4c-7-3-13-11-14-21Z"
          fill="#44355e"
        />
        <path
          d="M169 213c7-12 24-16 37-12 14 4 20 14 20 24l-2 14c-1 10-10 17-22 17h-20c-11 0-17-8-17-17Z"
          fill="#f2b38d"
        />
        <path
          d="M152 235c-3-20 4-43 21-52 12-6 29-7 41 0 14 8 21 22 20 40-10 4-20-4-25-14-8 7-21 10-32 7l-4 35c-4 4-16 3-21-1Z"
          fill="#44355e"
        />
        <path
          d="M164 195c9-10 23-14 35-11"
          fill="none"
          stroke="#675080"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M178 219q6-4 12 0m10-1q5-4 11-1"
          fill="none"
          stroke="#493457"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <g className={styles.eyes}>
          <rect x="178" y="223" width="13" height="11" rx="5.5" fill="#fff5ee" />
          <rect x="199" y="221" width="13" height="11" rx="5.5" fill="#fff5ee" />
          <ellipse cx="182" cy="227.5" rx="2.5" ry="3.4" fill="#423053" />
          <ellipse cx="203" cy="226" rx="2.5" ry="3.4" fill="#423053" />
        </g>
        <circle cx="218" cy="228" r="6" fill="#f2b38d" />
        <path
          d="M194 239q5 4 10-1"
          fill="none"
          stroke="#bb6457"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
        <ellipse cx="179" cy="237" rx="4" ry="2.2" fill="#ed9383" />
        <path
          d="M216 257c2 10-3 17-12 22l-10 5"
          fill="none"
          stroke="#7b53a3"
          strokeWidth="10.5"
          strokeLinecap="round"
        />
        <ellipse
          cx="192"
          cy="285"
          rx="6.5"
          ry="4.5"
          fill="#f2b38d"
          transform="rotate(-15 192 285)"
        />
        <g className={styles.flask} data-motion="flask">
          <path
            d="M118 220c-1-3 1-6 4-6h8c3 0 5 3 4 6v12l12 14c6 9-1 17-14 18l-18-1c-12-1-17-9-10-17l14-14Z"
            fill="#dff5fb"
          />
          <path d="M112 247c6-5 20-5 27 0 7 6 3 12-7 13h-14c-10-1-14-7-6-13Z" fill="#45c7a7" />
          <path d="M112 251q13 4 29-1c3 6-2 9-11 10h-12c-8-1-12-4-6-9Z" fill="#219c85" />
          <path
            d="M115 229v-7m-4 14 3-5"
            fill="none"
            stroke="#f2a88f"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      </g>

      {/* Angled tablet surface and worked equation. */}
      <path
        d="M85 327c3-6 9-7 20-8l176-23c12-2 19 0 27 5l88 59c6 4 9 9 8 16l-5 22c-1 5-5 8-11 10l-184 49c-9 2-17 2-24-4L85 366c-6-5-7-10-6-18Z"
        fill="#c18be8"
      />
      <path
        d="M87 322c3-4 8-6 18-7l174-23c12-2 21-1 29 5l89 63c10 7 9 14-2 18l-186 52c-12 3-21 3-29-4L85 343c-7-6-5-15 2-21Z"
        fill="#e6b9f3"
      />
      <path
        d="M94 325q4-3 14-4l173-24q13-2 23 4l89 62q9 6-2 10l-183 51q-14 4-23-4l-92-82q-8-7 1-13Z"
        fill="#fffdfd"
      />
      <path
        d="m113 329 12-2c7-1 11 0 15 4l77 64c5 4 3 6-2 8l-11 3c-5 1-9 0-13-3l-80-68c-4-3-3-5 2-6Z"
        fill="#36b89c"
      />
      <path
        d="m310 315 41 32"
        fill="none"
        stroke="#d8eee9"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="m310 315 30 23"
        fill="none"
        stroke="#39bb9d"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <g
        transform="matrix(1.05 -.24 .84 .70 189 324)"
        fontFamily="system-ui,sans-serif"
        fontWeight="800"
        fontSize="17"
        fill="#52408b"
      >
        <rect className={styles.scan} x="-5" y="53" width="86" height="20" rx="8" fill="#e8d8f8" />
        <text x="0" y="12">
          2x + 4 = 12
        </text>
        <text x="4" y="38">
          2x = 8
        </text>
        <text x="8" y="65" fill="#613b9d">
          x = 4
        </text>
      </g>

      <g fill="#38bda1">
        <circle className={styles.bubble} cx="111" cy="154" r="11" />
        <circle className={styles.bubble + ' ' + styles['bubble-alt']} cx="112" cy="158" r="10" />
        <circle className={styles.bubble + ' ' + styles['bubble-small']} cx="128" cy="182" r="5" />
      </g>
      <circle
        className={styles.puff}
        cx="192"
        cy="125"
        r="25"
        fill="none"
        stroke="#39bb9d"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="13 14"
      />
    </svg>
  );
}
