import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword, submitTotp } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';
import { addSecondProject, capturedInvitationPath } from './support/team';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Team and invitations', () => {
  test('an invited freelancer sees only the assigned project @captured-email', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const suffix = randomUUID().slice(0, 8);
    const freelancerName = `Freelancer ${suffix}`;
    const freelancerEmail = `e2e-freelancer-${suffix}@e2e.agency-os.dev`;
    const room = await seedRoomProject(credentials.organizationId);
    const otherProject = `Campanha ${suffix}`;
    await addSecondProject(credentials.organizationId, room.clientId, otherProject);

    await signInWithPassword(page, credentials.founder);
    await page.goto('/settings/team');
    await expect(page.getByRole('heading', { name: 'Equipa', level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Nome').fill(freelancerName);
    await page.getByLabel('Email').fill(freelancerEmail);
    await page.getByLabel('Papel').selectOption('freelancer');
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(page.getByText('Convite enviado.')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await page.getByRole('link', { name: freelancerName }).click();
    await expect(page.getByRole('heading', { name: freelancerName, level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('checkbox', { name: room.company }).click();
    await expect(page.getByText('Atribuição guardada.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole('checkbox', { name: `Website · ${room.company}` }).click();
    await expect(page.getByText('Atribuição guardada.')).toBeVisible({ timeout: 30_000 });

    const invitee = await browser.newContext();
    const freelancer = await invitee.newPage();
    await freelancer.goto(await capturedInvitationPath(freelancerEmail));
    await freelancer.getByRole('button', { name: 'Aceitar convite' }).click();
    await expect(freelancer).toHaveURL(/\/set-password/);
    await freelancer
      .getByLabel('Nova palavra-passe')
      .fill(`Freelancer-${Date.now()}-Strong-Passphrase`);
    await freelancer.getByRole('button', { name: 'Guardar palavra-passe' }).click();
    await expect(freelancer).toHaveURL(/\/mfa\/enroll/);
    const secret = (await freelancer.locator('code').innerText()).trim();
    await submitTotp(freelancer, secret);
    await expect(freelancer.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();

    await freelancer.goto(`/c/${room.clientId}`);
    await expect(freelancer.getByRole('heading', { name: room.company, level: 1 })).toBeVisible();
    await expect(
      freelancer.getByRole('heading', { name: 'Descoberta e arquitetura', level: 2 }),
    ).toBeVisible();
    await expect(freelancer.getByText(otherProject)).toHaveCount(0);
    await expect(freelancer.getByText('Conceito')).toHaveCount(0);
    await invitee.close();
  });

  test('a decision maker invites a colleague to the portal', async ({ page }) => {
    test.setTimeout(180_000);
    const suffix = randomUUID().slice(0, 8);
    const room = await seedRoomProject(credentials.organizationId);
    const colleagueEmail = `e2e-colleague-${suffix}@e2e.agency-os.dev`;

    await page.goto(await magicLinkPath(room.decisionMakerEmail));
    await expect(page).toHaveURL(/\/portal$/);
    await page.getByRole('link', { name: 'Colegas' }).click();
    await expect(page.getByRole('heading', { name: 'Colegas', level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Nome').fill(`Colega ${suffix}`);
    await page.getByLabel('Email').fill(colleagueEmail);
    await page.getByLabel('Papel').selectOption('operational');
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(page.getByText('Convite enviado.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByText(colleagueEmail)).toBeVisible();
  });
});
