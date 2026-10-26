'use client';

import { useActionState, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agency-os/ui/components/dialog';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { useSavedNotice } from '@/components/forms/use-saved-notice';
import { CreateDialog } from '@/components/ui/create-dialog';
import { SubmitButton } from '@/components/forms/submit-button';
import type { AcquisitionFormState } from './actions';

type BoundAction = (
  state: AcquisitionFormState,
  formData: FormData,
) => Promise<AcquisitionFormState>;

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';
const STATUSES = ['to_contact', 'contacted', 'replied', 'discarded'] as const;
const ROLES = ['decision_maker', 'operational', 'client_finance'] as const;

export function TargetForm({
  action,
  defaults,
  idPrefix,
  onDone,
}: {
  action: BoundAction;
  defaults: {
    companyName: string;
    sector: string;
    website: string | null;
    notes: string | null;
    status: string;
  } | null;
  idPrefix: string;
  /** Called once with the success message when the target has been saved. */
  onDone?: (message: string) => void;
}) {
  const t = useTranslations('commercial.acquisition');
  const [state, formAction] = useActionState<AcquisitionFormState, FormData>(action, {
    status: 'idle',
  });
  useSavedNotice(state, onDone, t('form.saved'));

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-company`}>{t('form.companyName')}</Label>
        <Input
          id={`${idPrefix}-company`}
          name="companyName"
          required
          defaultValue={defaults?.companyName ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-sector`}>{t('form.sector')}</Label>
        <Input
          id={`${idPrefix}-sector`}
          name="sector"
          required
          defaultValue={defaults?.sector ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-website`}>{t('form.website')}</Label>
        <Input
          id={`${idPrefix}-website`}
          name="website"
          inputMode="url"
          defaultValue={defaults?.website ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-status`}>{t('form.status')}</Label>
        <select
          id={`${idPrefix}-status`}
          name="status"
          defaultValue={defaults?.status ?? 'to_contact'}
          className={FIELD}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`statuses.${status}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}-notes`}>{t('form.notes')}</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          rows={3}
          defaultValue={defaults?.notes ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        {state.status === 'error' ? (
          <FormMessage tone="danger">{t('form.error')}</FormMessage>
        ) : null}
        <div className="md:w-40">
          <SubmitButton>{t('form.save')}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

/** The "add" button or the per-row "edit" button, each opening the target form in a dialog. */
export function TargetDialog({
  action,
  defaults,
  idPrefix,
}: {
  action: BoundAction;
  defaults: Parameters<typeof TargetForm>[0]['defaults'];
  idPrefix: string;
}) {
  const t = useTranslations('commercial.acquisition');
  return (
    <CreateDialog
      label={defaults ? t('edit') : t('add')}
      title={defaults ? defaults.companyName : t('add')}
      variant={defaults ? 'outline' : 'default'}
      icon={defaults ? <Pencil aria-hidden /> : undefined}
    >
      {(close) => (
        <TargetForm
          action={action}
          defaults={defaults}
          idPrefix={idPrefix}
          onDone={(message) => close({ message })}
        />
      )}
    </CreateDialog>
  );
}

export function ConvertTarget({
  action,
  companyName,
}: {
  action: BoundAction;
  companyName: string;
}) {
  const t = useTranslations('commercial.acquisition');
  const roles = useTranslations('commercial.deal.contacts.roles');
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<AcquisitionFormState, FormData>(action, {
    status: 'idle',
  });

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {t('convert')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('convertDialog.cancel')}>
          <DialogHeader>
            <DialogTitle>{t('convertDialog.title')}</DialogTitle>
            <DialogDescription>{t('convertDialog.description')}</DialogDescription>
            <p className="text-body-sm font-medium text-text">{companyName}</p>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="convert-name">{t('convertDialog.fullName')}</Label>
              <Input id="convert-name" name="fullName" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="convert-email">{t('convertDialog.email')}</Label>
              <Input id="convert-email" name="email" type="email" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="convert-role">{t('convertDialog.role')}</Label>
              <select id="convert-role" name="role" defaultValue="decision_maker" className={FIELD}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roles(role)}
                  </option>
                ))}
              </select>
            </div>
            {state.status === 'error' ? (
              <FormMessage tone="danger">{t('convertDialog.error')}</FormMessage>
            ) : null}
            <SubmitButton>{t('convertDialog.submit')}</SubmitButton>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CopyTemplate({ body }: { body: string }) {
  const t = useTranslations('commercial.acquisition.templates');
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(body);
        setCopied(true);
      }}
    >
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
