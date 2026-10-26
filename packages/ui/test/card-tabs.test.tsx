// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CardTabs } from '../src/components/card-tabs';
import { MotionProvider } from '../src/motion';

afterEach(cleanup);

function Harness() {
  const [value, setValue] = React.useState('board');
  return (
    <MotionProvider>
      <CardTabs
        title="O seu trabalho"
        tabs={[
          { value: 'board', label: 'Quadro' },
          { value: 'list', label: 'Lista' },
        ]}
        value={value}
        onValueChange={setValue}
      >
        <p>{`Vista ${value}`}</p>
      </CardTabs>
    </MotionProvider>
  );
}

describe('CardTabs', () => {
  it('switches panel and marks the active tab', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    expect(screen.getByRole('heading', { name: 'O seu trabalho' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Quadro' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Vista board')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Lista' }));

    expect(screen.getByRole('tab', { name: 'Lista' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Quadro' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText('Vista list')).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(1);
  });

  it('arrow keys move between tabs', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    screen.getByRole('tab', { name: 'Quadro' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Lista' }));
    expect(screen.getByText('Vista list')).toBeTruthy();
  });
});
