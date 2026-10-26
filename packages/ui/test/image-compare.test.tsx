// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageCompare } from '../src/components/image-compare';

afterEach(cleanup);

function compare() {
  return render(
    <ImageCompare
      before={{ src: '/before.png', alt: 'Versão 1' }}
      after={{ src: '/after.png', alt: 'Versão 2' }}
      label="Comparar versões"
    />,
  );
}

describe('ImageCompare', () => {
  it('shows both images and starts in the middle', () => {
    compare();

    expect(screen.getByAltText('Versão 1').getAttribute('src')).toBe('/before.png');
    expect(screen.getByAltText('Versão 2').getAttribute('src')).toBe('/after.png');
    const slider = screen.getByRole('slider', { name: 'Comparar versões' });
    expect(slider.getAttribute('aria-valuenow')).toBe('50');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('arrow keys move the divider and update aria-valuenow', async () => {
    const user = userEvent.setup();
    compare();
    const slider = screen.getByRole('slider');

    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(slider.getAttribute('aria-valuenow')).toBe('55');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(slider.getAttribute('aria-valuenow')).toBe('45');
    await user.keyboard('{Home}');
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    await user.keyboard('{ArrowLeft}');
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    await user.keyboard('{End}');
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
    await user.keyboard('{ArrowRight}');
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
  });

  it('dragging moves the divider to the pointer position', () => {
    const { container } = compare();
    const surface = container.querySelector('[data-slot="image-compare"]') as HTMLElement;
    surface.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, height: 100, right: 300, bottom: 100 }) as DOMRect;
    surface.setPointerCapture = () => undefined;
    surface.releasePointerCapture = () => undefined;

    fireEvent.pointerDown(surface, { clientX: 250, pointerId: 1 });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('75');
    fireEvent.pointerMove(surface, { clientX: 120, pointerId: 1 });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('10');
    fireEvent.pointerUp(surface, { pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, pointerId: 1 });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('10');
  });
});
