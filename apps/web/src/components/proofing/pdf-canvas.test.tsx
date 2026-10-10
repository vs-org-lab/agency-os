// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { PdfCanvas } from './pdf-canvas';

const pdf = vi.hoisted(() => {
  let busy = false;
  const finishers: Array<() => void> = [];
  const cancel = vi.fn();
  const destroy = vi.fn();
  const renderPage = vi.fn(() => {
    if (busy) throw new Error('Cannot use the same canvas during multiple render() operations.');
    busy = true;
    let reject: (error: Error) => void = () => {};
    const promise = new Promise<void>((resolve, fail) => {
      reject = fail;
      finishers.push(() => {
        busy = false;
        resolve();
      });
    });
    return {
      promise,
      cancel: () => {
        cancel();
        busy = false;
        reject(Object.assign(new Error('Rendering cancelled'), { name: 'RenderingCancelledException' }));
      },
    };
  });
  const document = {
    numPages: 3,
    getPage: async () => ({ getViewport: () => ({ width: 100, height: 140 }), render: renderPage }),
    destroy,
  };
  return { renderPage, cancel, destroy, finishers, document };
});

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({ promise: Promise.resolve(pdf.document) }),
}));

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
});

afterEach(() => {
  cleanup();
});

function canvasAt(page: number) {
  return (
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <PdfCanvas
        src="/api/proofs/v/file"
        pages={3}
        page={page}
        onPageChange={() => {}}
        pins={[]}
        pending={null}
        activeId={null}
        canPin
        onPick={() => {}}
        onSelect={() => {}}
      />
    </NextIntlClientProvider>
  );
}

describe('pdf canvas', () => {
  it('turning pages quickly cancels the render in progress instead of failing', async () => {
    const view = render(canvasAt(1));
    await waitFor(() => expect(pdf.renderPage).toHaveBeenCalledTimes(1));

    view.rerender(canvasAt(2));
    await waitFor(() => expect(pdf.renderPage).toHaveBeenCalledTimes(2));
    pdf.finishers.at(-1)?.();

    await waitFor(() => expect(screen.queryByText(messages.proofing.viewer.loading)).toBeNull());
    expect(screen.queryByText(messages.proofing.viewer.failed)).toBeNull();
    expect(pdf.cancel).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(pdf.destroy).toHaveBeenCalled();
  });
});
