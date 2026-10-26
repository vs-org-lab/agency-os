import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';
import { seedReceivedPayment } from './support/tasks';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

/** Calendar days from today in Lisbon, so a daylight-saving change never shifts the day. */
function lisbonDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
}

test.describe('Tasks, home and updates', () => {
  test('a late task shows on the home until it is done and the feed shows a payment', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const title = `Rever entregas ${randomUUID().slice(0, 6)}`;
    const room = await seedRoomProject(credentials.organizationId);
    const payment = await seedReceivedPayment(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('link', { name: 'Nova tarefa' }).click();
    const form = page.getByRole('form', { name: 'Nova tarefa' });
    await form.getByLabel('Título').fill(title);
    await form.getByLabel('Cliente').selectOption({ label: room.company });
    await form.getByLabel('Data').fill(lisbonDate(-1));
    await form.getByLabel('Subtarefas').fill('Exportar ficheiros');
    await form.getByRole('button', { name: 'Criar tarefa' }).click();
    await expect(page.getByText('Tarefa criada.')).toBeVisible({ timeout: 30_000 });
    await page.goto('/tasks');
    const today = page.getByRole('region', { name: 'Hoje' });
    await expect(today.getByText(title)).toBeVisible();
    await expectAccessible(page);

    await page.goto('/');
    const homeItem = page.getByRole('link', { name: new RegExp(`Tarefa: ${title}`) });
    await expect(homeItem).toBeVisible();
    await expect(homeItem.getByText('Atrasado')).toBeVisible();

    await page.goto(`/c/${room.clientId}/tasks`);
    await expect(page.getByText(title)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('checkbox', { name: 'Exportar ficheiros' }).click();
    await expect(page.getByRole('checkbox', { name: 'Exportar ficheiros' })).toBeChecked({
      timeout: 30_000,
    });
    await page.getByRole('checkbox', { name: title }).click();
    await expect(page.getByText(title)).toHaveCount(0, { timeout: 30_000 });

    await page.goto('/tasks');
    await page.getByLabel('Estado').selectOption('done');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/\/tasks\?.*status=done/);
    await expect(page.getByRole('region', { name: 'Concluídas' }).getByText(title)).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('link', { name: new RegExp(`Tarefa: ${title}`) })).toHaveCount(0);

    await page.goto('/updates');
    await expect(page.getByRole('heading', { name: 'Atualizações', level: 1 })).toBeVisible();
    const entry = page
      .getByRole('main')
      .last()
      .getByRole('link', { name: new RegExp(`Pagamento recebido ${payment.company}`) });
    await expect(entry).toBeVisible();
    await expect(entry.getByText('Pagamento recebido')).toBeVisible();
    await expect(entry).toHaveAttribute('href', new RegExp(`/pipeline/${payment.dealId}$`));
    await expectAccessible(page);
  });
});
