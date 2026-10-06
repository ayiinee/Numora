export function normalizedScore(awarded: number, maximum: number) {
  if (maximum <= 0) throw new Error('Assessment maximum points must be positive.');
  return Math.round((awarded * 100) / maximum);
}

export function tryoutAttemptDeadline(
  startAt: Date,
  durationSeconds: number | null,
  closeAt: Date | null,
) {
  return durationSeconds
    ? new Date(Math.min(startAt.getTime() + durationSeconds * 1000, closeAt?.getTime() ?? Infinity))
    : closeAt;
}
