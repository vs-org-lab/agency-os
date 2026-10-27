// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DynamicIsland } from '../src/components/dynamic-island';

afterEach(cleanup);

describe('DynamicIsland', () => {
  it('announces its state politely and shows the label and the timer', () => {
    render(<DynamicIsland status="recording" label="A gravar" timer="01:23" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('data-status')).toBe('recording');
    expect(region.textContent).toContain('A gravar');
    expect(region.textContent).toContain('01:23');
  });

  it('renders the actions next to the state', () => {
    render(
      <DynamicIsland
        status="paused"
        label="Em pausa"
        actions={<button type="button">Continuar</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('paused');
  });

  it('only a recording pulses', () => {
    const { rerender } = render(<DynamicIsland status="recording" label="A gravar" />);
    expect(document.querySelector('[data-slot="dynamic-island-dot"]')?.className).toContain(
      'motion-safe:animate-pulse',
    );
    rerender(<DynamicIsland status="idle" label="Pronto" />);
    expect(document.querySelector('[data-slot="dynamic-island-dot"]')?.className).not.toContain(
      'animate-pulse',
    );
  });
});
