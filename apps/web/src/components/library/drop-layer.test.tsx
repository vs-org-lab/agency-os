// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import { DropLayer } from './drop-layer';

afterEach(cleanup);

function setup(enabled = true) {
  const onFiles = vi.fn();
  render(
    <MotionProvider>
      <DropLayer enabled={enabled} onFiles={onFiles} label="Largue aqui">
        <p data-testid="area">content</p>
      </DropLayer>
    </MotionProvider>,
  );
  return { onFiles, area: screen.getByTestId('area').parentElement as HTMLElement };
}

const files = (list: File[] = []) => ({ dataTransfer: { types: ['Files'], files: list } });

describe('DropLayer', () => {
  it('stays visible while the pointer moves between child elements', async () => {
    const { area } = setup();
    fireEvent.dragEnter(area, files());
    fireEvent.dragEnter(area, files());
    fireEvent.dragLeave(area, files());
    expect(screen.getByText('Largue aqui')).toBeTruthy();
    fireEvent.dragLeave(area, files());
    await waitFor(() => expect(screen.queryByText('Largue aqui')).toBeNull());
  });

  it('hands the dropped files over', () => {
    const { area, onFiles } = setup();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.dragEnter(area, files([file]));
    fireEvent.drop(area, files([file]));
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('ignores drags when disabled and drags that carry no files', () => {
    const { area, onFiles } = setup(false);
    fireEvent.dragEnter(area, files());
    fireEvent.drop(area, files([new File(['x'], 'a.png')]));
    expect(screen.queryByText('Largue aqui')).toBeNull();
    expect(onFiles).not.toHaveBeenCalled();
    cleanup();
    const enabled = setup();
    fireEvent.dragEnter(enabled.area, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(screen.queryByText('Largue aqui')).toBeNull();
  });
});
