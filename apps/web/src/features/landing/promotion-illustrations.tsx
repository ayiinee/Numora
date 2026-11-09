import { useId, type CSSProperties } from 'react';
import landingStyles from './landing.module.css';
import { NumoraOwl } from './numora-owl';
import styles from './promotion-illustrations.module.css';

export function BrowserIllustration() {
  const id = useId();
  const starId = id + '-web-star';

  return (
    <svg
      className={landingStyles.browserArt}
      width="1320"
      height="630"
      viewBox="0 0 1320 630"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <g id={starId}>
          <path
            d="M26 2 33 16 49 18Q54 19 50 23L39 34 42 50Q43 55 38 53L24 46 10 53Q5 55 6 50L9 34-2 23Q-6 19-1 18L15 16 22 2Q24-3 26 2Z"
            fill="#d58c1c"
          />
          <path
            d="M26 0 33 13 48 15Q53 16 49 20L38 30 41 45Q42 50 37 48L24 41 11 48Q6 50 7 45L10 30-1 20Q-5 16 0 15L15 13 22 0Q24-4 26 0Z"
            fill="#ffcb49"
          />
          <path
            d="m20 8-4 8-9 2"
            fill="none"
            stroke="#ffe7a0"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>
      </defs>
      {/* A compact browser on the left, with its case edge and the lit side of the screen. */}
      <g className={styles.webDeviceLeft}>
        <g transform="translate(148 85)">
          <g
            className={styles.webFloat}
            style={
              {
                '--dx': '4px',
                '--dy': '7px',
                '--tilt': '2deg',
                '--offset': '-1.5s',
              } as CSSProperties
            }
          >
            <g transform="matrix(.73 .94 -.22 .62 47 0)">
              <rect x="11" y="-8" width="147" height="246" rx="21" fill="#22263b" />
              <rect width="145" height="242" rx="19" fill="#3e4f7c" />
              <rect x="7" y="8" width="131" height="224" rx="14" fill="#fff" />
              <path d="M24 19h97a10 10 0 0 1 10 10v19H14V29a10 10 0 0 1 10-10Z" fill="#ebedfa" />
              <path
                d="M27 35h9m11 0h9m11 0h9"
                stroke="#9987ca"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <rect x="18" y="60" width="108" height="7" rx="3.5" fill="#e6e0f4" />
              <rect x="18" y="60" width="59" height="7" rx="3.5" fill="#8c54dc" />
              <rect x="25" y="87" width="95" height="89" rx="16" fill="#eae1ff" />
              <path
                d="M42 152h60l-15-44Z"
                fill="#b484f1"
                stroke="#7841c9"
                strokeWidth="5"
                strokeLinejoin="round"
              />
              <path
                d="M81 152v-13h16"
                fill="none"
                stroke="#7841c9"
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <rect x="25" y="191" width="95" height="22" rx="7" fill="#8750da" />
              <path d="M60 202h25" stroke="white" strokeWidth="4" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </g>
      {/* The laptop is the focus. The address bar and choices stay legible as the orbit moves. */}
      <g transform="translate(451 268)">
        <g
          className={styles.webFloat}
          style={
            {
              '--dx': '3px',
              '--dy': '7px',
              '--tilt': '1.6deg',
              '--offset': '-1.2s',
            } as CSSProperties
          }
        >
          <g transform="rotate(-8 214 140)">
            <path d="M27 236 9 281q-2 10 11 13h349q12 0 20-8l43-36q5-6 4-15Z" fill="#232740" />
            <path
              d="M36 225h390q15 0 8 11l-51 43q-8 8-21 8H19q-11 0-10-7l18-47q2-8 9-8Z"
              fill="#6374a7"
            />
            <path d="M47 240h330l-30 28H34Z" fill="#435686" />
            <path
              d="M60 247h282m-290 9h281"
              fill="none"
              stroke="#8296c8"
              strokeWidth="4"
              strokeDasharray="12 6"
              strokeLinecap="round"
            />
            <path d="M139 273h124" stroke="#9cb4e2" strokeWidth="5" strokeLinecap="round" />
            <g transform="matrix(1 0 -.15 1 43 0)">
              <rect x="9" y="2" width="384" height="236" rx="22" fill="#282942" />
              <rect width="384" height="234" rx="22" fill="#414b78" />
              <rect x="8" y="8" width="368" height="215" rx="15" fill="#fff" />
              <path d="M23 8h338a15 15 0 0 1 15 15v27H8V23A15 15 0 0 1 23 8Z" fill="#ede8fa" />
              <circle cx="26" cy="29" r="4" fill="#f093ac" />
              <circle cx="39" cy="29" r="4" fill="#efc068" />
              <circle cx="52" cy="29" r="4" fill="#5fcab1" />
              <rect x="74" y="19" width="215" height="21" rx="10" fill="#fff" />
              <path d="M89 31v-5m-3 5h6" stroke="#9b80c7" strokeWidth="2" strokeLinecap="round" />
              <text
                x="101"
                y="33"
                fill="#5e497d"
                fontSize="12"
                fontFamily="system-ui,sans-serif"
                fontWeight="700"
              >
                numora
              </text>
              <rect x="34" y="69" width="316" height="8" rx="4" fill="#e8e1f5" />
              <rect x="34" y="69" width="184" height="8" rx="4" fill="#9258e1" />
              <text
                x="191"
                y="129"
                textAnchor="middle"
                fill="#301c50"
                fontSize="39"
                fontFamily="system-ui,sans-serif"
                fontWeight="800"
              >
                3 × 4 = ?
              </text>
              <g fill="#f0e9ff">
                <rect x="34" y="150" width="94" height="47" rx="12" />
                <rect x="256" y="150" width="94" height="47" rx="12" />
              </g>
              <rect x="145" y="153" width="94" height="47" rx="12" fill="#6030ab" />
              <rect x="145" y="148" width="94" height="47" rx="12" fill="#8d51dc" />
              <g
                fontFamily="system-ui,sans-serif"
                fontSize="22"
                fontWeight="800"
                textAnchor="middle"
              >
                <text x="81" y="182" fill="#654692">
                  10
                </text>
                <text x="190" y="179" fill="#fff">
                  12
                </text>
                <text x="303" y="182" fill="#654692">
                  14
                </text>
              </g>
              <path
                d="m210 172 4 4 7-8"
                fill="none"
                stroke="#fff"
                strokeWidth="2.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        </g>
      </g>
      {/* Progress view on the far side. */}
      <g className={styles.webDeviceRight}>
        <g transform="translate(1040 242)">
          <g
            className={styles.webFloat}
            style={
              {
                '--dx': '6px',
                '--dy': '11px',
                '--tilt': '2.5deg',
                '--offset': '-4.2s',
              } as CSSProperties
            }
          >
            <g transform="matrix(.83 -.28 .41 .94 0 39)">
              <rect x="10" y="9" width="162" height="225" rx="20" fill="#262b47" />
              <rect width="163" height="229" rx="21" fill="#416193" />
              <rect x="7" y="7" width="149" height="215" rx="15" fill="#fbfeff" />
              <rect x="47" y="16" width="68" height="7" rx="3.5" fill="#c9def1" />
              <rect x="22" y="42" width="119" height="53" rx="12" fill="#dbf4fc" />
              <rect x="34" y="60" width="77" height="7" rx="3.5" fill="#48b4e1" />
              <rect x="34" y="74" width="54" height="5" rx="2.5" fill="#9cdcf2" />
              <path d="M26 180h111" stroke="#dae6f3" strokeWidth="4" strokeLinecap="round" />
              <rect x="34" y="150" width="21" height="29" rx="5" fill="#64c9f1" />
              <rect x="64" y="134" width="21" height="45" rx="5" fill="#4ab4e7" />
              <rect x="94" y="111" width="21" height="68" rx="5" fill="#9163e8" />
              <path
                d="m124 110 5 5 10-11"
                fill="none"
                stroke="#25ae9b"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="56" y="203" width="52" height="5" rx="2.5" fill="#dce4f3" />
            </g>
          </g>
        </g>
      </g>
      <g className={styles.webFraction}>
        <g transform="translate(350 195) rotate(-16)">
          <g
            className={styles.webFloat}
            style={{ '--dx': '7px', '--dy': '15px', '--offset': '-3s' } as CSSProperties}
          >
            <rect x="7" y="7" width="65" height="58" rx="14" fill="#6f4bc3" />
            <rect width="65" height="58" rx="14" fill="#a181ef" />
            <text
              x="33"
              y="40"
              textAnchor="middle"
              fill="white"
              fontSize="34"
              fontFamily="system-ui,sans-serif"
              fontWeight="800"
            >
              ½
            </text>
          </g>
        </g>
      </g>
      <g transform="translate(969 125) rotate(15)">
        <g
          className={styles.webFloat}
          style={{ '--dx': '-8px', '--dy': '11px', '--offset': '-1.8s' } as CSSProperties}
        >
          <rect x="7" y="8" width="75" height="68" rx="17" fill="#1c9a91" />
          <rect width="75" height="68" rx="17" fill="#29c6ae" />
          <path
            d="M18 49h41L46 20Z"
            stroke="white"
            fill="none"
            strokeWidth="4.5"
            strokeLinejoin="round"
          />
          <path
            d="M43 49v-8h11"
            stroke="white"
            fill="none"
            strokeWidth="4"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <g transform="translate(299 380) rotate(19)">
        <g
          className={styles.webFloat}
          style={{ '--dx': '5px', '--dy': '9px', '--offset': '-.6s' } as CSSProperties}
        >
          <rect x="5" y="7" width="55" height="50" rx="12" fill="#e0648a" />
          <rect width="55" height="50" rx="12" fill="#f38dab" />
          <path d="m19 16 17 17m0-17L19 33" stroke="white" strokeWidth="5" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(869 202) rotate(11) scale(.84)">
        <g
          className={styles.webFloat}
          style={
            { '--dx': '7px', '--dy': '12px', '--tilt': '9deg', '--offset': '-2s' } as CSSProperties
          }
        >
          <use href={'#' + starId} />
        </g>
      </g>
      <g transform="translate(974 468) rotate(-19) scale(.58)">
        <g
          className={styles.webFloat}
          style={{ '--dx': '-7px', '--dy': '13px', '--offset': '-2.3s' } as CSSProperties}
        >
          <use href={'#' + starId} />
        </g>
      </g>
      <g transform="translate(47 337) rotate(22)">
        <g
          className={styles.webFloat}
          style={{ '--dy': '15px', '--offset': '-4s' } as CSSProperties}
        >
          <path d="m0 18 19-18 34 7 11 26-30 17L6 39Z" fill="#3db9ed" />
          <path d="m19 0 16 15 18-8Zm16 15 29 18-30 17Z" fill="#2185c8" />
          <path d="M0 18 19 0l16 15-15 15Z" fill="#91e1ff" />
        </g>
      </g>
      <g transform="translate(1280 166) rotate(12)">
        <g
          className={styles.webFloat}
          style={{ '--dy': '15px', '--offset': '-3.1s' } as CSSProperties}
        >
          <rect x="6" y="8" width="76" height="66" rx="15" fill="#8a6ad0" />
          <rect width="76" height="66" rx="15" fill="#baa1f3" />
          <path d="M25 33h24m-12-12v24" stroke="white" strokeWidth="5" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(449 413)">
        <g
          className={styles.webFloat}
          style={{ '--dx': '5px', '--dy': '15px', '--offset': '-1.2s' } as CSSProperties}
        >
          <path d="m0 0 10-4 10 8-4 11-12 2Z" fill="#bbaae7" />
        </g>
      </g>
      <g transform="translate(1205 506)">
        <g
          className={styles.webFloat}
          style={{ '--dy': '9px', '--offset': '-4s' } as CSSProperties}
        >
          <path d="m0 5 10-8 14 7-2 16-14 2Z" fill="#7ce0eb" />
        </g>
      </g>
    </svg>
  );
}

