import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';
import { pickDate } from './support/ui';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

test.describe('Retainers', () => {
  test('the client asks for work within the limit and approves a quoted extra request', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRoomProject(credentials.organizationId);
    const today = new Date();
    const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/retainer`);
    await page.getByLabel('Nível').fill('Essencial');
    await page.getByLabel('Valor mensal').fill('1500');
    await pickDate(page, page.getByRole('button', { name: /^Início/ }), isoDate(today));
    await pickDate(page, page.getByRole('button', { name: /^Revisão anual/ }), isoDate(nextYear));
    await page.getByLabel('Peças de conteúdo').fill('2');
    await page.getByRole('button', { name: 'Guardar retainer' }).click();
    await expect(page.getByRole('group', { name: 'Peças de conteúdo' })).toContainText('0 de 2', {
      timeout: 30_000,
    });
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/progress');
    await client.getByLabel('O que precisa').fill('Publicação do evento');
    await client.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(client.getByText('Pedido recebido: a equipa já tem a tarefa.')).toBeVisible({
      timeout: 30_000,
    });

    await client.getByLabel('O que precisa').fill('Série de verão');
    await client.getByLabel('Quantidade').fill('2');
    await client.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(client.getByText(/Este pedido passa o limite do mês/)).toBeVisible({
      timeout: 30_000,
    });

    await page.reload();
    const extra = page.getByRole('listitem').filter({ hasText: 'Série de verão' });
    await extra.getByLabel('Valor do orçamento').fill('150');
    await extra.getByRole('button', { name: 'Enviar orçamento' }).click();
    await expect(page.getByText('Orçamento enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });

    await client.reload();
    const quoted = client.getByRole('listitem').filter({ hasText: 'Série de verão' });
    await expect(quoted).toContainText(/150,00\s€/);
    await expectAccessible(client);
    await quoted.getByRole('button', { name: 'Aprovar orçamento' }).click();
    await expect(client.getByText('Orçamento aprovado. A equipa vai começar.')).toBeVisible({
      timeout: 30_000,
    });
    await clientContext.close();

    await page.reload();
    await expect(page.getByRole('group', { name: 'Peças de conteúdo' })).toContainText('1 de 2');
    const usage = page.getByRole('region', { name: 'Registos do mês' });
    await expect(
      usage.getByRole('listitem').filter({ hasText: 'Série de verão' }).getByText('Pedido extra'),
    ).toBeVisible();

    await page.goto(`/c/${seeded.clientId}/tasks`);
    await expect(page.getByText('Pedido do cliente: Publicação do evento')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Pedido do cliente: Série de verão')).toBeVisible();
  });
});
