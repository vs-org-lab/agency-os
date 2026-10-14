'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { pageAssetIds } from '@agency-os/brand-hub-view';
import { HubView } from '@agency-os/brand-hub-view/hub-view';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import type { HubResult, SiteApi } from './api';
import { SiteDownloads } from './site-downloads';
import { tokenStore } from './token-store';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'result'; result: HubResult };

/** The hub's slug, the first segment of the path. */
function slugOf(location: URL): string | null {
  const segment = location.pathname.split('/').filter(Boolean)[0] ?? '';
  return /^[a-z0-9-]{3,60}$/.test(segment) ? segment : null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[480px]">{children}</div>
    </main>
  );
}

function PasswordGate({
  slug,
  clientName,
  api,
  onToken,
}: {
  slug: string;
  clientName: string;
  api: SiteApi;
  onToken: (token: string) => void;
}) {
  const t = useTranslations('brandHub.site');
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<'wrongPassword' | 'tooMany' | 'error' | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Centered>
      <form
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          const result = await api.unlock(slug, password);
          setPending(false);
          if (result.status === 200) onToken(result.token);
          else
            setError(
              result.status === 401 ? 'wrongPassword' : result.status === 429 ? 'tooMany' : 'error',
            );
        }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-title-sm text-text">{t('passwordTitle')}</h1>
          <p className="text-body-sm text-text-secondary">
            {t('passwordDescription', { client: clientName })}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-password`}>{t('password')}</Label>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-body-sm text-danger">
            {t(error)}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {t('open')}
        </Button>
      </form>
    </Centered>
  );
}

/**
 * H-03: the published hub at `/<slug>/`. A token in the address fragment, left by the OS after a
 * restricted sign-in, is kept and removed from the address; the visitor then sees the hub, the
 * password gate, the restricted entry or a not-found page.
 */
export function HubSite({
  api,
  location,
  replaceHash,
}: {
  api: SiteApi;
  location: URL;
  replaceHash: () => void;
}) {
  const t = useTranslations('brandHub.site');
  const slug = slugOf(location);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(
    async (token: string | null) => {
      if (!slug) {
        setState({ kind: 'result', result: { status: 404 } });
        return;
      }
      setState({ kind: 'loading' });
      const result = await api.loadHub(slug, token);
      if (result.status === 401 && token) tokenStore.clear(slug);
      setState(result.status === 'error' ? { kind: 'error' } : { kind: 'result', result });
    },
    [api, slug],
  );

  useEffect(() => {
    const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
    if (slug && fromHash) {
      tokenStore.set(slug, fromHash);
      replaceHash();
    }
    void load(slug ? (fromHash ?? tokenStore.get(slug)) : null);
  }, [load, location.hash, replaceHash, slug]);

  const clientTitle =
    state.kind === 'result' && (state.result.status === 200 || state.result.status === 401)
      ? state.result.status === 200
        ? state.result.hub.clientName
        : state.result.clientName
      : null;
  useEffect(() => {
    document.title = clientTitle ? `${clientTitle} · Brand Hub` : 'Brand Hub';
  }, [clientTitle]);

  if (state.kind === 'loading') {
    return (
      <Centered>
        <p role="status" className="text-center text-body-sm text-text-secondary">
          {t('loading')}
        </p>
      </Centered>
    );
  }
  if (state.kind === 'error') {
    return (
      <Centered>
        <EmptyState title={t('notFoundTitle')} description={t('error')} />
      </Centered>
    );
  }
  const { result } = state;
  if (result.status === 404 || result.status === 'error' || !slug) {
    return (
      <Centered>
        <EmptyState title={t('notFoundTitle')} description={t('notFoundDescription')} />
      </Centered>
    );
  }
  if (result.status === 401 && result.mode === 'password') {
    return (
      <PasswordGate
        slug={slug}
        clientName={result.clientName}
        api={api}
        onToken={(token) => {
          tokenStore.set(slug, token);
          void load(token);
        }}
      />
    );
  }
  if (result.status === 401) {
    return (
      <Centered>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-title-sm text-text">{t('restrictedTitle')}</h1>
            <p className="text-body-sm text-text-secondary">
              {t('restrictedDescription', { client: result.clientName })}
            </p>
          </div>
          <a
            href={api.accessUrl(slug, `${location.origin}${location.pathname}`)}
            className="self-start rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('restrictedAction')}
          </a>
        </div>
      </Centered>
    );
  }

  const { hub } = result;
  const token = tokenStore.get(slug);
  const requestZip = (pageId: string | null) => async () => {
    const answer = await api.zip(slug, token, pageId);
    return answer.status === 200 ? answer.manifest : null;
  };
  return (
    <main className="min-h-dvh bg-canvas p-4 md:p-8">
      <HubView
        snapshot={hub.snapshot}
        clientName={hub.clientName}
        updatedAt={hub.publishedAt}
        assetUrl={(assetId) => hub.assetUrls[assetId] ?? ''}
        pageAction={(page) =>
          pageAssetIds(page.blocks).length > 0 ? (
            <SiteDownloads label={page.title} requestZip={requestZip(page.id)} />
          ) : null
        }
        footer={
          hub.snapshot.assets.length > 0 ? (
            <SiteDownloads label={null} requestZip={requestZip(null)} />
          ) : null
        }
      />
    </main>
  );
}
