import { expect, type Page } from '@playwright/test';
import { generateSync } from 'otplib';

const TOTP_PERIOD_MS = 30_000;
let lastCode: string | null = null;

export async function freshTotp(secret: string): Promise<string> {
  let code = generateSync({ secret });
  while (code === lastCode) {
    const wait = TOTP_PERIOD_MS - (Date.now() % TOTP_PERIOD_MS) + 500;
    await new Promise((resolve) => setTimeout(resolve, wait));
    code = generateSync({ secret });
  }
  lastCode = code;
  return code;
}

export async function submitTotp(page: Page, secret: string): Promise<void> {
  await page.getByLabel('Código').fill(await freshTotp(secret));
  await page.getByRole('button', { name: 'Verificar' }).click();
}

export async function signInWithPassword(
  page: Page,
  credentials: { email: string; password: string; totpSecret: string },
): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/mfa\/verify/);
  await submitTotp(page, credentials.totpSecret);
  await expect(page.getByRole('heading', { name: 'O estúdio está pronto' })).toBeVisible();
}
