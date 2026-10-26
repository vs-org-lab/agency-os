// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@agency-os/ui/components/collapsible';
import { MotionProvider } from '@agency-os/ui/motion';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

function renderCollapsible() {
  return render(
    <MotionProvider>
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Secção</CollapsibleTrigger>
        <CollapsibleContent>
          <input aria-label="Campo" />
        </CollapsibleContent>
      </Collapsible>
    </MotionProvider>,
  );
}

describe('Collapsible', () => {
  it('keeps unsaved input when collapsed and reopened', async () => {
    renderCollapsible();
    await userEvent.type(screen.getByLabelText('Campo'), 'rascunho');
    await userEvent.click(screen.getByRole('button', { name: 'Secção' }));
    await userEvent.click(screen.getByRole('button', { name: 'Secção' }));
    expect((screen.getByLabelText('Campo') as HTMLInputElement).value).toBe('rascunho');
  });

  it('hides closed content from assistive technology and the tab order', async () => {
    renderCollapsible();
    await userEvent.click(screen.getByRole('button', { name: 'Secção' }));
    expect(screen.queryByRole('textbox', { name: 'Campo' })).toBeNull();
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.closest('[hidden]')).not.toBeNull();
  });
});