export function SchoolIllustration() {
  const id = useId();
  const inkId = id + '-school-ink';
  const stickerId = id + '-school-sticker';

  return (
    <svg width="590" height="500" viewBox="0 0 590 500" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={inkId} x2="1" y2="1">
          <stop stopColor="#72e5c3" />
          <stop offset=".49" stopColor="#52c9e8" />
          <stop offset="1" stopColor="#bc95fd" />
        </linearGradient>
        <filter id={stickerId} x="-15%" y="-15%" width="130%" height="130%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="3.3" result="edge" />
          <feFlood floodColor="#fffdf9" result="paint" />
          <feComposite in="paint" in2="edge" operator="in" result="trim" />
          <feMerge>
            <feMergeNode in="trim" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g className={styles.schoolComet}>
        <path
          d="M258 204C211 149 109 145 70 208c-37 60-21 148 67 199 77 46 192 50 277 16 74-30 121-88 122-154 1-38-23-72-61-78-40-8-77 12-100 45-35 51-65 97-124 113-62 17-123-8-143-55-15-34-4-72 20-92 34-28 79-27 130 2Z"
          fill="#fffdf9"
        />
        <path d="M125 340c36 46 94 63 166 54-69 28-142 9-177-42-7-11 1-21 11-12Z" fill="#d5f5ef" />
      </g>
      <g transform="translate(191 87)">
        <g className={styles.schoolCrest}>
          <rect x="11" y="10" width="208" height="290" rx="34" fill="#082b3a" />
          <rect x="5" y="5" width="208" height="290" rx="34" fill="#11516a" />
          <rect width="207" height="286" rx="34" fill="#2b6c83" />
          <rect
            x="6"
            y="6"
            width="195"
            height="274"
            rx="28"
            fill="#174858"
            stroke="#4a8da0"
            strokeWidth="2"
          />
          <rect x="81" y="22" width="45" height="7" rx="3.5" fill="#428099" />
          <rect x="82" y="254" width="43" height="7" rx="3.5" fill="#428099" />
          <path
            d="M105 63c18 15 35 16 61 21v48c0 40-24 67-61 84-36-16-61-44-61-84V84c24-3 44-7 61-21Z"
            fill={`url(#${inkId})`}
            stroke="#fffdf9"
            strokeWidth="7"
            strokeLinejoin="round"
          />
          <path
            d="M68 134l37-24 37 24H68Z"
            fill="#174858"
            stroke="#174858"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M75 139h60v37H75Z" fill="#174858" />
          <path d="M99 176v-16a6 6 0 0 1 12 0v16" fill="#c6fbef" />
          <path d="M82 145h9v8h-9Zm37 0h9v8h-9Z" fill="#c6fbef" />
          <path d="M67 179h76" stroke="#174858" strokeWidth="6" strokeLinecap="round" />
          <path
            d="M105 98V84l14 4-14 4"
            fill="none"
            stroke="#174858"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      </g>
      <g transform="translate(253 105)">
        <g className={styles.schoolOwl}>
          <g transform="scale(1.93)" filter={`url(#${stickerId})`}>
            <NumoraOwl />
          </g>
        </g>
      </g>
      <g className={styles.schoolSparks}>
        <path
          d="M483 83c3 16 9 22 25 25-16 3-22 9-25 25-3-16-9-22-25-25 16-3 22-9 25-25Z"
          fill="#a4f5d9"
        />
        <path
          d="M540 146c1 8 4 11 12 12-8 2-11 5-12 13-2-8-5-11-13-13 8-1 11-4 13-12Z"
          fill="#ffd476"
        />
        <circle cx="430" cy="80" r="5" fill="#c7a8ff" />
        <circle cx="507" cy="146" r="3.5" fill="#a4f5d9" />
      </g>
    </svg>
  );
}
