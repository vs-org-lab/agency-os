'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@agency-os/ui/components/collapsible';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { SignatureForm, type SignActionResult } from '@/components/contracts/signature-form';
import { FormMessage } from '@/components/forms/form-message';
import { CreateDialog } from '@/components/ui/create-dialog';
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

function VoidContractForm({
  contractId,
  dealId,
  voidContract,
  onDone,
}: {
  contractId: string;
  dealId: string;
  voidContract: ContractSectionActions['void'];
  onDone: (message: string) => void;
}) {
  const t = useTranslations('contracts.contract');
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<VoidError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await voidContract(contractId, dealId, reason).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (!result.ok) return setError(voidError(result.code));
          router.refresh();
          onDone(t('voided'));
        });
      }}
    >
      <Label htmlFor={`void-${contractId}`}>{t('voidReason')}</Label>
      <Textarea
        id={`void-${contractId}`}
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
  );
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

      <Collapsible className="rounded-md border border-border p-3">
        <CollapsibleTrigger className="text-link">{t('read')}</CollapsibleTrigger>
        <CollapsibleContent>
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
        </CollapsibleContent>
      </Collapsible>

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
        <div className="border-t border-border pt-4">
          <CreateDialog
            label={t('voidTitle')}
            title={t('voidTitle')}
            description={t('voidHint')}
            variant="destructive"
            icon={<Ban aria-hidden />}
          >
            {(close) => (
              <VoidContractForm
                contractId={contract.id}
                dealId={dealId}
                voidContract={actions.void}
                onDone={(message) => close({ message })}
              />
            )}
          </CreateDialog>
        </div>
      ) : null}
    </section>
  );
}
