// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SidePanel } from '../src/components/side-panel';

afterEach(cleanup);

function Example() {
  const [open, setOpen] = useState(true);
  return (
    <SidePanel
      open={open}
      onOpenChange={setOpen}
      title="Task details"
      closeLabel="Close"
      actions={<button type="button">Archive</button>}
    >
      <p>Panel body</p>
    </SidePanel>
  );
}

describe('SidePanel', () => {
  it('renders title and actions', () => {
    render(<Example />);
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy();
    expect(screen.getByText('Panel body')).toBeTruthy();
  });

  it('closes with Escape', async () => {
    render(<Example />);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
