import { expect, test } from '@playwright/test';

test('overview shows KPIs, a chart, and the live stream', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByTestId('kpi-events')).toContainText(/\d/);
  await expect(page.getByTestId('kpi-activation')).toBeVisible();
  await expect(page.getByTestId('chart-volume')).toBeVisible();
  await expect(page.getByTestId('live-stream')).toBeVisible();
});

test('date range and theme update the page', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('range-7d').click();
  await expect(page).toHaveURL(/range=7d/);
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('funnels, retention, and acquisition render', async ({ page }) => {
  await page.goto('/funnels');
  await expect(page.getByRole('heading', { name: 'Funnels' })).toBeVisible();
  await expect(page.getByTestId('funnel')).toContainText('%');
  await page.goto('/retention');
  await expect(page.getByTestId('retention')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Week 0|Day 0/ })).toBeVisible();
  await page.goto('/acquisition');
  await expect(page.getByRole('heading', { name: 'Top pages' })).toBeVisible();
  await expect(page.getByText('/pricing').first()).toBeVisible();
});

test('csv export and saved views round-trip', async ({ page, request }) => {
  const csv = await request.get('/api/export?kind=events&range=7d');
  expect(csv.ok()).toBeTruthy();
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(await csv.text()).toContain('page_view');

  const name = `Mobile ${Date.now()}`;
  await page.goto('/?range=7d&device=mobile');
  await page.getByRole('button', { name: 'Save view' }).click();
  await page.getByLabel('Name this view').fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.goto('/views');
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('button', { name: `Delete ${name}` }).click();
  await expect(page.getByRole('heading', { name })).toHaveCount(0);
});

test('ingest validates batches and accepts a live event', async ({ page, request }) => {
  const missing = await request.post('/api/ingest', { data: { events: [] } });
  expect(missing.status()).toBe(401);
  const invalid = await request.post('/api/ingest', {
    headers: { authorization: 'Bearer pulse_live_demo_northstar' },
    data: { events: [] },
  });
  expect(invalid.status()).toBe(400);
  const id = crypto.randomUUID();
  const accepted = await request.post('/api/ingest', {
    headers: { authorization: 'Bearer pulse_live_demo_northstar' },
    data: {
      events: [
        {
          name: 'e2e_marker',
          clientEventId: id,
          anonymousId: 'anon_e2e_marker',
          sessionId: 'ses_e2e_marker1',
          path: '/e2e',
          device: 'desktop',
          country: 'IN',
        },
      ],
    },
  });
  expect(accepted.ok()).toBeTruthy();
  await page.goto('/events?range=24h&q=e2e_marker');
  await expect(page.getByText('e2e_marker').first()).toBeVisible();
});
