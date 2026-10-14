import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { database } from './support/admin';
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

/** Tomorrow in Lisbon, as `YYYY-MM-DD`, and how the calendar names it ("15 de outubro"). */
function tomorrow(): { day: string; label: string } {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const label = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${day}T12:00:00Z`));
  return { day, label };
}

test.describe('Agenda', () => {
  test('the founder schedules a kickoff that shows everywhere and closes its task', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const seeded = await seedRoomProject(credentials.organizationId);
    const sql = database();
    const [project] = await sql<{ id: string }[]>`
      select id from public.projects where client_id = ${seeded.clientId}
    `;
    if (!project) throw new Error('Seeded project is missing');
    await sql`
      insert into public.tasks (organization_id, client_id, project_id, title, source)
      values (${credentials.organizationId}, ${seeded.clientId}, ${project.id}, 'Agendar kickoff',
              'kickoff')
    `;
    // Kickoffs left by earlier runs would crowd the day and the home's next five events.
    await sql`
      update public.agenda_events set status = 'cancelled'
      where organization_id = ${credentials.organizationId} and title like 'Kickoff %'
    `;
    const { day, label } = tomorrow();
    const title = `Kickoff ${randomUUID().slice(0, 6)}`;

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/agenda?view=month&date=${day}`);
    await page.getByRole('button', { name: `Nova reunião a ${label}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Nova reunião' });
    await dialog.getByLabel('Tipo').selectOption({ label: 'Kickoff' });
    await dialog.getByLabel('Projeto').selectOption({ label: 'Website' });
    await dialog.getByLabel('Título').fill(title);
    await dialog.getByLabel('Convidar o decisor').check();
    await expect(dialog.getByLabel('Data')).toHaveValue(day);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Reunião marcada.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);

    await page.goto(`/calendar?view=week&date=${day}`);
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
    await expectAccessible(page);

    await page.goto('/');
    await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

    const [task] = await sql<{ status: string }[]>`
      select status::text from public.tasks
      where project_id = ${project.id} and source = 'kickoff'
    `;
    expect(task?.status).toBe('done');
  });
});
