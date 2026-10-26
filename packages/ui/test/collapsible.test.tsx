// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../src/components/collapsible';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

beforeAll(() => {
  installMatchMedia(false);
});

afterEach(cleanup);

function Example({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <MotionProvider>
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Hidden body</CollapsibleContent>
      </Collapsible>
    </MotionProvider>
  );
}

describe('Collapsible', () => {
  it('is closed by default and opens on click', async () => {
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Details' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Hidden body')).toBeNull();
    await userEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Hidden body')).toBeTruthy();
  });

  it('opens with Enter and Space', async () => {
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Details' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('respects defaultOpen', () => {
    render(<Example defaultOpen />);
    expect(screen.getByRole('button', { name: 'Details' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByText('Hidden body')).toBeTruthy();
  });
});
