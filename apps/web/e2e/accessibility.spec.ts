import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { seedDeal, uniqueCompany } from './support/commercial';
import { seedCore } from './support/core';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

async function seriousViolations(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.evaluate((value) => {
    window.localStorage.setItem('theme', value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  }, theme);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
    }));
}

const anonymousScreens = [
  '/sign-in',
  '/magic-link',
  '/accept-invitation',
  '/apply',
  '/apply/thanks',
];
const studioScreens = [
  '/',
  `/c/${credentials.clientId}`,
  '/settings/sessions',
  '/pipeline',
  '/pipeline?view=list',
  '/applications',
  '/applications?tab=queue_b',
  '/acquisition',
  '/settings/integrations',
  '/settings/application',
  '/settings/booking',
  '/settings/templates',
];

test.describe('accessibility @responsive', () => {
  for (const path of anonymousScreens) {
    test(`${path} has no serious or critical violations in light and dark`, async ({ page }) => {
      await page.goto(path);
      for (const theme of ['light', 'dark'] as const) {
        expect(await seriousViolations(page, theme), `${path} ${theme}`).toEqual([]);
      }
    });
  }

  test('studio screens have no serious or critical violations in light and dark', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { dealId } = await seedDeal(credentials.organizationId, {
      ...uniqueCompany('Core Acessibilidade'),
      code: '0.3',
      withCall: true,
    });
    await seedCore(credentials.organizationId, dealId, { code: '1.1' });
    await signInWithPassword(page, credentials.founder);
    for (const path of [...studioScreens, `/pipeline/${dealId}`, `/pipeline/${dealId}/core/call`]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      for (const theme of ['light', 'dark'] as const) {
        expect(await seriousViolations(page, theme), `${path} ${theme}`).toEqual([]);
      }
    }
  });
});
