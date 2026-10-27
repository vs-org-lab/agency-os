import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedDeliveryProject } from './support/rooms';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Delivery', () => {
  test("the team requests the final approval and the client's approval delivers the project", async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedDeliveryProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}`);
    const delivery = page.getByRole('region', { name: 'Entrega final' });
    await expect(delivery).toBeVisible({ timeout: 30_000 });
    await delivery.getByRole('button', { name: 'Pedir aprovação final' }).click();
    await expect(page.getByText('Pedido de aprovação final enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);

    const clientContext = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/approvals');
    const group = client.getByRole('region', { name: 'Entrega final' });
    await expect(group.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 30_000 });
    await expectAccessible(client);
    await group.getByRole('button', { name: 'Aprovar' }).click();
    await expect(client.getByText('Decisão registada. Obrigado.')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByText(/Projeto entregue a/)).toBeVisible({ timeout: 30_000 });

    await client.goto(`/portal/testimonial/${seeded.projectId}`);
    await client.getByLabel('Nome', { exact: true }).fill('Rita Moura');
    await client.getByRole('checkbox', { name: /Autorizo a gravação/ }).click();
    await client.getByRole('button', { name: 'Ativar câmara e microfone' }).click();
    await client.getByRole('button', { name: 'Começar a gravar' }).click();
    await expect(client.getByText('1 de 5 · Antes')).toBeVisible();
    await client.waitForTimeout(2_000);
    await client.getByRole('button', { name: 'Seguinte' }).click();
    await expect(client.getByText('2 de 5 · A mudança')).toBeVisible();
    await client.waitForTimeout(1_500);
    await client.getByRole('button', { name: 'Parar' }).click();
    await expect(client.getByRole('slider', { name: 'Posição do vídeo' })).toBeVisible();
    await client.getByRole('button', { name: 'Enviar vídeo' }).click();
    await expect(client.getByText('Obrigado pelo seu testemunho em vídeo.')).toBeVisible({
      timeout: 60_000,
    });

    await page.goto(`/c/${seeded.clientId}`);
    await page.getByRole('tab', { name: 'Testemunho do cliente' }).click();
    await expect(page.getByLabel('Vídeo do testemunho')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Pergunta 2' })).toBeVisible();

    await client.goto(`/portal/testimonial/${seeded.projectId}`);
    await client.getByRole('tab', { name: 'Escrever' }).click();
    await client.getByLabel('O seu testemunho').fill('Um site rápido e claro, entregue a tempo.');
    await client.getByLabel('Nome', { exact: true }).fill('Rita Moura');
    await client.getByLabel('Função', { exact: true }).fill('Administradora');
    await client.getByRole('checkbox', { name: /Autorizo/ }).click();
    await expectAccessible(client);
    await client.getByRole('button', { name: 'Enviar testemunho' }).click();
    await expect(client.getByText('Obrigado pelo seu testemunho.')).toBeVisible({
      timeout: 30_000,
    });
    await clientContext.close();
  });
});
