'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';

export type SignActionResult = { ok: true } | { ok: false; code: string };

const SIGN_ERRORS = ['confirm', 'name_mismatch', 'changed', 'not_found'] as const;

type SignError = (typeof SIGN_ERRORS)[number];

function signError(code: string): SignError {
  return (SIGN_ERRORS as readonly string[]).includes(code) ? (code as SignError) : 'not_found';
}

/** A simple electronic signature: the expected name typed in full and an explicit confirmation. */
export function SignatureForm({
  contractId,
  bodyHash,
  expectedName,
  submitLabel,
  sign,
}: {
  contractId: string;
  bodyHash: string;
  expectedName: string;
  submitLabel: string;
  sign: (contractId: string, typedName: string, bodyHash: string) => Promise<SignActionResult>;
}) {
  const t = useTranslations('contracts.signature');
  const router = useRouter();
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<SignError | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `signature-${contractId}`;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmed) {
          setError('confirm');
          return;
        }
        startTransition(async () => {
          const result = await sign(contractId, name, bodyHash).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (!result.ok) {
            setError(signError(result.code));
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-name`}>{t('nameLabel', { name: expectedName })}</Label>
        <Input
          id={`${id}-name`}
          required
          autoComplete="name"
          maxLength={200}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-confirm`}
          checked={confirmed}
          onCheckedChange={(checked) => {
            setConfirmed(checked === true);
            setError(null);
          }}
        />
        <Label htmlFor={`${id}-confirm`} className="text-body-sm text-text">
          {t('confirm')}
        </Label>
      </div>
      <p className="text-caption text-text-secondary">{t('legal')}</p>
      {error ? (
        <FormMessage tone="danger">{t(`errors.${error}`, { name: expectedName })}</FormMessage>
      ) : null}
      <div className="md:w-72">
        <Button type="submit" disabled={pending} className="w-full">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
