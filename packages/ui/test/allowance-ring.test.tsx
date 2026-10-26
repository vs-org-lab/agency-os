// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AllowanceRing } from '../src/components/allowance-ring';
import { accessibleNumberText } from './number-flow';
import { installMatchMedia } from './match-media';

afterEach(cleanup);

function renderRing(used: number, limit: number) {
  installMatchMedia(false);
  return render(
    <AllowanceRing
      used={used}
      limit={limit}
      locale="pt-PT"
      label="Reuniões"
      remainingLabel={(n) => `${n} restantes`}
      usedLabel={(u, l) => `${u} de ${l} usados`}
    />,
  );
}

describe('AllowanceRing', () => {
  it('shows remaining and used', () => {
    renderRing(4, 10);
    expect(screen.getByText('6 restantes')).toBeTruthy();
    expect(screen.getByText('4 de 10 usados')).toBeTruthy();
  });

  it('uses accent below 80%', () => {
    const { container } = renderRing(7, 10);
    expect(container.querySelector('[data-slot="allowance-ring"]')?.getAttribute('data-tone')).toBe(
      'accent',
    );
  });

  it('stays neutral however far along it is when asked to', () => {
    installMatchMedia(false);
    const { container } = render(
      <AllowanceRing
        neutral
        used={29}
        limit={30}
        locale="pt-PT"
        label="Período"
        remainingLabel={() => 'x'}
        usedLabel={() => 'y'}
      />,
    );
    expect(container.querySelector('[data-slot="allowance-ring"]')?.getAttribute('data-tone')).toBe(
      'neutral',
    );
  });

  it('uses warning at 80%', () => {
    const { container } = renderRing(8, 10);
    expect(container.querySelector('[data-slot="allowance-ring"]')?.getAttribute('data-tone')).toBe(
      'warning',
    );
  });

  it('uses danger above 100% and never shows negative remaining', () => {
    const { container } = renderRing(12, 10);
    expect(container.querySelector('[data-slot="allowance-ring"]')?.getAttribute('data-tone')).toBe(
      'danger',
    );
    expect(screen.getByText('0 restantes')).toBeTruthy();
    expect(screen.getByText('12 de 10 usados')).toBeTruthy();
    expect(accessibleNumberText(container)).toBe('0');
  });
});
