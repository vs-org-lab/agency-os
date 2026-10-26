import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { ROOM_DECISION_MAKER, seedRoomProject } from './support/rooms';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Academy', () => {
  test('the team publishes a checklist, the client checks a step and sees the session', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/academy`);
    await expect(page.getByRole('heading', { level: 1, name: 'Academia' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Novo item' }).click();
    await page.getByLabel('Título').fill('Arranque do CMS');
    await page.getByLabel('Passos, um por linha').fill('Entrar no CMS\nPublicar um artigo');
    await page.getByRole('button', { name: 'Guardar item' }).click();
    const card = page.getByRole('article', { name: 'Arranque do CMS' });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: 'Publicar' }).click();
    await expect(card.getByText('Publicado')).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/academy');
    await expect(client.getByRole('heading', { level: 1, name: 'Academia' })).toBeVisible({
      timeout: 30_000,
    });
    await client.getByRole('checkbox', { name: 'Entrar no CMS' }).check();
    await expect(client.getByText('1 de 2 passos')).toBeVisible({ timeout: 30_000 });
    await expectAccessible(client);

    await page.reload();
    await expect(card.getByText('1 de 2 passos')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Registar sessão' }).click();
    const form = page.getByRole('form', { name: 'Registar sessão' });
    await form.getByLabel('Data').fill('2026-10-14');
    await form.getByLabel('Título').fill('Formação do CMS');
    await form.getByLabel(ROOM_DECISION_MAKER).check();
    await form.getByLabel('Arranque do CMS').check();
    await form.getByRole('button', { name: 'Guardar sessão' }).click();
    await expect(page.getByText(`Com ${ROOM_DECISION_MAKER}`)).toBeVisible({ timeout: 30_000 });

    await client.reload();
    await expect(client.getByText('Formação do CMS')).toBeVisible({ timeout: 30_000 });
    await clientContext.close();
  });
});
