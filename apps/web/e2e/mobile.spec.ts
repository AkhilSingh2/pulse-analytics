import { expect, test } from '@playwright/test';

test('mobile menu reaches funnels', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Funnels' }).click();
  await expect(page.getByRole('heading', { name: 'Funnels' })).toBeVisible();
  await expect(page.getByTestId('funnel')).toContainText('%');
});
