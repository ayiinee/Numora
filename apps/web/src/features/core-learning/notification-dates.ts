const jakartaDay = (time: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
export function notificationDateGroup(instant: string, now = new Date()) {
  const today = new Date(jakartaDay(now) + 'T00:00:00+07:00');
  const date = new Date(jakartaDay(new Date(instant)) + 'T00:00:00+07:00');
  const days = Math.floor((today.getTime() - date.getTime()) / 86400000);
  if (days <= 0) return 'HARI INI';
  if (days === 1) return 'KEMARIN';
  const dayOfWeek = new Date(today.getTime() + 7 * 3600000).getUTCDay();
  const elapsedWeek = (dayOfWeek + 6) % 7;
  if (days <= elapsedWeek) return 'MINGGU INI';
  if (days <= elapsedWeek + 7) return 'MINGGU LALU';
  return 'LEBIH LAMA';
}
export function notificationTime(instant: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(instant)) / 60000));
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} mnt lalu`;
  if (minutes < 24 * 60 && notificationDateGroup(instant, now) === 'HARI INI')
    return `${Math.floor(minutes / 60)} jam lalu`;
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(instant)) + ' WIB'
  );
}
