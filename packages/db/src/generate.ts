import {
  channelFromReferrer,
  referrerHost,
  type Channel,
  type Device,
} from '@pulse/shared';

export type GeneratedEvent = {
  clientEventId: string;
  name: string;
  anonymousId: string;
  userId: string | null;
  sessionId: string;
  occurredAt: Date;
  receivedAt: Date;
  path: string | null;
  referrer: string | null;
  referrerHost: string;
  channel: Channel;
  country: string;
  device: Device;
  properties: Record<string, string | number | boolean | null>;
};

export type GenerateOptions = {
  days: number;
  dailyVisitors: number;
  seed?: number;
  asOf?: Date;
};

const REFERRERS: Record<Channel, string | null> = {
  direct: null,
  google: 'https://www.google.com/search?q=northstar+analytics',
  github: 'https://github.com/explore',
  twitter: 'https://t.co/northstar',
  newsletter: 'https://newsletter.northstar.dev/issue-42',
  producthunt: 'https://www.producthunt.com/posts/northstar',
  other: 'https://news.ycombinator.com/',
};

const PAGE_WEIGHTS: Array<[string, number]> = [
  ['/', 34],
  ['/pricing', 18],
  ['/docs', 14],
  ['/blog', 10],
  ['/customers', 6],
  ['/signup', 8],
  ['/app', 6],
  ['/app/boards', 4],
];

const TITLES: Record<string, string> = {
  '/': 'Northstar',
  '/pricing': 'Pricing',
  '/docs': 'Documentation',
  '/blog': 'Journal',
  '/customers': 'Customers',
  '/signup': 'Create your workspace',
  '/app': 'Home',
  '/app/boards': 'Boards',
  '/app/billing': 'Billing',
};

const HOURS = [0.15, 0.1, 0.08, 0.08, 0.12, 0.25, 0.45, 0.7, 0.9, 1, 1, 0.92, 0.8, 0.88, 1, 0.96, 0.84, 0.62, 0.45, 0.34, 0.28, 0.24, 0.2, 0.16];

type Persona = 'bounce' | 'abandon' | 'signup' | 'activate' | 'pay';

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rng: () => number, items: Array<[T, number]>): T {
  const total = items.reduce((sum, item) => sum + item[1], 0);
  let cursor = rng() * total;
  for (const [value, weight] of items) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return items[items.length - 1]![0];
}

function uuid(rng: () => number) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function token(rng: () => number, prefix: string) {
  let value = '';
  for (let index = 0; index < 12; index += 1) value += Math.floor(rng() * 36).toString(36);
  return `${prefix}_${value}`;
}

