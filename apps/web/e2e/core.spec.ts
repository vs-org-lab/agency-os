import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { seedDeal, uniqueCompany } from './support/commercial';
import { EVIDENCE_PNG, seedCore, seedSharedCore } from './support/core';
import { readCredentials } from './support/credentials';
import { dismissPortalWelcome } from './support/ui';

const credentials = readCredentials();

async function moveTo(page: Page, code: string): Promise<void> {
  await page.getByRole('button', { name: 'Mover para…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mover para').selectOption(code);
  await dialog.getByRole('button', { name: 'Mover' }).click();
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
}

async function addFinding(
  page: Page,
  input: { title: string; evidence: 'file' | 'link'; owner: 'Interno' | 'Aurion' },
): Promise<void> {
  await page.getByRole('button', { name: 'Novo achado' }).first().click();
  await page.getByLabel('Achado', { exact: true }).fill(input.title);
  if (input.evidence === 'file') {
    await page
      .getByLabel('Ficheiro (PNG, JPEG, WebP ou PDF até 4 MB)')
      .setInputFiles({ name: 'prova.png', mimeType: 'image/png', buffer: EVIDENCE_PNG });
  } else {
    await page.getByLabel('Prova', { exact: true }).selectOption('link');
    await page.getByLabel('Valor da prova').fill('https://example.com/relatorio');
  }
  await page.getByLabel('Responsável').selectOption({ label: input.owner });
  await page.getByRole('button', { name: 'Guardar achado' }).click();
  await expect(page.getByText(input.title).first()).toBeVisible();
}

test.describe('Aurion Core', () => {
  test('founder runs the Core from call to delivery', async ({ page }) => {
    test.setTimeout(240_000);
    const { company } = uniqueCompany('Core Fluxo');
    const { dealId } = await seedDeal(credentials.organizationId, {
      company,
      code: '0.3',
      withCall: true,
    });
    await seedCore(credentials.organizationId, dealId);
    await signInWithPassword(page, credentials.founder);

    await page.goto(`/pipeline/${dealId}`);
    await page.getByRole('tab', { name: 'Chamadas' }).click();
    await page.getByLabel('Resultado').selectOption('advance');
    await page.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(page.getByText('1.1', { exact: true })).toBeVisible();

    await page.goto(`/pipeline/${dealId}/core/call`);
    await page
      .getByLabel('Como descreves a empresa a alguém que a ouve pela primeira vez?')
      .fill('Consultora de energia com vinte anos de mercado.');
    await page.getByRole('button', { name: 'Seguinte' }).click();
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(
      page.getByLabel('Como descreves a empresa a alguém que a ouve pela primeira vez?'),
    ).toHaveValue('Consultora de energia com vinte anos de mercado.');
    await page.reload();
    await expect(
      page.getByLabel('Como descreves a empresa a alguém que a ouve pela primeira vez?'),
    ).toHaveValue('Consultora de energia com vinte anos de mercado.');

    await page.goto(`/pipeline/${dealId}`);
    await expect(page.getByRole('tab', { name: 'Core', selected: true })).toBeVisible();
    await addFinding(page, {
      title: 'Formulário falha no telemóvel',
      evidence: 'file',
      owner: 'Interno',
    });
    const evidence = page.getByRole('link', { name: 'Ver prova' }).first();
    const evidenceResponse = await page.request.get((await evidence.getAttribute('href')) ?? '');
    expect(evidenceResponse.status()).toBe(200);
    expect(evidenceResponse.headers()['content-type']).toContain('image/png');
    await addFinding(page, {
      title: 'Sem rastreamento de conversões',
      evidence: 'link',
      owner: 'Interno',
    });

    for (const points of await page.getByRole('slider', { name: 'Pontos (0 a 5)' }).all()) {
      await points.focus();
      await page.keyboard.press('Home');
      for (let step = 0; step < 3; step += 1) await page.keyboard.press('ArrowRight');
    }
    for (const justification of await page.getByLabel('Justificação').all()) {
      await justification.fill('Prova na auditoria');
    }
    const scoreForms = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Guardar pontuação' }) });
    for (let index = 0; index < (await scoreForms.count()); index += 1) {
      const form = scoreForms.nth(index);
      await form.getByRole('button', { name: 'Guardar pontuação' }).click();
      await expect(form.getByText('Pontuação guardada.')).toBeVisible();
    }

    await page.getByLabel('Notas da revisão').fill('Nada óbvio para este CEO.');
    await page.getByRole('button', { name: 'Registar revisão' }).click();
    await expect(page.getByText(/Revista a/)).toBeVisible();

    await page.getByRole('button', { name: 'Anexar apresentação Figma' }).click();
    await page.getByLabel('Título').fill('Sessão de proposta');
    await page.getByLabel('Link do Figma').fill('https://www.figma.com/deck/AbC123/Core-E2E');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Sessão de proposta').first()).toBeVisible();

    await page.getByRole('button', { name: 'Partilhar briefing com o cliente' }).click();
    await expect(page.getByText(/Partilhado com o cliente a/)).toBeVisible({ timeout: 60_000 });

    await page.getByRole('tab', { name: 'Chamadas' }).click();
    await page.getByLabel('Data e hora').fill('2030-01-15T11:00');
    await page.getByRole('button', { name: 'Marcar sessão de proposta' }).click();
    await expect(page.getByText('Marcada').first()).toBeVisible();

    for (const code of ['1.2', '1.3', '1.4', '1.5']) await moveTo(page, code);

    await page.getByRole('tab', { name: 'Core' }).click();
    await page.getByRole('button', { name: 'Partilhar com o cliente' }).click();
    await expect(page.getByText('Com o cliente', { exact: true })).toBeVisible();
    await moveTo(page, '1.6');
  });

  test('call mode may use the microphone and tab capture', async ({ page }) => {
    const { company } = uniqueCompany('Core Microfone');
    const { dealId } = await seedDeal(credentials.organizationId, {
      company,
      code: '0.3',
      withCall: true,
    });
    await seedCore(credentials.organizationId, dealId);
    await signInWithPassword(page, credentials.founder);
    const allows = (feature: string) =>
      page.evaluate(
        (name) =>
          (
            document as Document & {
              featurePolicy?: { allowsFeature(feature: string): boolean };
            }
          ).featurePolicy?.allowsFeature(name) ?? null,
        feature,
      );

    await page.goto(`/pipeline/${dealId}`);
    expect(await allows('microphone')).toBe(false);
    await page.getByRole('tab', { name: 'Core' }).click();
    await page.getByRole('link', { name: 'Abrir modo call' }).click();
    await expect(page.getByRole('heading', { name: 'Gravação da call' })).toBeVisible();

    expect(await allows('microphone')).toBe(true);
    expect(await allows('display-capture')).toBe(true);
  });

  test('uploaded audio becomes the Core transcript @fake-transcription', async ({ page }) => {
    test.setTimeout(120_000);
    const { company } = uniqueCompany('Core Gravação');
    const { dealId } = await seedDeal(credentials.organizationId, {
      company,
      code: '0.3',
      withCall: true,
    });
    await seedCore(credentials.organizationId, dealId);
    await signInWithPassword(page, credentials.founder);
    const audio = {
      name: 'call.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
    };

    await page.goto(`/pipeline/${dealId}/core/call`);
    await page.getByLabel('Carregar ficheiro de áudio').setInputFiles(audio);
    await expect(page.getByText('Confirme que o cliente autorizou a gravação.')).toBeVisible();

    await page.getByRole('checkbox', { name: 'O cliente autorizou a gravação' }).click();
    await page.getByLabel('Carregar ficheiro de áudio').setInputFiles(audio);
    await expect(page.getByText('Transcrição pronta.')).toBeVisible({ timeout: 60_000 });

    await page.getByRole('tab', { name: 'Transcrição' }).click();
    await expect(page.getByLabel('Transcrição da call')).toHaveValue(
      /— Gravação de .+ —\n\n\[00:00\] Transcrição automática de teste\./,
    );
  });

  test('prospect sees only the shared briefing and presentation', async ({ page }) => {
    const shared = await seedSharedCore(credentials.organizationId, credentials.clientId);

    await page.goto(await magicLinkPath(credentials.client.email));
    await page.goto('/portal');
    await dismissPortalWelcome(page);

    await expect(page.getByText(shared.note)).toBeVisible();
    await expect(page.getByText(shared.presentation)).toBeVisible();
    await expect(page.getByText('Rascunho interno')).toHaveCount(0);
    await expect(page.getByText('Transcrição interna')).toHaveCount(0);

    await page.getByRole('link', { name: 'Ver apresentação' }).first().click();
    await expect(page.locator('iframe[src^="https://embed.figma.com/"]')).toBeVisible();
  });
});
