import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { SignatureForm } from '@/components/contracts/signature-form';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalContract } from '@/modules/contracts/server';
import { signPortalContractAction } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; contractId: string }> };

export default async function PortalContractPage({ params }: PageProps) {
  const { locale: requested, contractId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  if (!z.uuid().safeParse(contractId).success) notFound();
  const session = await requireArea('/portal', locale);
  const contract = await loadPortalContract(session.claims, contractId);
  if (!contract) notFound();
  const t = await getTranslations('portal.contract');

  const signed = contract.status === 'signed';
  const canSign =
    contract.status === 'awaiting_signatures' &&
    contract.clientSignedAt === null &&
    contract.expectedSigner !== null;
  const status = signed
    ? t('signedTitle')
    : contract.clientSignedAt
      ? t('waitingStudio')
      : contract.studioSignedAt
        ? t('waitingClient')
        : null;

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('intro')}</p>
        {status ? <p className="text-body-sm text-text">{status}</p> : null}
        {signed ? (
          <a
            href={`/api/contracts/${contract.id}/pdf`}
            className="text-body-sm text-link hover:underline"
          >
            {t('download')}
          </a>
        ) : null}
      </header>

      <article
        aria-label={t('title')}
        tabIndex={0}
        className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-surface p-5 text-body-sm whitespace-pre-wrap text-text"
      >
        {contract.body}
      </article>

      {canSign && contract.expectedSigner ? (
        <SignatureForm
          contractId={contract.id}
          bodyHash={contract.bodyHash}
          expectedName={contract.expectedSigner}
          submitLabel={t('sign')}
          sign={signPortalContractAction}
        />
      ) : null}
      {!signed && contract.expectedSigner === null ? (
        <p className="text-body-sm text-text-secondary">{t('notSigner')}</p>
      ) : null}
    </div>
  );
}
