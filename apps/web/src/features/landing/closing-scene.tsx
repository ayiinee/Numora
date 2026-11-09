import { Icon } from '@tka/ui';
import styles from './landing.module.css';

export function ClosingScene() {
  return (
    <svg
      className={styles.closingScene}
      viewBox="0 0 1440 949"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <symbol id="landing-star-token" viewBox="0 0 180 66">
          <ellipse cx="90" cy="38" rx="90" ry="28" fill="var(--numora-gold-700)" />
          <ellipse cx="90" cy="29" rx="90" ry="29" fill="var(--numora-gold-500)" />
          <ellipse cx="90" cy="27" rx="76" ry="20" fill="var(--numora-gold-400)" />
          <image href="/figma/star.png" x="72" y="8" width="36" height="36" />
        </symbol>
        <path
          id="landing-device-frame"
          d="M666 444H774Q800 444 805 472L834 687Q840 723 806 723H634Q600 723 606 687L635 472Q640 444 666 444Z"
        />
        <clipPath id="landing-device-screen">
          <use href="#landing-device-frame" />
        </clipPath>
      </defs>

      <path
        fill="currentColor"
        d="M0 533H143C195 533 231 554 262 589C301 641 328 685 400 688C475 690 507 708 548 761C586 809 635 823 720 823C805 823 854 809 892 761C933 708 965 690 1040 688C1112 685 1139 641 1178 589C1209 554 1245 533 1297 533H1440V949H0Z"
      />

      <image href="/figma/medal-source.png" x="215" y="412" width="154" height="150" />
      <rect
        x="267"
        y="559"
        width="47"
        height="56"
        rx="13"
        fill="var(--numora-purple-300)"
        transform="rotate(-20 291 587)"
      />
      <rect
        x="338"
        y="545"
        width="42"
        height="43"
        rx="12"
        fill="var(--numora-purple-200)"
        transform="rotate(18 359 567)"
      />
      <use
        href="#landing-star-token"
        x="429"
        y="381"
        width="69"
        height="25"
        transform="rotate(10 464 394)"
      />
      <use
        href="#landing-star-token"
        x="390"
        y="415"
        width="98"
        height="36"
        transform="rotate(8 439 433)"
      />
      <use
        href="#landing-star-token"
        x="453"
        y="515"
        width="132"
        height="48"
        transform="rotate(-18 519 539)"
      />
      <circle cx="561" cy="441" r="30" fill="var(--numora-peach-300)" />
      <Icon name="zap" x={545} y={425} width={32} height={32} color="var(--numora-peach-900)" />
      <rect
        x="451"
        y="632"
        width="20"
        height="20"
        rx="4"
        fill="var(--numora-purple-200)"
        transform="rotate(24 461 642)"
      />

      <use
        href="#landing-device-frame"
        fill="var(--numora-purple-700)"
        transform="translate(0 12)"
      />
      <g clipPath="url(#landing-device-screen)">
        <path fill="var(--paper)" d="M600 441H840V727H600Z" />
        <path fill="var(--numora-purple-200)" d="M629 442H810V466H629Z" />
        <image
          href="/illustrations/student-home/drill-owl.svg"
          x="623"
          y="571"
          width="194"
          height="148"
        />
      </g>
      <use
        href="#landing-device-frame"
        fill="none"
        stroke="var(--numora-purple-500)"
        strokeWidth="4"
      />
      <use
        href="#landing-star-token"
        x="648"
        y="524"
        width="145"
        height="53"
        transform="rotate(6 721 551)"
      />
      <use
        href="#landing-star-token"
        x="836"
        y="550"
        width="161"
        height="59"
        transform="rotate(-11 916 579)"
      />

      <image href="/figma/fire.png" x="908" y="416" width="100" height="96" />
      <rect
        x="1074"
        y="382"
        width="67"
        height="62"
        rx="18"
        fill="var(--numora-purple-300)"
        transform="rotate(18 1108 413)"
      />
      <Icon
        name="geometry"
        x={1091}
        y={397}
        width={34}
        height={34}
        color="var(--numora-purple-900)"
      />
      <rect
        x="1101"
        y="505"
        width="22"
        height="22"
        rx="4"
        fill="var(--numora-purple-200)"
        transform="rotate(-8 1112 516)"
      />
      <ellipse cx="1097" cy="616" rx="90" ry="28" fill="var(--numora-purple-700)" />
      <ellipse cx="1097" cy="603" rx="90" ry="26" fill="var(--numora-purple-300)" />
      <Icon name="check" x={1075} y={581} width={44} height={44} color="var(--numora-purple-900)" />
    </svg>
  );
}
