import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';

const credentials = readCredentials();

const CONDITIONS = [
  'Acessos entregues em 5 dias úteis',
  'Aprovações dentro do prazo',
  'Orçamento de media acordado',
];

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

function inDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe('Outcome and guarantee', () => {
  test('the team agrees the outcome and records its progress; the client follows it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/outcome`);
    await page.getByLabel('Métrica').fill('Leads por mês');
    await page.getByLabel('Unidade').fill('leads');
    await page.getByLabel('Linha de base').fill('40');
    await page.getByLabel('Meta').fill('60');
    await page.getByLabel('Prazo').fill(inDays(30));
    await page.getByLabel('Fonte dos dados').fill('Google Analytics');
    await page.getByRole('button', { name: 'Guardar resultado' }).click();
    const evolution = page.getByRole('region', { name: 'Evolução' });
    await expect(evolution).toBeVisible({ timeout: 30_000 });

    await evolution.getByLabel('Valor').fill('45');
    await evolution.getByRole('button', { name: 'Registar' }).click();
    await expect(page.getByText('Valor registado.')).toBeVisible({ timeout: 30_000 });

    const conditions = page.getByRole('region', { name: 'Condições do cliente' });
    for (const description of CONDITIONS) {
      const item = conditions.getByRole('listitem').filter({ hasText: description });
      await item.getByRole('button', { name: 'Cumprida' }).click();
      await expect(item.getByText('Condição registada.')).toBeVisible({ timeout: 30_000 });
    }
    await page.reload();
    await expect(page.getByRole('region', { name: 'Condições do cliente' })).not.toContainText(
      'Por registar',
    );
    await expect(page.getByText(/^Por decidir até /)).toBeVisible();
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/progress');
    const outcome = client.getByRole('region', { name: 'Resultado acordado' });
    await expect(
      outcome.getByRole('img', { name: 'Evolução de Leads por mês: de 40 para a meta 60' }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(outcome.getByRole('table')).toContainText('45');
    for (const description of CONDITIONS) {
      await expect(outcome.getByRole('listitem').filter({ hasText: description })).toContainText(
        'Cumprida a',
      );
    }
    await expectAccessible(client);
    await clientContext.close();
  });
});
