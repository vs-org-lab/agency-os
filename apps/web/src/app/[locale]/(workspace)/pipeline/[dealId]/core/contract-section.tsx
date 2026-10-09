'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { SignatureForm, type SignActionResult } from '@/components/contracts/signature-form';
import { FormMessage } from '@/components/forms/form-message';
import type { ContractView } from '@/modules/contracts/server';

export type ContractSectionActions = {
  sign(contractId: string, typedName: string, bodyHash: string): Promise<SignActionResult>;
  void(contractId: string, dealId: string, reason: string): Promise<SignActionResult>;
};

const VOID_ERRORS = ['invalid_input', 'invalid_state', 'not_found'] as const;

type VoidError = (typeof VOID_ERRORS)[number];

function voidError(code: string): VoidError {
  return (VOID_ERRORS as readonly string[]).includes(code) ? (code as VoidError) : 'not_found';
}

export function ContractSection({
  contract,
  dealId,
  founder,
  actions,
}: {
  contract: ContractView;
  dealId: string;
  founder: boolean;
  actions: ContractSectionActions;
}) {
  const t = useTranslations('contracts.contract');
  const format = useFormatter();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<VoidError | null>(null);
  const [pending, startTransition] = useTransition();
  const signedOn = (party: 'client' | 'studio') => {
    const signature = contract.signatures.find((entry) => entry.party === party);
    return signature
      ? t('signedOn', {
          date: format.dateTime(signature.signedAt, { dateStyle: 'medium', timeStyle: 'short' }),
        })
      : t('pending');
  };
  const studioSigned = contract.signatures.some((entry) => entry.party === 'studio');
  const awaiting = contract.status === 'awaiting_signatures';

  return (
    <section
      aria-labelledby="contract-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="contract-title" className="text-title-sm text-text">
          {t('title')}
        </h2>
        <Badge variant={contract.status === 'signed' ? 'default' : 'secondary'}>
          {t(`status.${contract.status}`)}
        </Badge>
      </header>

      <ul className="flex flex-col gap-1 text-body-sm text-text">
        <li>{t('client', { name: contract.clientSigner, state: signedOn('client') })}</li>
        <li>{t('studio', { name: contract.studioSigner, state: signedOn('studio') })}</li>
      </ul>

      {contract.pdfAvailable ? (
        <a
          href={`/api/contracts/${contract.id}/pdf`}
          className="text-body-sm text-link hover:underline"
        >
          {t('download')}
        </a>
      ) : null}

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-body-sm text-link">{t('read')}</summary>
        <div
          tabIndex={0}
          aria-label={t('title')}
          className="mt-3 max-h-120 overflow-y-auto text-body-sm whitespace-pre-wrap text-text"
        >
          {contract.body}
        </div>
        <p className="mt-2 text-caption break-all text-text-tertiary">
          {t('fingerprint', { hash: contract.bodyHash })}
        </p>
      </details>

      {founder && awaiting && !studioSigned ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-label text-text">{t('signForStudio')}</h3>
          <SignatureForm
            contractId={contract.id}
            bodyHash={contract.bodyHash}
            expectedName={contract.studioSigner}
            submitLabel={t('signForStudio')}
            sign={actions.sign}
          />
        </div>
      ) : null}

      {founder && awaiting ? (
        <details className="border-t border-border pt-4">
          <summary className="cursor-pointer text-body-sm text-danger">{t('voidTitle')}</summary>
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await actions
                  .void(contract.id, dealId, reason)
                  .catch(() => ({ ok: false, code: 'not_found' }) as const);
                if (!result.ok) return setError(voidError(result.code));
                router.refresh();
              });
            }}
          >
            <p className="text-body-sm text-text-secondary">{t('voidHint')}</p>
            <Label htmlFor={`void-${contract.id}`}>{t('voidReason')}</Label>
            <Textarea
              id={`void-${contract.id}`}
              rows={2}
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
            <div>
              <Button type="submit" variant="destructive" disabled={pending}>
                {t('voidSubmit')}
              </Button>
            </div>
          </form>
        </details>
      ) : null}
    </section>
  );
}
