import { downloadZip } from 'client-zip';
import type { ZipManifest } from '@/modules/library';

async function* zipEntries(entries: ZipManifest['entries']) {
  for (const entry of entries) {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`Archive file could not be fetched: ${response.status}`);
    yield { name: entry.path, input: response };
  }
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Builds the archive in the browser, fetching one file at a time, and saves it. */
export async function saveZip(manifest: Extract<ZipManifest, { ok: true }>): Promise<void> {
  saveBlob(await downloadZip(zipEntries(manifest.entries)).blob(), manifest.archiveName);
}
