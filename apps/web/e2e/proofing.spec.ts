import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
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

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A solid-colour PNG large enough to click on. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  const pixels = Buffer.concat(Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A PDF with one line of text on each of its pages. */
async function pdf(pages: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let number = 1; number <= pages; number += 1) {
    document.addPage([420, 595]).drawText(`Página ${number}`, { x: 40, y: 540, size: 24 });
  }
  return Buffer.from(await document.save());
}

async function openProofsTab(page: Page, clientId: string) {
  await page.goto(`/c/${clientId}`);
  await page.getByRole('tab', { name: 'Para aprovação' }).click();
}

test.describe('File proofing', () => {
  test('the client comments on a spot, asks for changes and approves the next version', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const title = `Logótipo ${randomUUID().slice(0, 6)}`;
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await openProofsTab(page, seeded.clientId);
    await page.getByText('Novo ficheiro').click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Ficheiro', { exact: true }).setInputFiles({
      name: 'logotipo.png',
      mimeType: 'image/png',
      buffer: png(320, 200, [30, 90, 200]),
    });
    await page.getByRole('button', { name: 'Carregar' }).click();
    await expect(page.getByText('Ficheiro carregado.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole('tab', { name: 'Para aprovação' }).click();
    await page.getByRole('button', { name: 'Pedir aprovação' }).click();
    await expect(page.getByText('Pedido de aprovação enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/approvals');
    await expect(client.getByRole('heading', { name: 'Ficheiros' })).toBeVisible();
    await client.getByRole('link', { name: `Abrir ${title}` }).click();
    const image = client.getByRole('img', { name: `${title}, versão 1` });
    await expect(image).toBeVisible();
    await image.click({ position: { x: 80, y: 50 } });
    await expect(client.getByText('Ponto 1')).toBeVisible();
    await client.getByLabel('Comentário', { exact: true }).fill('O azul está demasiado escuro.');
    await client.getByRole('button', { name: 'Comentar' }).click();
    await expect(client.getByText('Comentário enviado.')).toBeVisible({ timeout: 30_000 });
    await expect(client.getByRole('button', { name: 'Comentário 1' })).toBeVisible();
    await expectAccessible(client);
    await client.getByLabel('O que deve mudar').fill('Clarear o azul, por favor.');
    await client.getByRole('button', { name: 'Pedir alterações' }).click();
    await expect(client.getByText('Decisão registada. Obrigado.')).toBeVisible({ timeout: 30_000 });

    await openProofsTab(page, seeded.clientId);
    await page.getByLabel('Nova versão').setInputFiles({
      name: 'logotipo-v2.png',
      mimeType: 'image/png',
      buffer: png(320, 200, [90, 150, 240]),
    });
    await expect(page.getByText('Ficheiro carregado.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole('tab', { name: 'Para aprovação' }).click();
    await page.getByRole('button', { name: 'Pedir aprovação' }).click();
    await expect(page.getByText('Pedido de aprovação enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });

    await client.goto('/portal/approvals');
    await client.getByRole('link', { name: `Abrir ${title}` }).click();
    await expect(client.getByRole('img', { name: `${title}, versão 2` })).toBeVisible();
    await client.getByRole('button', { name: 'Aprovar' }).click();
    await expect(client.getByText('Decisão registada. Obrigado.')).toBeVisible({ timeout: 30_000 });
    await clientContext.close();
  });

  test('a pdf proof renders page by page under the content security policy', async ({ page }) => {
    test.setTimeout(180_000);
    const policyErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
        policyErrors.push(message.text());
      }
    });
    const title = `Guia ${randomUUID().slice(0, 6)}`;
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await openProofsTab(page, seeded.clientId);
    await page.getByText('Novo ficheiro').click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Ficheiro', { exact: true }).setInputFiles({
      name: 'guia.pdf',
      mimeType: 'application/pdf',
      buffer: await pdf(2),
    });
    await page.getByRole('button', { name: 'Carregar' }).click();
    await expect(page.getByText('Ficheiro carregado.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole('tab', { name: 'Para aprovação' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('link', { name: 'Abrir' })
      .click();

    await expect(page.locator('canvas[aria-label="Página 1 de 2"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('A carregar o ficheiro…')).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Página seguinte' }).click();
    await expect(page.locator('canvas[aria-label="Página 2 de 2"]')).toBeVisible();
    await expect(page.getByText('Não foi possível mostrar o ficheiro.')).toBeHidden();
    expect(policyErrors).toEqual([]);
  });
});
