import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Last month in Lisbon, as the report's document title names it. */
function lastMonthTitle(): string {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' })
    .format(new Date())
    .split('-')
    .map(Number);
  const index = (year ?? 0) * 12 + (month ?? 1) - 2;
  return `Relatório mensal — ${MONTHS[index % 12]} de ${Math.floor(index / 12)}`;
}

test.describe('Client reports', () => {
  test('the team shares the monthly report and the client opens it in the portal', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const seeded = await seedRoomProject(credentials.organizationId);
    const title = lastMonthTitle();

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/reports`);
    await expect(page.getByRole('heading', { level: 2, name: 'Relatórios' })).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Criar relatório' }).click();

    await expect(page.getByLabel('Resumo')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Resumo').fill('Um mês de entregas e de aprendizagem.');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Guardado.')).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Partilhar com o cliente' }).click();
    await page.getByRole('button', { name: 'Partilhar', exact: true }).click();
    await expect(page.getByText('Partilhado com o cliente.')).toBeVisible({ timeout: 60_000 });

    await page.goto(`/c/${seeded.clientId}/docs`);
    await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/docs');
    await client.getByRole('link', { name: new RegExp(title) }).click();
    await expect(client.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
    await clientContext.close();
  });
});
