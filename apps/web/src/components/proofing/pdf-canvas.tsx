'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { pointerPercent } from './anchor-format';
import { Pins, type Pin } from './pins';

type PdfDocument = {
  numPages: number;
  getPage(page: number): Promise<{
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }): { promise: Promise<void> };
  }>;
};

/** A PDF proof drawn page by page with pdf.js; clicking a page picks a point on that page. */
export function PdfCanvas({
  src,
  pages,
  page,
  onPageChange,
  pins,
  pending,
  activeId,
  canPin,
  onPick,
  onSelect,
}: {
  src: string;
  pages: number;
  page: number;
  onPageChange: (page: number) => void;
  pins: Pin[];
  pending: { x: number; y: number } | null;
  activeId: string | null;
  canPin: boolean;
  onPick: (point: { x: number; y: number }) => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('proofing.viewer');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const loaded = (await pdfjs.getDocument({ url: src }).promise) as unknown as PdfDocument;
      if (!cancelled) setDocument(loaded);
    })().catch(() => {
      if (!cancelled) setState('failed');
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    (async () => {
      const pdfPage = await document.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      const element = canvas.current;
      const context = element?.getContext('2d');
      if (!element || !context || cancelled) return;
      element.width = viewport.width;
      element.height = viewport.height;
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      if (!cancelled) setState('ready');
    })().catch(() => {
      if (!cancelled) setState('failed');
    });
    return () => {
      cancelled = true;
    };
  }, [document, page]);

  return (
    <div className="flex flex-col gap-3">
      {state === 'failed' ? (
        <p className="text-body-sm text-danger">{t('failed')}</p>
      ) : (
        <div
          className="relative mx-auto w-fit max-w-full cursor-crosshair select-none"
          onClick={(event) => {
            if (!canPin || state !== 'ready') return;
            const point = pointerPercent(event, event.currentTarget.getBoundingClientRect());
            if (point) onPick(point);
          }}
        >
          <canvas
            ref={canvas}
            className="block max-h-[70vh] max-w-full"
            aria-label={t('page', { page, pages })}
          />
          {state === 'loading' ? (
            <p className="absolute inset-0 flex items-center justify-center text-body-sm text-text-secondary">
              {t('loading')}
            </p>
          ) : (
            <Pins pins={pins} pending={pending} activeId={activeId} onSelect={onSelect} />
          )}
        </div>
      )}
      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('previousPage')}
        </Button>
        <span className="text-caption text-text-secondary tabular-nums">
          {t('page', { page, pages })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('nextPage')}
        </Button>
      </div>
    </div>
  );
}
