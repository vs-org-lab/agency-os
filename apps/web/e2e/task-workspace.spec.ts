import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';
import { seedLibraryFile, seedProjectTask } from './support/tasks';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Task workspace', () => {
  test('a task opens in its panel, takes a comment, a link and a library file, and reopens from the address', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const suffix = randomUUID().slice(0, 6);
    const title = `Preparar entrega ${suffix}`;
    const fileName = `briefing-${suffix}.pdf`;
    const comment = `Falta validar o texto ${suffix}`;
    const room = await seedRoomProject(credentials.organizationId);
    const task = await seedProjectTask(
      credentials.organizationId,
      room.clientId,
      room.dealId,
      title,
    );
    await seedLibraryFile(credentials.organizationId, room.clientId, task.projectId, fileName);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${room.clientId}/tasks`);
    const table = page.getByRole('table', { name: 'Tarefas' });
    await expect(table.getByRole('button', { name: title, exact: true })).toBeVisible();
    await expectAccessible(page);

    await table.getByRole('button', { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]task=${task.taskId}`));
    const panel = page.getByRole('dialog', { name: title });
    await expect(panel).toBeVisible();

    await panel.getByRole('tab', { name: /^Comentários e ficheiros/ }).click();
    await panel.getByPlaceholder('Escrever um comentário…').fill(comment);
    await panel.getByRole('button', { name: 'Comentar' }).click();
    await expect(panel.getByText(comment)).toBeVisible({ timeout: 30_000 });

    await panel.getByRole('button', { name: 'Adicionar link' }).click();
    await panel.getByLabel('Endereço').fill('https://example.com');
    await panel.getByLabel('Título (opcional)').fill('Exemplo');
    await panel.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(panel.getByRole('link', { name: 'Exemplo' })).toHaveAttribute(
      'href',
      'https://example.com/',
      { timeout: 30_000 },
    );

    await panel.getByRole('button', { name: 'Adicionar ficheiro' }).click();
    const picker = page.getByRole('dialog', { name: 'Ficheiros da biblioteca' });
    await picker.getByRole('button', { name: `Ligar ${fileName}` }).click();
    await expect(panel.getByRole('link', { name: fileName })).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page);

    await panel.getByRole('button', { name: 'Fechar' }).click();
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]task=/);

    await page.goto(`/c/${room.clientId}/tasks?task=${task.taskId}`);
    const reopened = page.getByRole('dialog', { name: title });
    await reopened.getByRole('tab', { name: /^Comentários e ficheiros/ }).click();
    await expect(reopened.getByText(comment)).toBeVisible();
    await expect(reopened.getByRole('link', { name: 'Exemplo' })).toBeVisible();
    await expect(reopened.getByRole('link', { name: fileName })).toBeVisible();

    await reopened.getByRole('button', { name: 'Apagar', exact: true }).click();
    await reopened.getByRole('button', { name: 'Apagar tarefa' }).click();
    await expect(page.getByText('Tarefa apagada.')).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/[?&]task=/);
  });
});
