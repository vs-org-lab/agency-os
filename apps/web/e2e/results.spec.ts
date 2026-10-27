import { expect, test } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';
import { dismissPortalWelcome } from './support/ui';

const credentials = readCredentials();

function lisbonMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' })
    .format(new Date())
    .slice(0, 7);
}

test.describe('Client results', () => {
  test('the team defines an indicator, imports a CSV and the client sees the result', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const room = await seedRoomProject(credentials.organizationId);
    const month = lisbonMonth();

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${room.clientId}/results`);
    await expect(page.getByRole('heading', { name: 'Resultados', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: '+ Indicador' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo indicador' });
    await dialog.getByLabel('Nome').fill('Sessões');
    await dialog.getByLabel('Objetivo mensal (opcional)').fill('300');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('table', { name: 'Indicadores por mês' })).toContainText('Sessões');

    await page.getByRole('button', { name: 'Importar CSV' }).click();
    await page.getByLabel('Escolher ficheiro CSV').setInputFiles({
      name: 'ga4.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`Date,Sessões\n${month}-01,120\n${month}-02,200\n`),
    });
    await page.getByRole('button', { name: 'Rever 1 valor →' }).click();
    await expect(page.getByRole('region', { name: 'Sessões' })).toContainText('320');
    await page.getByRole('button', { name: 'Guardar valores' }).click();
    await expect(page.getByText('1 valor importado.')).toBeVisible({ timeout: 30_000 });

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(room.decisionMakerEmail));
    await expect(client).toHaveURL(/\/portal$/);
    await dismissPortalWelcome(client);
    const kpi = client.getByRole('group', { name: 'Sessões' });
    await expect(kpi).toContainText('320', { timeout: 30_000 });
    await expect(kpi).toContainText('Objetivo 300 · atingido');
    await clientContext.close();
  });
});
