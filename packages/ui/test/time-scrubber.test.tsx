// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeScrubber } from '../src/components/time-scrubber';

afterEach(cleanup);

function renderScrubber(overrides: Partial<Parameters<typeof TimeScrubber>[0]> = {}) {
  const onValueChange = vi.fn();
  render(
    <TimeScrubber
      label="Posição"
      value={30}
      duration={120}
      onValueChange={onValueChange}
      {...overrides}
    />,
  );
  return { onValueChange, slider: screen.getByRole('slider', { name: 'Posição' }) };
}

describe('TimeScrubber', () => {
  it('exposes the position as a slider', () => {
    const { slider } = renderScrubber();
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('120');
    expect(slider.getAttribute('aria-valuenow')).toBe('30');
    expect(slider.getAttribute('aria-valuetext')).toBe('00:30 / 02:00');
  });

  it('moves five seconds with the arrow keys and stays inside the range', () => {
    const { slider, onValueChange } = renderScrubber();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith(35);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onValueChange).toHaveBeenLastCalledWith(25);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onValueChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onValueChange).toHaveBeenLastCalledWith(120);
  });

  it('does not go past the ends', () => {
    const { slider, onValueChange } = renderScrubber({ value: 2 });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onValueChange).toHaveBeenLastCalledWith(0);
    cleanup();
    const end = renderScrubber({ value: 118 });
    fireEvent.keyDown(end.slider, { key: 'ArrowRight' });
    expect(end.onValueChange).toHaveBeenLastCalledWith(120);
  });

  it('seeks to the clicked position', () => {
    const { slider, onValueChange } = renderScrubber();
    slider.getBoundingClientRect = () =>
      ({
        left: 100,
        width: 200,
        top: 0,
        right: 300,
        bottom: 10,
        height: 10,
        x: 100,
        y: 0,
      }) as DOMRect;
    fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 });
    expect(onValueChange).toHaveBeenLastCalledWith(60);
  });

  it('renders chapter markers that jump to their time', () => {
    const { onValueChange } = renderScrubber({
      markers: [
        { time: 0, label: 'Pergunta 1' },
        { time: 42, label: 'Pergunta 2' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pergunta 2' }));
    expect(onValueChange).toHaveBeenLastCalledWith(42);
  });
});
