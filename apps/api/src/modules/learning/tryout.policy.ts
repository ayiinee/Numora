export function isJakartaMondayMidnight(instant: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return value('weekday') === 'Monday' && value('hour') === '00' &&
    value('minute') === '00' && value('second') === '00' &&
    instant.getUTCMilliseconds() === 0;
}

export function normalizedScore(awarded: number, maximum: number) {
  if (maximum <= 0) throw new Error('Assessment maximum points must be positive.');
  return Math.round((awarded * 100) / maximum);
}

export function tryoutAttemptDeadline(startAt: Date, durationSeconds: number | null, closeAt: Date | null) {
  return durationSeconds ? new Date(Math.min(startAt.getTime() + durationSeconds * 1000, closeAt?.getTime() ?? Infinity)) : closeAt;
}
