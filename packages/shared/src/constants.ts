export const DEVICES = ['desktop', 'mobile', 'tablet'] as const;
export type Device = (typeof DEVICES)[number];

export const CHANNELS = [
  'direct',
  'google',
  'github',
  'twitter',
  'newsletter',
  'producthunt',
  'other',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'CA', name: 'Canada' },
  { code: 'BR', name: 'Brazil' },
  { code: 'AU', name: 'Australia' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SG', name: 'Singapore' },
] as const;

export const COUNTRY_NAMES: Record<string, string> = {
  ZZ: 'Unknown',
  ...Object.fromEntries(COUNTRIES.map((country) => [country.code, country.name])),
};

export const EVENT_CATALOG = [
  { name: 'page_view', label: 'Page view' },
  { name: 'signup_started', label: 'Signup started' },
  { name: 'signup_completed', label: 'Signup completed' },
  { name: 'feature_used', label: 'Feature used' },
  { name: 'invite_sent', label: 'Invite sent' },
  { name: 'upgrade_clicked', label: 'Upgrade clicked' },
  { name: 'subscription_started', label: 'Subscription started' },
  { name: 'identify', label: 'Identify' },
] as const;

export const FUNNEL_PRESETS = [
  {
    id: 'acquisition',
    name: 'Acquisition',
    steps: ['page_view', 'signup_started', 'signup_completed'],
  },
  {
    id: 'activation',
    name: 'Activation',
    steps: ['signup_completed', 'feature_used', 'invite_sent'],
  },
  {
    id: 'revenue',
    name: 'Revenue',
    steps: ['signup_completed', 'upgrade_clicked', 'subscription_started'],
  },
] as const;

export type FunnelPresetId = (typeof FUNNEL_PRESETS)[number]['id'];

export const RANGE_PRESETS = ['24h', '7d', '30d', '90d'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_MS: Record<RangePreset, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export const RATE_LIMIT = {
  capacity: 600,
  refillPerSecond: 10,
  maxBatch: 100,
} as const;

export const MAX_RANGE_MS = 180 * 24 * 60 * 60 * 1000;

export const SAVED_VIEW_PATHS = [
  '/',
  '/funnels',
  '/retention',
  '/acquisition',
  '/events',
] as const;
