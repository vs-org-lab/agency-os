import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type InvoiceIssuer } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import { REAUTHENTICATION_REQUIRED, recentlyVerified, writesBillingRow } from './authorize';
import { lisbonDate } from './domain/plan';
import type { BillingDeps } from './requests';
import { isPdf, legalInvoiceFolder } from './storage';

const { legalInvoices, paymentRequests } = schema;

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

export type RegisterLegalInvoiceInput = {
  requestId: string;
  issuer: InvoiceIssuer;
  number: string;
  issuedOn: string;
  /** The path returned with the upload link the PDF was sent to. */
  uploadPath: string;
};

const invoiceSchema = z.object({
  requestId: z.uuid(),
  issuer: z.enum(['at_certified', 'agt_portal']),
  number: z
    .string()
    .max(60)
    .transform((value) => value.replace(/\p{Cc}+/gu, ' ').trim())
    .pipe(z.string().min(1)),
  issuedOn: z.iso.date(),
  uploadPath: z.string().max(300),
});

async function paidRequest(deps: BillingDeps, requestId: string) {
  const [request] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        organizationId: paymentRequests.organizationId,
        clientId: paymentRequests.clientId,
        status: paymentRequests.status,
        invoiceId: legalInvoices.id,
      })
      .from(paymentRequests)
      .leftJoin(legalInvoices, eq(legalInvoices.requestId, paymentRequests.id))
      .where(eq(paymentRequests.id, requestId)),
  );
  return request?.status === 'paid' && request.invoiceId === null ? request : null;
}

/**
 * A signed upload link for the legal invoice PDF of a paid request. Every link writes to a path
 * of its own and never overwrites, so a link obtained earlier cannot replace a registered PDF.
 */
export async function legalInvoiceUploadUrl(
  claims: VerifiedClaims,
  input: { requestId: string },
  deps: BillingDeps,
): Promise<
  | { ok: true; uploadUrl: string; uploadPath: string }
  | NotFound
  | { ok: false; rule: 'invalid_state' }
> {
  const allowed = await writesBillingRow(deps.contexts, claims, {
    kind: 'request',
    id: input.requestId,
  });
  if (!allowed) return NOT_FOUND;
  const request = await paidRequest(deps, input.requestId);
  if (!request) return { ok: false, rule: 'invalid_state' };
  const folder = legalInvoiceFolder(request.organizationId, request.clientId, input.requestId);
  const uploadPath = `${folder}${randomUUID()}.pdf`;
  return { ok: true, uploadUrl: await deps.storage.createUploadUrl(uploadPath), uploadPath };
}

/**
 * Registers the invoice issued by certified software (AT) or the AGT portal for a paid request.
 * The OS never numbers legal invoices (RN-30); it keeps the number, date and uploaded PDF.
 */
export async function registerLegalInvoice(
  claims: VerifiedClaims,
  input: RegisterLegalInvoiceInput,
  deps: BillingDeps,
): Promise<
  | { ok: true }
  | NotFound
  | {
      ok: false;
      rule: 'invalid_input' | 'invalid_state' | 'missing_file' | 'reauthentication_required';
    }
> {
  const allowed = await writesBillingRow(deps.contexts, claims, {
    kind: 'request',
    id: input.requestId,
  });
  if (!allowed) return NOT_FOUND;
  if (!recentlyVerified(claims)) return REAUTHENTICATION_REQUIRED;
  const now = (deps.now ?? (() => new Date()))();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success || parsed.data.issuedOn > lisbonDate(now)) {
    return { ok: false, rule: 'invalid_input' };
  }
  const data = parsed.data;
  const request = await paidRequest(deps, data.requestId);
  if (!request) return { ok: false, rule: 'invalid_state' };
  const folder = legalInvoiceFolder(request.organizationId, request.clientId, data.requestId);
  const fileName = data.uploadPath.slice(folder.length);
  if (!data.uploadPath.startsWith(folder) || !/^[0-9a-f-]{36}\.pdf$/.test(fileName)) {
    return { ok: false, rule: 'invalid_input' };
  }
  const file = await deps.storage.download(data.uploadPath);
  if (!file || !isPdf(file)) return { ok: false, rule: 'missing_file' };

  return deps.contexts.withSystemContext(async (tx) => {
    const [current] = await tx
      .select({ status: paymentRequests.status })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, data.requestId))
      .for('update');
    const [existing] = await tx
      .select({ id: legalInvoices.id })
      .from(legalInvoices)
      .where(eq(legalInvoices.requestId, data.requestId));
    if (current?.status !== 'paid' || existing) {
      return { ok: false as const, rule: 'invalid_state' as const };
    }
    const [invoice] = await tx
      .insert(legalInvoices)
      .values({
        organizationId: request.organizationId,
        clientId: request.clientId,
        requestId: data.requestId,
        issuer: data.issuer,
        number: data.number,
        issuedOn: data.issuedOn,
        pdfPath: data.uploadPath,
        recordedBy: claims.sub,
      })
      .returning({ id: legalInvoices.id });
    if (!invoice) throw new Error('Legal invoice was not registered');
    await recordAudit(tx, {
      organizationId: request.organizationId,
      action: 'legal_invoice.registered',
      resourceType: 'legal_invoice',
      resourceId: invoice.id,
      clientId: request.clientId,
      metadata: { requestId: data.requestId, issuer: data.issuer, number: data.number },
    });
    return { ok: true as const };
  });
}
