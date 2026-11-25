import { CHANNELS, type Channel, type Device } from './constants';

export function referrerHost(referrer: string | null | undefined): string {
  if (!referrer) return '(direct)';
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '(direct)';
  }
}

export function channelFromReferrer(referrer: string | null | undefined): Channel {
  const host = referrerHost(referrer);
  if (host === '(direct)') return 'direct';
  if (host.includes('google.')) return 'google';
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
  if (
    host === 't.co' ||
    host === 'x.com' ||
    host.endsWith('.x.com') ||
    host.endsWith('twitter.com')
  ) {
    return 'twitter';
  }
  if (host.includes('producthunt.')) return 'producthunt';
  if (host.includes('newsletter') || host.includes('substack.com') || host.startsWith('mail.')) {
    return 'newsletter';
  }
  return 'other';
}

export function deviceFromUserAgent(userAgent: string | null | undefined): Device {
  if (!userAgent) return 'desktop';
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}
