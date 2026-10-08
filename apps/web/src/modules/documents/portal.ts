import { and, desc, eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { FIGMA_EMBED_HOST, toFigmaEmbedUrl } from './figma';

const { documents } = schema;

export type PortalDocument = { id: string; title: string; embedUrl: string; sharedAt: Date };

function toPortalDocument(row: {
  id: string;
  title: string;
  url: string;
  sharedAt: Date | null;
}): PortalDocument | null {
  const embedUrl = toFigmaEmbedUrl(row.url, FIGMA_EMBED_HOST);
  return embedUrl && row.sharedAt
    ? { id: row.id, title: row.title, embedUrl, sharedAt: row.sharedAt }
    : null;
}

/** Runs in the client user's context: row level security returns only shared documents. */
export async function listPortalDocuments(
  tx: DbTransaction,
  clientId: string,
): Promise<PortalDocument[]> {
  const rows = await tx
    .select({
      id: documents.id,
      title: documents.title,
      url: documents.url,
      sharedAt: documents.sharedAt,
    })
    .from(documents)
    .where(and(eq(documents.clientId, clientId), eq(documents.status, 'with_client')))
    .orderBy(desc(documents.sharedAt));
  return rows.flatMap((row) => toPortalDocument(row) ?? []);
}

export async function getPortalDocument(
  tx: DbTransaction,
  documentId: string,
): Promise<PortalDocument | null> {
  const [row] = await tx
    .select({
      id: documents.id,
      title: documents.title,
      url: documents.url,
      sharedAt: documents.sharedAt,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.status, 'with_client')));
  return row ? toPortalDocument(row) : null;
}
