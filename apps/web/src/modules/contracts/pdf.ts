import { BODY_SIZE, createPdf, numberPages } from '@/platform/pdf';

export type ContractPdfSignature = {
  party: string;
  name: string;
  role: string;
  email: string;
  signedAt: string;
  ipAddress: string | null;
};

export type ContractPdfInput = {
  title: string;
  body: string;
  hash: string;
  signatures: ContractPdfSignature[];
  labels: {
    signatures: string;
    fingerprint: string;
    signedBy: string;
    role: string;
    email: string;
    signedAt: string;
    ipAddress: string;
    page: string;
  };
};

/** Renders the signed contract text followed by a signature page that serves as evidence. */
export async function buildContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const { document, fonts, writer } = await createPdf({ title: input.title, subject: input.hash });

  for (const rawLine of input.body.split('\n')) {
    const line = rawLine.trimEnd();
    if (line === '') {
      writer.space(BODY_SIZE / 2);
    } else if (line.startsWith('### ')) {
      writer.space(4);
      writer.paragraph(line.slice(4), { size: 11, bold: true });
    } else if (line.startsWith('## ')) {
      writer.space(6);
      writer.paragraph(line.slice(3), { size: 14, font: fonts.serif });
    } else if (line.startsWith('# ')) {
      writer.title(line.slice(2));
      writer.rule();
    } else if (line.startsWith('- ')) {
      writer.paragraph(`- ${line.slice(2)}`, { indent: 12 });
    } else {
      writer.paragraph(line);
    }
  }

  writer.newPage();
  writer.title(input.labels.signatures);
  writer.rule();
  writer.eyebrow(input.labels.fingerprint);
  writer.paragraph(input.hash, { muted: true });
  writer.space(12);
  for (const signature of input.signatures) {
    writer.paragraph(signature.party, { size: 12, bold: true });
    writer.paragraph(`${input.labels.signedBy}: ${signature.name}`);
    writer.paragraph(`${input.labels.role}: ${signature.role}`);
    writer.paragraph(`${input.labels.email}: ${signature.email}`);
    writer.paragraph(`${input.labels.signedAt}: ${signature.signedAt}`);
    if (signature.ipAddress) writer.paragraph(`${input.labels.ipAddress}: ${signature.ipAddress}`);
    writer.space(12);
  }

  numberPages(document, fonts, input.labels.page);
  return document.save();
}
