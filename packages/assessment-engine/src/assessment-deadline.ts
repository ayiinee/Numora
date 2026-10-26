export function earlierDeadline(first: Date | null, second: Date | null) {
  return first === null ? second : second !== null && second < first ? second : first;
}
export function assessmentDeadline(
  start: Date,
  durationSeconds: number | null,
  closeAt: Date | null,
) {
  const durationEnd =
    durationSeconds === null ? null : new Date(start.getTime() + durationSeconds * 1000);
  return earlierDeadline(durationEnd, closeAt);
}
