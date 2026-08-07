/** Relative time for recent-file rows (e.g. "2h ago"). */
export function formatOpenedAt(openedAt: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - openedAt) / 1000));
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(openedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
