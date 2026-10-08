import { expect, test } from '@playwright/test';
import { createTeamInvitation, magicLinkPath } from './support/admin';
import { signInWithPassword, submitTotp } from './support/auth';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

test('founder signs in with password and totp', async ({ page }) => {
  await signInWithPassword(page, credentials.founder);

  await expect(page.getByRole('link', { name: 'E2E Client' })).toBeVisible();
  await page.getByRole('link', { name: 'E2E Client' }).click();
  await expect(page.getByRole('heading', { name: 'Sala sem conteúdo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Todos os clientes' })).toBeVisible();
});

test('wrong password shows a generic error', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(credentials.founder.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(page.getByText('Email ou palavra-passe incorretos.')).toBeVisible();
});

test('invited manager sets password, enrols totp and reaches studio', async ({ page }) => {
  const invitation = await createTeamInvitation(credentials.organizationId);

  await page.goto(invitation.path);
  await page.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(page).toHaveURL(/\/set-password/);

  await page.getByLabel('Nova palavra-passe').fill(`Invitee-${Date.now()}-Strong-Passphrase`);
  await page.getByRole('button', { name: 'Guardar palavra-passe' }).click();
  await expect(page).toHaveURL(/\/mfa\/enroll/);

  const secret = (await page.locator('code').innerText()).trim();
  await submitTotp(page, secret);
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
});

test('client signs in with magic link and reaches portal', async ({ page }) => {
  await page.goto(await magicLinkPath(credentials.client.email));

  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole('link', { name: 'Início' })).toBeVisible();
});

test('client cannot open the studio', async ({ page }) => {
  await page.goto(await magicLinkPath(credentials.client.email));
  await expect(page).toHaveURL(/\/portal$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/portal$/);
  await page.goto(`/c/${credentials.clientId}`);
  await expect(page).toHaveURL(/\/portal$/);
});

test('revoking a session signs that browser out', async ({ browser }) => {
  const first = await browser.newContext();
  const userAgent = `E2E-second-browser-${Date.now()}`;
  const second = await browser.newContext({ userAgent });
  const pageA = await first.newPage();
  const pageB = await second.newPage();

  await signInWithPassword(pageA, credentials.founder);
  await signInWithPassword(pageB, credentials.founder);

  await pageA.goto('/settings/sessions');
  const otherSession = pageA
    .getByRole('listitem')
    .filter({ has: pageA.locator(`[title="${userAgent}"]`) });
  await otherSession.getByRole('button', { name: 'Terminar sessão' }).click();
  await expect(otherSession).toBeHidden();

  await pageB.goto('/settings/sessions');
  await expect(pageB).toHaveURL(/\/sign-in/);

  await first.close();
  await second.close();
});
