import styles from './student-mascot.module.css';

const assets = {
  start: ['start-learning', 344, 345],
  calendar: ['tryout-calendar', 364, 345],
  history: ['tryout-history', 340, 363],
  submitted: ['answers-submitted', 368, 363],
  mastered: ['drill-mastered', 361, 365],
  practice: ['drill-practice', 324, 331],
  placement: ['pretest-placement', 380, 314],
  victory: ['pvp-victory', 368, 348],
  draw: ['pvp-draw', 393, 343],
  retry: ['pvp-retry', 315, 368],
  cancelled: ['pvp-cancelled', 357, 385],
  opponent: ['pvp-opponent', 351, 351],
  search: ['search-empty', 409, 347],
  offline: ['connection-lost', 395, 373],
} as const;

export type StudentMascotPose = keyof typeof assets;

export function StudentMascot({
  pose,
  compact = false,
}: {
  pose: StudentMascotPose;
  compact?: boolean;
}) {
  const [asset, width, height] = assets[pose];

  return (
    <img
      alt=""
      className={compact ? `${styles.mascot} ${styles.compact}` : styles.mascot}
      src={`/illustrations/student-mascot/${asset}.webp`}
      width={width}
      height={height}
      decoding="async"
    />
  );
}
