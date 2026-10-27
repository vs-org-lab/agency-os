import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { CLIENT_SIGNER, seedContractDeal, studioSignerName } from './support/contracts';
import { readCredentials } from './support/credentials';
import { dismissPortalWelcome } from './support/ui';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Proposal and contract', () => {
  test('the deal reaches 2.1 after both signatures', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const seeded = await seedContractDeal(credentials.organizationId);
    const studioSigner = await studioSignerName(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/pipeline/${seeded.dealId}`);
    const proposal = page.locator('section', {
      has: page.getByRole('heading', { name: 'Proposta' }),
    });
    const amounts = await proposal.getByLabel('Valor único').all();
    for (const [index, field] of amounts.entries()) await field.fill(String((index + 1) * 6000));
    for (const line of await proposal.getByLabel('Linha do âmbito 1').all()) {
      await line.fill('Novo site institucional');
    }
    await proposal.getByRole('button', { name: 'Enviar ao cliente' }).click();
    await expect(proposal.getByText('Enviada ao cliente')).toBeVisible({ timeout: 60_000 });

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.signerEmail));
    await client.goto('/portal');
    await dismissPortalWelcome(client);
    await client.getByRole('link', { name: 'Ver a proposta' }).click();
    await expect(client.getByRole('heading', { name: 'Proposta', level: 1 })).toBeVisible();
    await expectAccessible(client);
    await client.getByRole('radio', { name: /Orbit com Gravity/ }).check();
    await client.getByLabel('Denominação da empresa').fill(seeded.company);
    await client.getByLabel('NIF').fill('500100200');
    await client.getByLabel('Morada da sede').fill('Rua do Cliente 10, Porto');
    await client.getByLabel('O seu nome completo').fill(CLIENT_SIGNER);
    await client.getByLabel('O seu cargo').fill('Administradora');
    await client.getByRole('button', { name: 'Aceitar proposta e preparar contrato' }).click();

    await expect(client).toHaveURL(/\/portal\/contracts\//, { timeout: 30_000 });
    await expect(client.getByText(seeded.company).first()).toBeVisible();
    await expectAccessible(client);
    await client.getByLabel(`Escreva o seu nome completo: ${CLIENT_SIGNER}`).fill(CLIENT_SIGNER);
    await client.getByRole('checkbox', { name: 'Li e aceito este contrato' }).click();
    await client.getByRole('button', { name: 'Assinar contrato' }).click();
    await expect(client.getByText('Já assinou. Falta a assinatura da Aurion.')).toBeVisible({
      timeout: 30_000,
    });

    await page.reload();
    const contract = page.locator('section', {
      has: page.getByRole('heading', { name: 'Contrato' }),
    });
    await contract.getByLabel(`Escreva o seu nome completo: ${studioSigner}`).fill(studioSigner);
    await contract.getByRole('checkbox', { name: 'Li e aceito este contrato' }).click();
    await contract.getByRole('button', { name: 'Assinar pela Aurion' }).click();
    await expect(contract.getByText('Assinado', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('2.1', { exact: true }).first()).toBeVisible();

    const download = await page.request.get(
      (await contract
        .getByRole('link', { name: 'Descarregar o contrato assinado (PDF)' })
        .getAttribute('href')) ?? '',
    );
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toContain('application/pdf');

    await client.reload();
    await expect(client.getByText('Contrato assinado por ambas as partes')).toBeVisible();
    await expect(
      client.getByRole('link', { name: 'Descarregar o contrato assinado (PDF)' }),
    ).toBeVisible();
    await clientContext.close();
  });
});
