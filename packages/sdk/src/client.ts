import type { PropertyValue } from '@pulse/shared';

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type PulseContext = {
  anonymousId?: string;
  userId?: string | null;
  sessionId?: string;
  timestamp?: string;
};

export type PulseOptions = {
  apiKey: string;
  endpoint: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  storage?: StorageLike;
  sessionStorage?: StorageLike;
  fetch?: typeof fetch;
  now?: () => number;
};

type QueuedEvent = {
  name: string;
  clientEventId: string;
  timestamp: string;
  anonymousId: string;
  userId?: string;
  sessionId: string;
  path?: string;
  referrer?: string;
  country?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  properties?: Record<string, PropertyValue>;
};

const SESSION_MS = 30 * 60 * 1000;
const RESERVED = new Set(['path', 'referrer', 'country', 'device']);

export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function browserStorage(kind: 'local' | 'session'): StorageLike {
  try {
    const store = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    const probe = '__pulse_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return memoryStorage();
  }
}

function detectDevice(): 'desktop' | 'mobile' | 'tablet' {
  const ua = globalThis.navigator?.userAgent;
  if (!ua) return 'desktop';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

export class PulseClient {
  private readonly options: Required<Pick<PulseOptions, 'apiKey' | 'endpoint' | 'flushIntervalMs' | 'maxBatchSize'>> &
    PulseOptions;
  private readonly storage: StorageLike;
  private readonly sessions: StorageLike;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly device = detectDevice();
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private blockedUntil = 0;

  constructor(options: PulseOptions) {
    this.options = { flushIntervalMs: 2000, maxBatchSize: 20, ...options };
    this.storage = options.storage ?? browserStorage('local');
    this.sessions = options.sessionStorage ?? browserStorage('session');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  track(name: string, properties?: Record<string, PropertyValue>, context?: PulseContext): void {
    const props = { ...(properties ?? {}) };
    const path = typeof props.path === 'string' ? props.path : undefined;
    const referrer = typeof props.referrer === 'string' ? props.referrer : undefined;
    const country = typeof props.country === 'string' ? props.country : undefined;
    const device =
      props.device === 'desktop' || props.device === 'mobile' || props.device === 'tablet'
        ? props.device
        : this.device;
    const rest: Record<string, PropertyValue> = {};
    for (const [key, value] of Object.entries(props)) {
      if (!RESERVED.has(key)) rest[key] = value;
    }
    const userId = context && 'userId' in context ? context.userId : this.storage.getItem('pulse_user_id');
    this.queue.push({
      name,
      clientEventId: crypto.randomUUID(),
      timestamp: context?.timestamp ?? new Date(this.now()).toISOString(),
      anonymousId: context?.anonymousId ?? this.anonymousId(),
      ...(userId ? { userId } : {}),
      sessionId: context?.sessionId ?? this.sessionId(),
      ...(path ? { path } : {}),
      ...(referrer ? { referrer } : {}),
      ...(country ? { country } : {}),
      device,
      ...(Object.keys(rest).length ? { properties: rest } : {}),
    });
    if (this.queue.length >= this.options.maxBatchSize) void this.flush();
    else this.schedule();
  }

  page(path?: string, properties?: Record<string, PropertyValue>): void {
    const browser = globalThis as { location?: { pathname?: string }; document?: { referrer?: string } };
    const current = path ?? browser.location?.pathname;
    const referrer = browser.document?.referrer || undefined;
    this.track('page_view', {
      ...properties,
      ...(current ? { path: current } : {}),
      ...(referrer ? { referrer } : {}),
    });
  }

  identify(userId: string, traits?: Record<string, PropertyValue>): void {
    this.storage.setItem('pulse_user_id', userId);
    this.track('identify', traits, { userId });
  }

  reset(): void {
    this.storage.removeItem('pulse_anonymous_id');
    this.storage.removeItem('pulse_user_id');
    this.sessions.removeItem('pulse_session_id');
    this.sessions.removeItem('pulse_session_at');
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.send().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flush();
  }

  private anonymousId(): string {
    const existing = this.storage.getItem('pulse_anonymous_id');
    if (existing) return existing;
    const created = `anon_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.storage.setItem('pulse_anonymous_id', created);
    return created;
  }

  private sessionId(): string {
    const now = this.now();
    const existing = this.sessions.getItem('pulse_session_id');
    const seen = Number(this.sessions.getItem('pulse_session_at') ?? 0);
    if (!existing || !seen || now - seen > SESSION_MS) {
      const created = `ses_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      this.sessions.setItem('pulse_session_id', created);
      this.sessions.setItem('pulse_session_at', String(now));
      return created;
    }
    this.sessions.setItem('pulse_session_at', String(now));
    return existing;
  }

  private schedule() {
    if (this.timer || this.queue.length === 0) return;
    const delay = Math.max(this.options.flushIntervalMs, this.blockedUntil - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private async send() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0 || this.now() < this.blockedUntil) {
      this.schedule();
      return;
    }
    const batch = this.queue.splice(0, this.options.maxBatchSize);
    try {
      const response = await this.fetchImpl(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({ sentAt: new Date(this.now()).toISOString(), events: batch }),
        keepalive: true,
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? 2);
        this.blockedUntil = this.now() + Math.max(1, retryAfter) * 1000;
        this.queue = [...batch, ...this.queue].slice(-500);
      } else if (!response.ok && response.status >= 500) {
        this.queue = [...batch, ...this.queue].slice(-500);
        this.blockedUntil = this.now() + 2000;
      }
    } catch {
      this.queue = [...batch, ...this.queue].slice(-500);
      this.blockedUntil = this.now() + 2000;
    }
    if (this.queue.length >= this.options.maxBatchSize) void this.flush();
    else this.schedule();
  }
}

export function createPulse(options: PulseOptions): PulseClient {
  return new PulseClient(options);
}
