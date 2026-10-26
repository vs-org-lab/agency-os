'use client';

import { useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { CreateDialog } from '@/components/ui/create-dialog';
import type { LegalEntity, LegalEntityInput } from '@/modules/contracts/server';
import type { EntityActionResult } from './actions';

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

const TEXT_FIELDS = [
  { name: 'legalName', type: 'text', autoComplete: 'organization' },
  { name: 'taxId', type: 'text', autoComplete: 'off' },
  { name: 'address', type: 'text', autoComplete: 'street-address' },
  { name: 'email', type: 'email', autoComplete: 'email' },
  { name: 'representativeName', type: 'text', autoComplete: 'name' },
  { name: 'representativeRole', type: 'text', autoComplete: 'organization-title' },
] as const;

const BANK_FIELDS = ['bankName', 'iban', 'bic'] as const;

type TextField =
  (typeof TEXT_FIELDS)[number]['name'] | (typeof BANK_FIELDS)[number] | 'paymentInstructions';

const EMPTY_VALUES: Record<TextField, string> = {
  legalName: '',
  taxId: '',
  address: '',
  email: '',
  representativeName: '',
  representativeRole: '',
  bankName: '',
  iban: '',
  bic: '',
  paymentInstructions: '',
};

/** Keeps every typed value when the save is refused; a saved new entity clears the form. */
export function EntityForm({
  entity,
  idPrefix,
  save,
  onDone,
}: {
  entity: LegalEntity | null;
  idPrefix: string;
  save: (input: LegalEntityInput) => Promise<EntityActionResult>;
  /** Called once with the success message when the entity has been saved. */
  onDone?: (message: string) => void;
}) {
  const t = useTranslations('settings.organization');
  const [values, setValues] = useState<Record<TextField, string>>({
    legalName: entity?.legalName ?? '',
    taxId: entity?.taxId ?? '',
    address: entity?.address ?? '',
    email: entity?.email ?? '',
    representativeName: entity?.representativeName ?? '',
    representativeRole: entity?.representativeRole ?? '',
    bankName: entity?.bankName ?? '',
    iban: entity?.iban ?? '',
    bic: entity?.bic ?? '',
    paymentInstructions: entity?.paymentInstructions ?? '',
  });
  const [country, setCountry] = useState<'PT' | 'AO'>(entity?.country ?? 'PT');
  const [isDefault, setIsDefault] = useState(entity?.isDefault ?? false);
  const [result, setResult] = useState<EntityActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (name: TextField, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setResult(null);
  };

  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await save({
            ...values,
            country,
            isDefault,
            ...(entity ? { entityId: entity.id } : {}),
          }).catch(() => ({ ok: false }) as const);
          if (result.ok && !entity) {
            setValues(EMPTY_VALUES);
            setCountry('PT');
            setIsDefault(false);
          }
          if (result.ok) onDone?.(t('saved'));
          setResult(result);
        });
      }}
    >
      {TEXT_FIELDS.map((field) => (
        <div
          key={field.name}
          className={
            field.name === 'address' ? 'flex flex-col gap-1 md:col-span-2' : 'flex flex-col gap-1'
          }
        >
          <Label htmlFor={`${idPrefix}-${field.name}`}>{t(`fields.${field.name}`)}</Label>
          <Input
            id={`${idPrefix}-${field.name}`}
            type={field.type}
            autoComplete={field.autoComplete}
            required
            value={values[field.name]}
            onChange={(event) => update(field.name, event.target.value)}
          />
        </div>
      ))}
      {BANK_FIELDS.map((name) => (
        <div key={name} className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-${name}`}>{t(`fields.${name}`)}</Label>
          <Input
            id={`${idPrefix}-${name}`}
            type="text"
            autoComplete="off"
            value={values[name]}
            onChange={(event) => update(name, event.target.value)}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor={`${idPrefix}-paymentInstructions`}>{t('fields.paymentInstructions')}</Label>
        <Textarea
          id={`${idPrefix}-paymentInstructions`}
          aria-describedby={`${idPrefix}-paymentInstructions-hint`}
          maxLength={1000}
          rows={3}
          value={values.paymentInstructions}
          onChange={(event) => update('paymentInstructions', event.target.value)}
        />
        <p id={`${idPrefix}-paymentInstructions-hint`} className="text-body-sm text-text-secondary">
          {t('fields.paymentInstructionsHint')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-country`}>{t('fields.country')}</Label>
        <select
          id={`${idPrefix}-country`}
          value={country}
          onChange={(event) => setCountry(event.target.value === 'AO' ? 'AO' : 'PT')}
          className={FIELD}
        >
          <option value="PT">{t('countries.PT')}</option>
          <option value="AO">{t('countries.AO')}</option>
        </select>
      </div>
      <div className="flex items-center gap-3 md:pt-6">
        <Checkbox
          id={`${idPrefix}-default`}
          checked={isDefault}
          onCheckedChange={(checked) => setIsDefault(checked === true)}
        />
        <Label htmlFor={`${idPrefix}-default`} className="text-body-sm text-text">
          {t('fields.isDefault')}
        </Label>
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        {result?.ok === false ? <FormMessage tone="danger">{t('error')}</FormMessage> : null}
        {result?.ok && !onDone ? <FormMessage tone="success">{t('saved')}</FormMessage> : null}
        <div className="md:w-56">
          <Button type="submit" disabled={pending} className="w-full">
            {t('save')}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The "add entity" button or an entity's "edit" button, each opening the form in a dialog. */
export function EntityDialog({
  entity,
  idPrefix,
  save,
}: {
  entity: LegalEntity | null;
  idPrefix: string;
  save: (input: LegalEntityInput) => Promise<EntityActionResult>;
}) {
  const t = useTranslations('settings.organization');
  return (
    <CreateDialog
      label={entity ? t('edit') : t('add')}
      title={entity ? entity.legalName : t('add')}
      variant={entity ? 'outline' : 'default'}
      icon={entity ? <Pencil aria-hidden /> : undefined}
    >
      {(close) => (
        <EntityForm
          entity={entity}
          idPrefix={idPrefix}
          save={save}
          onDone={(message) => close({ message })}
        />
      )}
    </CreateDialog>
  );
}
