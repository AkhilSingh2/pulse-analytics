'use client';

import { COUNTRIES, DEVICES, SAVED_VIEW_PATHS, type RangePreset } from '@pulse/shared';
import { Activity, Beaker, Bookmark, Filter, Grid2x2, List, Menu, Moon, Settings, Share2, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isActive } from '@/lib/nav';
import { trpc } from '@/lib/trpc';

const NAV = [
  { href: '/', label: 'Overview', icon: Activity },
  { href: '/funnels', label: 'Funnels', icon: Filter },
  { href: '/retention', label: 'Retention', icon: Grid2x2 },
  { href: '/acquisition', label: 'Acquisition', icon: Share2 },
  { href: '/events', label: 'Events', icon: List },
  { href: '/views', label: 'Saved views', icon: Bookmark },
  { href: '/playground', label: 'Playground', icon: Beaker },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const RANGES: RangePreset[] = ['24h', '7d', '30d', '90d'];
const FILTERED = new Set(['/', '/funnels', '/retention', '/acquisition', '/events']);

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar fixed inset-y-0 left-0 z-20 hidden w-60 flex-col p-4 lg:flex">
        <Brand />
        <Nav label="Primary" />
        <p className="mt-auto px-2 text-xs text-[var(--muted)]">Synthetic Northstar traffic. No accounts required.</p>
      </aside>
      <div className="lg:pl-60">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn lg:hidden"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <span className="hidden rounded-full border border-[var(--line)] px-3 py-1 text-sm sm:inline">Northstar</span>
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        {FILTERED.has(pathname) ? <FilterBar /> : null}
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div id="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu" className="sidebar absolute inset-y-0 left-0 flex w-72 flex-col p-4">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <Nav label="Mobile" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2 no-underline ${compact ? '' : 'mb-4'}`}>
      <span className="mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M2 14h4l2.2-6 2.8 10 2.2-6H22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {compact ? null : <span className="display text-2xl leading-none">Pulse</span>}
    </Link>
  );
}

function Nav({ label }: { label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="grid gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className="nav-link" aria-current={active ? 'page' : undefined}>
            <Icon size={18} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  return (
    <button
      type="button"
      className="icon-btn"
      data-testid="theme-toggle"
      aria-label="Toggle color theme"
      aria-pressed={dark}
      onClick={() => {
        const next = !document.documentElement.classList.contains('dark');
        document.documentElement.classList.toggle('dark', next);
        document.documentElement.style.colorScheme = next ? 'dark' : 'light';
        localStorage.setItem('pulse-theme', next ? 'dark' : 'light');
        setDark(next);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function FilterBar() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const range = params.get('range') ?? '30d';
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const utils = trpc.useUtils();
  const save = trpc.views.create.useMutation({
    onSuccess: async () => {
      setStatus('Saved');
      setNaming(false);
      setName('');
      await utils.views.list.invalidate();
    },
  });

  function setParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setCustom(which: 'from' | 'to', value: string) {
    if (!value) return;
    const next = new URLSearchParams(params.toString());
    next.set('range', 'custom');
    if (which === 'from') {
      next.set('from', new Date(`${value}T00:00:00.000Z`).toISOString());
      if (!next.get('to')) next.set('to', new Date().toISOString());
    } else {
      next.set('to', new Date(`${value}T23:59:59.999Z`).toISOString());
      if (!next.get('from')) next.set('from', new Date(Date.now() - 30 * 86400000).toISOString());
    }
    const query = next.toString();
    router.replace(`${pathname}?${query}`, { scroll: false });
  }

  const canSave = (SAVED_VIEW_PATHS as readonly string[]).includes(pathname);

  return (
    <div className="sticky-bar">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="segmented" role="group" aria-label="Date range">
          {RANGES.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`range-${preset}`}
              aria-pressed={range === preset}
              onClick={() => setParams({ range: preset, from: null, to: null })}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="text-sm text-[var(--muted)]">
          <span className="sr-only">From</span>
          <input className="field" type="date" aria-label="From" onChange={(event) => setCustom('from', event.target.value)} />
        </label>
        <label className="text-sm text-[var(--muted)]">
          <span className="sr-only">To</span>
          <input className="field" type="date" aria-label="To" onChange={(event) => setCustom('to', event.target.value)} />
        </label>
        <Select
          label="Device"
          testId="filter-device"
          value={params.get('device') ?? ''}
          onChange={(value) => setParams({ device: value || null })}
          options={[['','All devices'], ...DEVICES.map((device) => [device, device[0]!.toUpperCase() + device.slice(1)])]}
        />
        <Select
          label="Country"
          testId="filter-country"
          value={params.get('country') ?? ''}
          onChange={(value) => setParams({ country: value || null })}
          options={[['', 'All countries'], ...COUNTRIES.map((country) => [country.code, country.name])]}
        />
        <Select
          label="Channel"
          testId="filter-channel"
          value={params.get('channel') ?? ''}
          onChange={(value) => setParams({ channel: value || null })}
          options={[
            ['', 'All channels'],
            ['direct', 'Direct'],
            ['google', 'Google'],
            ['github', 'GitHub'],
            ['twitter', 'Twitter / X'],
            ['newsletter', 'Newsletter'],
            ['producthunt', 'Product Hunt'],
            ['other', 'Other'],
          ]}
        />
        {canSave ? (
          <button type="button" className="btn" onClick={() => setNaming((value) => !value)}>
            Save view
          </button>
        ) : null}
        {naming ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({ name: name.trim(), path: pathname as (typeof SAVED_VIEW_PATHS)[number], query: params.toString() });
            }}
          >
            <input className="input w-48" aria-label="Name this view" required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
            <button className="btn-primary" type="submit" disabled={save.isPending}>
              Save
            </button>
          </form>
        ) : null}
        <span className="text-sm text-[var(--muted)]" role="status">
          {status}
        </span>
      </div>
    </div>
  );
}

function Select({
  label,
  testId,
  value,
  onChange,
  options,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="text-sm">
      <span className="sr-only">{label}</span>
      <select className="select" data-testid={testId} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || 'all'} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
