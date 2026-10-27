// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ScoreSlider } from '../src/components/score-slider';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

beforeAll(() => installMatchMedia(false));
afterEach(cleanup);

function renderSlider(props: Partial<React.ComponentProps<typeof ScoreSlider>> = {}) {
  return render(
    <MotionProvider>
      <form data-testid="form">
        <ScoreSlider
          name="points-a"
          label="Pontos (0 a 5)"
          max={5}
          clearLabel="Limpar"
          valueText={(value, max) => (value === null ? 'Sem pontuação' : `${value} de ${max}`)}
          {...props}
        />
      </form>
    </MotionProvider>,
  );
}

const hidden = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[name="points-a"]');

describe('ScoreSlider', () => {
  it('exposes slider semantics and a hidden input', () => {
    const { container } = renderSlider({ defaultValue: 3 });
    const slider = screen.getByRole('slider', { name: 'Pontos (0 a 5)' });
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('5');
    expect(slider.getAttribute('aria-valuenow')).toBe('3');
    expect(slider.getAttribute('aria-valuetext')).toBe('3 de 5');
    expect(hidden(container)?.value).toBe('3');
    expect(hidden(container)?.type).toBe('hidden');
  });

  it('has no value until one is chosen', () => {
    const { container } = renderSlider();
    const slider = screen.getByRole('slider');
    expect(slider.hasAttribute('aria-valuenow')).toBe(false);
    expect(slider.getAttribute('aria-valuetext')).toBe('Sem pontuação');
    expect(hidden(container)?.value).toBe('');
  });

  it('moves with the keyboard and clamps to the range', async () => {
    const user = userEvent.setup();
    const { container } = renderSlider();
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowUp}');
    expect(hidden(container)?.value).toBe('3');
    await user.keyboard('{ArrowLeft}');
    expect(hidden(container)?.value).toBe('2');
    await user.keyboard('{End}');
    expect(hidden(container)?.value).toBe('5');
    await user.keyboard('{ArrowRight}');
    expect(hidden(container)?.value).toBe('5');
    await user.keyboard('{Home}');
    expect(hidden(container)?.value).toBe('0');
    await user.keyboard('{PageUp}');
    expect(hidden(container)?.value).toBe('2');
    await user.keyboard('{PageDown}');
    expect(hidden(container)?.value).toBe('0');
  });

  it('clears back to no score', async () => {
    const user = userEvent.setup();
    const { container } = renderSlider({ defaultValue: 4 });
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(hidden(container)?.value).toBe('');
    expect(screen.getByRole('slider').hasAttribute('aria-valuenow')).toBe(false);
  });

  it('ignores input when disabled', async () => {
    const user = userEvent.setup();
    const { container } = renderSlider({ defaultValue: 2, disabled: true });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-disabled')).toBe('true');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(hidden(container)?.value).toBe('2');
    expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull();
  });
});
