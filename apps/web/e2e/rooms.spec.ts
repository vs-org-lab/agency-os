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

async function setStep(page: Page, name: string, status: 'Feito' | 'Em curso') {
  await page.getByLabel(`Estado do passo ${name}`).selectOption({ label: status });
  await expect(page.getByText('Guardado.')).toBeVisible({ timeout: 30_000 });
  await page.reload();
}

test.describe('Rooms', () => {
  test('the process moves the deal and the client approves a phase in the portal', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}`);
    await expect(page.getByRole('heading', { name: seeded.company, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Começar fase' }).click();
    await expect(page.getByText('Fase começada.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expectAccessible(page);

    await setStep(page, 'Questionário de descoberta', 'Feito');
    await setStep(page, 'Análise técnica', 'Feito');
    await expect(page.getByText('Enviado ao cliente')).toBeVisible();
    await setStep(page, 'Arquitetura e mapa de conteúdos', 'Feito');

    await page.getByRole('button', { name: 'Pedir aprovação' }).click();
    await expect(page.getByText('Pedido de aprovação enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(`/c/${seeded.clientId}/updates`);
    await page.getByLabel('Texto').fill('A arquitetura está pronta para a sua revisão.');
    await page.getByLabel('Visível ao cliente').check();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Atualização publicada.')).toBeVisible({ timeout: 30_000 });

    await page.goto(`/c/${seeded.clientId}/preview`);
    await expect(page.getByText('A arquitetura está pronta para a sua revisão.')).toBeVisible();
    await expect(page.getByText('Análise técnica')).toHaveCount(0);
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal');
    await expect(client.getByText('Fase atual: Descoberta e arquitetura')).toBeVisible();
    await client.getByRole('link', { name: 'Ver aprovações (1)' }).click();
    await expectAccessible(client);
    await client.getByRole('button', { name: 'Aprovar' }).click();
    await expect(client.getByText('Decisão registada. Obrigado.')).toBeVisible({
      timeout: 30_000,
    });

    await client.goto('/portal/updates');
    await expect(client.getByText('Novo passo: Arquitetura e mapa de conteúdos')).toBeVisible();
    await expect(client.getByText('A arquitetura está pronta para a sua revisão.')).toBeVisible();
    await expectAccessible(client);
    await clientContext.close();

    await page.goto(`/pipeline/${seeded.dealId}`);
    await expect(page.getByText('2.4', { exact: true }).first()).toBeVisible();
  });
});
