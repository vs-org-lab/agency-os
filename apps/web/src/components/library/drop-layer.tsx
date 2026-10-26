'use client';

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import { FormMessage } from '@/components/forms/form-message';
import { AnimatePresence, m, useReducedMotion } from '@agency-os/ui/motion';

/** A dropped folder arrives as an empty entry in `files`; the item entries tell it apart. */
function isFolder(event: DragEvent, index: number, file: File): boolean {
  const entry = event.dataTransfer.items?.[index]?.webkitGetAsEntry?.();
  return entry ? entry.isDirectory : file.size === 0 && file.type === '' && !file.name.includes('.');
}

const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

/**
 * Wraps an area so files can be dropped anywhere on it. A depth counter keeps the overlay steady
 * while the pointer crosses child elements; dropped files are handed over as a plain array.
 */
export function DropLayer({
  enabled,
  onFiles,
  label,
  folderNotice,
  children,
}: {
  enabled: boolean;
  onFiles: (files: File[]) => void;
  label: string;
  /** Shown when a dropped item is a folder, which cannot be uploaded. */
  folderNotice: string;
  children: ReactNode;
}) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const [skippedFolder, setSkippedFolder] = useState(false);
  const reduceMotion = useReducedMotion();

  const accepts = (event: DragEvent) => enabled && carriesFiles(event);

  const reset = () => {
    depth.current = 0;
    setActive(false);
  };

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(event) => {
        if (accepts(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!accepts(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        reset();
        const dropped = Array.from(event.dataTransfer.files);
        const files = dropped.filter((file, index) => !isFolder(event, index, file));
        setSkippedFolder(files.length < dropped.length);
        if (files.length > 0) onFiles(files);
      }}
    >
      {skippedFolder ? <FormMessage tone="warning">{folderNotice}</FormMessage> : null}
      {children}
      <AnimatePresence>
        {active ? (
          <m.div
            key="drop-overlay"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-surface/85 text-label text-text"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <UploadCloud className="size-5" />
            {label}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
