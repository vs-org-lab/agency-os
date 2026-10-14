import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';

const credentials = readCredentials();
const SITE = 'http://localhost:3001';

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Brand Hub domain and manual @fake-domains', () => {
  test('a verified client domain is connected once the client approves, and the manual downloads', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRoomProject(credentials.organizationId);
    const slug = `e2e-${randomUUID().slice(0, 8)}`;
    const hostname = `marca-${randomUUID().slice(0, 8)}.verified.test`;
    const mission = `Missão ${randomUUID().slice(0, 6)}`;

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/hub`);
    await page.getByRole('button', { name: 'Criar Brand Hub' }).click();
    await page.getByLabel('Missão').fill(mission);
    await page.getByRole('button', { name: 'Guardar bloco' }).click();
    await expect(page.getByText('Bloco guardado.')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Publicado. O cliente já vê esta versão.')).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Partilha', exact: true }).click();
    await page.getByLabel('Endereço do hub').fill(slug);
    await page.getByRole('radio', { name: /Público/ }).check();
    await page.getByRole('button', { name: 'Guardar partilha' }).click();
    await expect(page.getByText('Partilha guardada.')).toBeVisible({ timeout: 30_000 });

    await page.getByLabel('Endereço do domínio').fill(hostname);
    await page.getByRole('button', { name: 'Guardar domínio' }).click();
    await expect(page.getByText(`_agency-os.${hostname}`)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page.getByText('Estado: Verificado')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/exige o Brand Hub aprovado pelo cliente\. Peça a aprovação/),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ligar domínio' })).toBeDisabled();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Pedir aprovação' }).click();
    await expect(page.getByText('Pedido enviado ao decisor.')).toBeVisible({ timeout: 30_000 });
    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/hub');
    await client.getByRole('button', { name: 'Aprovar' }).click();
    await expect(client.getByText('Decisão registada. Obrigado.')).toBeVisible({
      timeout: 30_000,
    });
    const portalManual = client.waitForEvent('download');
    await client.getByRole('button', { name: 'Manual completo (PDF)' }).click();
    expect((await portalManual).suggestedFilename()).toMatch(/-manual-de-marca\.pdf$/);
    await clientContext.close();

    await page.reload();
    await page.getByRole('button', { name: 'Partilha', exact: true }).click();
    await page.getByRole('button', { name: 'Ligar domínio' }).click();
    await expect(page.getByText(`O site está disponível em https://${hostname}.`)).toBeVisible({
      timeout: 30_000,
    });

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`${SITE}/${slug}/`);
    await expect(visitor.getByText(mission)).toBeVisible({ timeout: 30_000 });
    const siteManual = visitor.waitForEvent('download');
    await visitor.getByRole('button', { name: 'Manual completo (PDF)' }).click();
    expect((await siteManual).suggestedFilename()).toMatch(/-manual-de-marca\.pdf$/);
    await visitorContext.close();
  });
});
