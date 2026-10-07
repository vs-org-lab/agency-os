import { expect, test, type Page } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import {
  bookingLinkFor,
  dealIdForCompany,
  fillApplication,
  PATH_A,
  PATH_B,
  PATH_C,
  submitApplication,
  uniqueCompany,
} from './support/commercial';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

async function bookFirstSlot(page: Page): Promise<void> {
  await page
    .getByRole('group', { name: 'Horários disponíveis' })
    .getByRole('button')
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirmar marcação' }).click();
  await expect(page.getByText('A chamada está marcada')).toBeVisible();
}

test.describe('commercial applications @public-writes', () => {
  test('path a applicant books a call and the founder sees the deal at 0.3 @responsive', async ({
    page,
    browser,
  }) => {
    const lead = uniqueCompany('Empresa A');
    await fillApplication(page, { ...lead, answers: PATH_A });
    await submitApplication(page);
    await expect(page.getByRole('heading', { name: 'Está dentro do perfil.' })).toBeVisible();
    await bookFirstSlot(page);

    const founder = await browser.newPage();
    await signInWithPassword(founder, credentials.founder);
    await founder.goto('/pipeline');
    await expect(
      founder.getByRole('region', { name: /^0\.3 / }).getByText(lead.company),
    ).toBeVisible();
    await founder.close();
  });

  test('path c applicant sees the thank-you page and the deal closes at X.4', async ({
    page,
    browser,
  }) => {
    const lead = uniqueCompany('Empresa C');
    await fillApplication(page, { ...lead, answers: PATH_C });
    await submitApplication(page);
    await expect(
      page.getByRole('heading', { name: 'Obrigado pela honestidade das respostas.' }),
    ).toBeVisible();

    const founder = await browser.newPage();
    await signInWithPassword(founder, credentials.founder);
    await founder.goto('/pipeline');
    await expect(
      founder.getByRole('region', { name: /^X\.4 / }).getByText(lead.company),
    ).toBeVisible();
    await founder.close();
  });

  test('queue b approval and booking link flow', async ({ page, browser }) => {
    const lead = uniqueCompany('Empresa B');
    await fillApplication(page, { ...lead, answers: PATH_B });
    await submitApplication(page);
    await expect(page.getByRole('heading', { name: 'Recebemos a sua candidatura.' })).toBeVisible();

    const founder = await browser.newPage();
    await signInWithPassword(founder, credentials.founder);
    await founder.goto('/applications?tab=queue_b');
    await founder.getByRole('button', { name: `Aprovar para A · ${lead.company}` }).click();
    await founder.getByRole('button', { name: 'Confirmar' }).click();
    await expect(founder.getByText(lead.company)).toHaveCount(0);
    await founder.close();

    await page.goto(bookingLinkFor(await dealIdForCompany(lead.company)));
    await bookFirstSlot(page);
  });

  test('honeypot submission shows the generic thank-you page', async ({ page }) => {
    const lead = uniqueCompany('Empresa Robô');
    await fillApplication(page, { ...lead, answers: PATH_A });
    await page.evaluate(() => {
      const field = document.querySelector<HTMLInputElement>('input[name="company_fax"]');
      if (field) field.value = '+351 210 000 000';
    });
    await submitApplication(page);
    await expect(page.getByRole('heading', { name: 'Obrigado.' })).toBeVisible();
  });
});
