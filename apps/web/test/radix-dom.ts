import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import type { UserEvent } from '@testing-library/user-event';

/** jsdom lacks the pointer and scroll APIs Radix Select and Popover call. */
export function installRadixDomPolyfills(): void {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/** Opens a Radix Select by its accessible name and picks an option by its text. */
export async function chooseOption(user: UserEvent, select: string | RegExp, option: string) {
  const trigger = screen.getByRole('combobox', { name: select });
  await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
}

/** Opens a DatePicker by its accessible name and picks a day of the month it shows. */
export async function chooseDay(user: UserEvent, picker: string | RegExp, day: number) {
  await user.click(screen.getByRole('button', { name: picker }));
  // A picker opened inside a side panel or dialog leaves more than one dialog on screen.
  const dialog = await waitFor(() => {
    const found = screen
      .getAllByRole('dialog')
      .find((node) => node.querySelector('[role="gridcell"]'));
    if (!found) throw new Error('calendar not shown');
    return found;
  });
  const cells = dialog.querySelectorAll<HTMLElement>('[role="gridcell"]:not([data-outside])');
  const cell = Array.from(cells).find((node) => node.textContent?.trim() === String(day));
  if (!cell) throw new Error(`day ${day} not shown`);
  await user.click(cell.querySelector('button') ?? cell);
}
