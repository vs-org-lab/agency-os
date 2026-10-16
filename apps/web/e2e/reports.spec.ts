import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

test.describe('Team reports', () => {
  test('the founder reads the reports and downloads the revenue csv', async ({ page }) => {
    test.setTimeout(180_000);
    const year = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' })
        .format(new Date())
        .slice(0, 4),
    );

    await signInWithPassword(page, credentials.founder);
    await page.getByRole('link', { name: 'Relatórios' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('region', { name: 'Receita por mês' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Negócios por código' })).toBeVisible();

    const download = page.waitForEvent('download');
    await page
      .getByRole('region', { name: 'Receita por mês' })
      .getByRole('link', { name: 'Descarregar CSV' })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`revenue-${year}.csv`);
    const body = await readFile((await file.path()) ?? '', 'utf8');
    expect(body.startsWith('﻿Moeda,Jan,Fev,Mar,Abr,Mai,Jun,Jul,Ago,Set,Out,Nov,Dez,Total')).toBe(
      true,
    );

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
