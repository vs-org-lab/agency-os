'use client';

import { useId, useState, useTransition } from 'react';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import type { HubSharingView } from '@/modules/brand-hub';
import type { ActionResult } from './hub-errors';

export type SaveSharing = (input: {
  hubId: string;
  slug: string;
  mode: HubSharingView['mode'];
  password: string;
}) => Promise<ActionResult>;

type SharingError = 'invalid_input' | 'invalid_state' | 'not_found';

const MODES = ['public', 'password', 'restricted'] as const;

/** RF-096: the site address and who may open it; only the team that publishes sees it. */
export function SharingPanel({ sharing, save }: { sharing: HubSharingView; save: SaveSharing }) {
  const t = useTranslations('brandHub.sharing');
  const id = useId();
  const [slug, setSlug] = useState(sharing.slug);
  const [mode, setMode] = useState<HubSharingView['mode']>(sharing.mode);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<'saved' | 'copied' | SharingError | null>(null);
  const [pending, startTransition] = useTransition();

  const copy = async () => {
    if (!sharing.siteUrl) return;
    const copied = await navigator.clipboard?.writeText(sharing.siteUrl).then(
      () => true,
      () => false,
    );
    setResult(copied ? 'copied' : null);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const outcome = await save({ hubId: sharing.hubId, slug, mode, password }).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (outcome.ok) setPassword('');
          setResult(
            outcome.ok
              ? 'saved'
              : outcome.code === 'invalid_input' || outcome.code === 'invalid_state'
                ? outcome.code
                : 'not_found',
          );
        });
      }}
    >
      <h2 className="text-body-sm font-medium text-text">{t('title')}</h2>
      <div className="flex flex-col gap-1">
        <span className="text-caption text-text-secondary">{t('siteAddress')}</span>
        {sharing.siteUrl ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 truncate rounded bg-surface-muted px-2 py-1 text-caption text-text">
              {sharing.siteUrl}
            </code>
            <Button type="button" variant="ghost" size="icon" aria-label={t('copy')} onClick={copy}>
              <Copy aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <p className="text-body-sm text-text-secondary">{t('noSite')}</p>
        )}
      </div>
      {!sharing.published ? <FormMessage tone="info">{t('unpublished')}</FormMessage> : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-slug`}>{t('slug')}</Label>
        <Input
          id={`${id}-slug`}
          value={slug}
          maxLength={60}
          aria-describedby={`${id}-slug-hint`}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
          className="font-mono"
        />
        <p id={`${id}-slug-hint`} className="text-caption text-text-secondary">
          {t('slugHint')}
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-medium text-text">{t('access')}</legend>
        {MODES.map((value) => (
          <label key={value} className="flex items-start gap-2 text-body-sm text-text">
            <input
              type="radio"
              name={`${id}-mode`}
              className="mt-1"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {t(`modes.${value}`)}
          </label>
        ))}
      </fieldset>
      {mode === 'password' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-password`}>{t('password')}</Label>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="new-password"
            value={password}
            maxLength={128}
            aria-describedby={`${id}-password-hint`}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p id={`${id}-password-hint`} className="text-caption text-text-secondary">
            {sharing.hasPassword && sharing.mode === 'password'
              ? t('passwordKeep')
              : t('passwordHint')}
          </p>
        </div>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('save')}
      </Button>
      {result === 'saved' || result === 'copied' ? (
        <FormMessage tone="success">{t(result)}</FormMessage>
      ) : result ? (
        <FormMessage tone="danger">{t(`errors.${result}`)}</FormMessage>
      ) : null}
    </form>
  );
}
