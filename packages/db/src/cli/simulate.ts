import { createPulse, memoryStorage } from '../../../sdk/src/index';
import type { Channel, Device } from '@pulse/shared';

const endpoint = process.env.PULSE_INGEST_URL || 'http://127.0.0.1:3000/api/ingest';
const apiKey = process.env.PULSE_API_KEY || 'pulse_live_demo_northstar';
const intervalMs = Number(process.env.SIMULATE_INTERVAL_MS || 900);

const pulse = createPulse({
  apiKey,
  endpoint,
  flushIntervalMs: 800,
  maxBatchSize: 8,
  storage: memoryStorage(),
  sessionStorage: memoryStorage(),
});

const countries = ['US', 'IN', 'GB', 'DE', 'CA', 'SG', 'BR'];
const channels: Channel[] = ['direct', 'google', 'github', 'twitter', 'newsletter', 'other'];
const devices: Device[] = ['desktop', 'desktop', 'mobile', 'tablet'];
const pages = ['/', '/pricing', '/docs', '/blog', '/app', '/app/boards'];
const features = ['boards', 'insights', 'alerts', 'digest'];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

type Actor = {
  anonymousId: string;
  userId: string | null;
  sessionId: string;
  country: string;
  device: Device;
  channel: Channel;
};

const actors: Actor[] = Array.from({ length: 14 }, (_, index) => ({
  anonymousId: `anon_live_${index}_${Math.random().toString(36).slice(2, 8)}`,
  userId: index % 3 === 0 ? `user_live_${index}` : null,
  sessionId: `ses_live_${index}_${Math.random().toString(36).slice(2, 8)}`,
  country: pick(countries),
  device: pick(devices),
  channel: pick(channels),
}));

function referrerFor(channel: Channel): string | null {
  if (channel === 'google') return 'https://www.google.com/';
  if (channel === 'github') return 'https://github.com/';
  if (channel === 'twitter') return 'https://t.co/live';
  if (channel === 'newsletter') return 'https://newsletter.northstar.dev/latest';
  if (channel === 'other') return 'https://news.ycombinator.com/';
  return null;
}

console.log(`simulating Northstar traffic → ${endpoint}`);

const timer = setInterval(() => {
  const actor = pick(actors);
  const roll = Math.random();
  const context = {
    anonymousId: actor.anonymousId,
    userId: actor.userId,
    sessionId: actor.sessionId,
  };
  const referrer = referrerFor(actor.channel);
  const base = {
    country: actor.country,
    device: actor.device,
    ...(referrer ? { referrer } : {}),
  };
  if (roll < 0.62) {
    pulse.track('page_view', { ...base, path: pick(pages), title: 'Live' }, context);
  } else if (roll < 0.75) {
    pulse.track('signup_started', { ...base, path: '/signup' }, context);
  } else if (roll < 0.84) {
    pulse.track('signup_completed', { ...base, path: '/signup', method: 'email' }, { ...context, userId: actor.userId ?? `user_live_${actor.anonymousId.slice(-4)}` });
  } else if (roll < 0.94) {
    pulse.track('feature_used', { ...base, path: '/app/boards', feature: pick(features) }, context);
  } else {
    pulse.track('upgrade_clicked', { ...base, path: '/pricing', plan: 'pro' }, context);
  }
}, intervalMs);

async function stop() {
  clearInterval(timer);
  await pulse.shutdown();
  process.exit(0);
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
