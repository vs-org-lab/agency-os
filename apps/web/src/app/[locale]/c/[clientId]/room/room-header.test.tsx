// @vitest-environment jsdom
import type { AnchorHTMLAttributes } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { RoomHeader } from './room-header';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

afterEach(cleanup);

const CLIENT = { id: '11111111-1111-4111-8111-111111111111', name: 'Atlas Lda' };

function renderHeader(props: Partial<React.ComponentProps<typeof RoomHeader>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <RoomHeader
        title="Documentos"
        client={CLIENT}
        projects={[]}
        selectedId={null}
        basePath={`/c/${CLIENT.id}/docs`}
        showPreviewLink
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('RoomHeader', () => {
  it('renders one h1 with the section title', () => {
    renderHeader();

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Documentos');
    expect(screen.getByText('Atlas Lda')).toBeTruthy();
  });

  it('renders the preview link as an outline button', () => {
    renderHeader({ selectedId: 'project-1' });

    const link = screen.getByRole('link', { name: 'Ver como cliente' });
    expect(link.getAttribute('href')).toBe(`/c/${CLIENT.id}/preview?project=project-1`);
    expect(link.getAttribute('data-variant')).toBe('outline');
  });

  it('omits the preview link when it is not offered', () => {
    renderHeader({ showPreviewLink: false });

    expect(screen.queryByRole('link', { name: 'Ver como cliente' })).toBeNull();
  });

  it('renders the primary action next to the title', () => {
    renderHeader({ actions: <button type="button">Novo documento</button> });

    expect(screen.getByRole('button', { name: 'Novo documento' })).toBeTruthy();
  });

  it('shows the project selector only with more than one project', () => {
    renderHeader({
      projects: [
        { id: 'p1', name: 'Website', status: 'active' },
        { id: 'p2', name: 'Branding', status: 'active' },
      ],
      selectedId: 'p1',
    });

    expect(screen.getByRole('link', { name: 'Website' }).getAttribute('aria-current')).toBe('page');
  });
});
