import { expect, type Locator, type Page } from '@playwright/test';

/** Opens a Radix select (a `combobox` trigger) and picks the option with exactly that name. */
export async function chooseOption(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const PREVIOUS_MONTH = 'Ir para o mês anterior';
const NEXT_MONTH = 'Ir para o próximo mês';

/** Opens a DatePicker button, walks the calendar to the month of `isoDate` and clicks that day. */
export async function pickDate(page: Page, trigger: Locator, isoDate: string): Promise<void> {
  await trigger.click();
  const calendar = page.locator('[data-slot="popover-content"]');
  await expect(calendar).toBeVisible();
  const days = calendar.locator('[role="gridcell"][data-day]');
  const target = calendar.locator(`[role="gridcell"][data-day="${isoDate}"] button`);

  for (let step = 0; step < 36 && (await target.count()) === 0; step += 1) {
    const first = await days.first().getAttribute('data-day');
    const direction = first !== null && isoDate < first ? PREVIOUS_MONTH : NEXT_MONTH;
    await calendar.getByRole('button', { name: direction }).click();
  }
  await target.click();
  await expect(calendar).toBeHidden();
}

/** Skips the portal's first-visit welcome when it is on screen, so it never blocks the page. */
export async function dismissPortalWelcome(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Saltar' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }
  await skip.click();
  await expect(skip).toBeHidden();
}