export function generateTraffic(options: GenerateOptions): GeneratedEvent[] {
  const rng = mulberry32(options.seed ?? 2211);
  const asOf = (options.asOf ?? new Date()).getTime();
  const endDay = Date.UTC(new Date(asOf).getUTCFullYear(), new Date(asOf).getUTCMonth(), new Date(asOf).getUTCDate());
  const start = endDay - (options.days - 1) * 86_400_000;
  const spikeDay = Math.max(1, Math.floor(options.days * 0.62));
  const newsletterDay = Math.max(1, Math.floor(options.days * 0.3));
  const events: GeneratedEvent[] = [];

  const pickTime = (dayIndex: number) => {
    const dayStart = start + dayIndex * 86_400_000;
    const end = Math.min(dayStart + 86_400_000, asOf);
    if (end <= dayStart) return null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const hour = pickWeighted(rng, HOURS.map((weight, index) => [index, weight] as [number, number]));
      const stamp = dayStart + hour * 3_600_000 + Math.floor(rng() * 3_600_000);
      if (stamp < end) return stamp;
    }
    return dayStart + Math.floor(rng() * (end - dayStart));
  };

  for (let day = 0; day < options.days; day += 1) {
    const dayStart = start + day * 86_400_000;
    if (dayStart >= asOf) break;
    const dow = new Date(dayStart).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    let visitors = Math.round(options.dailyVisitors * (weekend ? 0.58 : 1) * (0.86 + rng() * 0.28));
    if (day === spikeDay) visitors = Math.round(visitors * 3.4);
    if (day === newsletterDay) visitors = Math.round(visitors * 1.45);
    for (let index = 0; index < visitors; index += 1) {
      const persona = pickWeighted<Persona>(rng, [
        ['bounce', 52],
        ['abandon', 22],
        ['signup', 12],
        ['activate', 9],
        ['pay', 5],
      ]);
      let channel = pickWeighted<Channel>(rng, [
        ['direct', 30],
        ['google', 28],
        ['github', 14],
        ['twitter', 10],
        ['newsletter', 8],
        ['other', 7],
        ['producthunt', 3],
      ]);
      if (day === spikeDay && rng() < 0.74) channel = 'producthunt';
      if (day === newsletterDay && rng() < 0.5) channel = 'newsletter';
      const country = pickWeighted(rng, [
        ['US', 28],
        ['IN', 22],
        ['GB', 10],
        ['DE', 9],
        ['CA', 8],
        ['BR', 6],
        ['AU', 5],
        ['FR', 5],
        ['NL', 4],
        ['SG', 3],
      ]);
      const device = pickWeighted<Device>(rng, [
        ['desktop', 62],
        ['mobile', 32],
        ['tablet', 6],
      ]);
      const anonymousId = token(rng, 'anon');
      const userId = persona === 'bounce' || persona === 'abandon' ? null : token(rng, 'user');
      const referrer = REFERRERS[channel];
      const actor = {
        anonymousId,
        userId,
        country,
        device,
        channel: channelFromReferrer(referrer),
        referrer,
        referrerHost: referrerHost(referrer),
      };

      const push = (sessionId: string, base: number, steps: Array<{ name: string; path: string; properties?: GeneratedEvent['properties']; identified?: boolean }>) => {
        let cursor = base;
        for (const step of steps) {
          if (cursor > asOf) return;
          const occurredAt = new Date(cursor);
          events.push({
            clientEventId: uuid(rng),
            name: step.name,
            anonymousId: actor.anonymousId,
            userId: step.identified ? actor.userId : null,
            sessionId,
            occurredAt,
            receivedAt: occurredAt,
            path: step.path,
            referrer: actor.referrer,
            referrerHost: actor.referrerHost,
            channel: actor.channel,
            country: actor.country,
            device: actor.device,
            properties: step.properties ?? {},
          });
          cursor += 12_000 + Math.floor(rng() * 80_000);
        }
      };

      const first = pickTime(day);
      if (first == null) continue;
      const landing = pickWeighted(rng, PAGE_WEIGHTS);
      const steps: Array<{ name: string; path: string; properties?: GeneratedEvent['properties']; identified?: boolean }> = [
        { name: 'page_view', path: landing, properties: { title: TITLES[landing] ?? 'Northstar' } },
      ];
      if (rng() < 0.45) {
        const second = pickWeighted(rng, PAGE_WEIGHTS);
        steps.push({ name: 'page_view', path: second, properties: { title: TITLES[second] ?? 'Northstar' } });
      }
      if (persona !== 'bounce') {
        steps.push({ name: 'signup_started', path: '/signup', properties: { title: 'Create your workspace' } });
      }
      if (persona !== 'bounce' && persona !== 'abandon') {
        steps.push({ name: 'signup_completed', path: '/signup', properties: { method: 'email' }, identified: true });
        steps.push({ name: 'identify', path: '/signup', properties: { plan: 'trial' }, identified: true });
      }
      if (persona === 'activate' || persona === 'pay') {
        steps.push({
          name: 'feature_used',
          path: '/app/boards',
          properties: { feature: 'boards' },
          identified: true,
        });
        if (rng() < 0.55) {
          steps.push({ name: 'invite_sent', path: '/app', properties: { seats: 1 }, identified: true });
        }
      }
      if (persona === 'pay') {
        steps.push({ name: 'upgrade_clicked', path: '/pricing', properties: { plan: 'pro' }, identified: true });
        steps.push({
          name: 'subscription_started',
          path: '/app/billing',
          properties: { plan: rng() < 0.8 ? 'pro' : 'team' },
          identified: true,
        });
      }
      push(token(rng, 'ses'), first, steps);

      const returnBase = persona === 'pay' ? 0.58 : persona === 'activate' ? 0.44 : persona === 'signup' ? 0.16 : persona === 'abandon' ? 0.045 : 0.02;
      for (let next = day + 1; next < options.days; next += 1) {
        const delta = next - day;
        let probability = returnBase * Math.pow(0.9, delta - 1);
        const nextDow = new Date(start + next * 86_400_000).getUTCDay();
        if (nextDow === 0 || nextDow === 6) probability *= 0.72;
        if (rng() > probability) continue;
        const when = pickTime(next);
        if (when == null) continue;
        const feature = pickWeighted(rng, [
          ['boards', 5],
          ['insights', 3],
          ['alerts', 2],
          ['digest', 1],
        ]);
        const returnSteps: Array<{ name: string; path: string; properties?: GeneratedEvent['properties']; identified?: boolean }> = [
          {
            name: 'page_view',
            path: rng() < 0.7 ? '/app' : '/docs',
            properties: { title: rng() < 0.7 ? 'Home' : 'Documentation' },
            identified: Boolean(actor.userId),
          },
        ];
        if (persona === 'activate' || persona === 'pay' || rng() < 0.08) {
          returnSteps.push({
            name: 'feature_used',
            path: '/app/boards',
            properties: { feature },
            identified: Boolean(actor.userId),
          });
        }
        push(token(rng, 'ses'), when, returnSteps);
      }
    }
  }

  for (let index = 0; index < 10; index += 1) {
    const occurredAt = new Date(asOf - index * 3500);
    const country = ['US', 'IN', 'DE', 'GB', 'SG'][index % 5]!;
    const device: Device = index % 3 === 0 ? 'mobile' : 'desktop';
    const channel: Channel = index % 4 === 0 ? 'github' : 'direct';
    const referrer = REFERRERS[channel];
    const path = ['/pricing', '/docs', '/app', '/'][index % 4]!;
    events.push({
      clientEventId: uuid(rng),
      name: index % 5 === 0 ? 'feature_used' : 'page_view',
      anonymousId: token(rng, 'anon'),
      userId: index % 5 === 0 ? token(rng, 'user') : null,
      sessionId: token(rng, 'ses'),
      occurredAt,
      receivedAt: occurredAt,
      path,
      referrer,
      referrerHost: referrerHost(referrer),
      channel,
      country,
      device,
      properties: index % 5 === 0 ? { feature: 'boards' } : { title: TITLES[path] ?? 'Northstar' },
    });
  }

  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return events;
}
