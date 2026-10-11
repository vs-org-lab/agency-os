import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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

/** A small solid-colour PNG. */
function png(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(32, 0);
  header.writeUInt32BE(32, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(32).fill([30, 90, 200]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(32).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('Library', () => {
  test('the team shares a folder and an attachment that the client downloads as a zip', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const folderName = `Entregas ${randomUUID().slice(0, 6)}`;
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/library`);
    await page.getByRole('button', { name: 'Nova pasta' }).click();
    await page.getByLabel('Nome da pasta').fill(folderName);
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.getByRole('link', { name: new RegExp(`^${folderName}`) }).click();
    await expect(page.getByRole('navigation', { name: 'Caminho da pasta' })).toContainText(
      folderName,
    );

    await page.getByLabel('Carregar ficheiros').setInputFiles({
      name: 'capa.png',
      mimeType: 'image/png',
      buffer: png(),
    });
    await expect(page.getByText('1 ficheiro carregado.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Descarregar capa.png' })).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar ao cliente' }).click();
    await expect(page.getByRole('button', { name: 'Tornar interna' })).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);

    await page.goto(`/c/${seeded.clientId}/updates`);
    await page.getByLabel('Texto').fill('A capa final está na Biblioteca.');
    await page.getByLabel('Visível ao cliente').check();
    await page.getByRole('checkbox', { name: /capa\.png/ }).check();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Atualização publicada.')).toBeVisible({ timeout: 30_000 });

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/library');
    await client.getByRole('link', { name: new RegExp(`^${folderName}`) }).click();
    await expect(client.getByRole('link', { name: 'Descarregar capa.png' })).toBeVisible();
    await expect(client.getByRole('button', { name: 'Nova pasta' })).toHaveCount(0);
    await expectAccessible(client);
    const download = client.waitForEvent('download');
    await client.getByRole('button', { name: 'Descarregar pasta' }).click();
    expect((await download).suggestedFilename()).toBe(`${folderName}.zip`);

    await client.goto('/portal/updates');
    await expect(client.getByRole('list', { name: 'Anexos' })).toContainText('capa.png');
    await clientContext.close();
  });
});
