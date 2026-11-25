export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(rate: number, digits = 1): string {
  if (!Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatDelta(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } | null {
  if (previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  if (Math.abs(change) < 0.005) return { text: '0.0%', direction: 'flat' };
  const direction = change > 0 ? 'up' : 'down';
  const text = `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
  return { text, direction };
}

export function formatPoints(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const points = (current - previous) * 100;
  if (Math.abs(points) < 0.05) return { text: '0.0 pts', direction: 'flat' };
  const direction = points > 0 ? 'up' : 'down';
  return { text: `${points > 0 ? '+' : ''}${points.toFixed(1)} pts`, direction };
}

export function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function labelize(name: string): string {
  return name
    .replace(/[._:-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  if (id.length <= 12) return id;
  return `${id.slice(0, 4)}··${id.slice(-4)}`;
}

export function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `${lines.join('\n')}\n`;
}
