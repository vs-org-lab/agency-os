// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ProjectView } from '@/modules/rooms';
import { ProjectCard } from './project-card';

afterEach(cleanup);

const PROJECT: ProjectView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Website',
  status: 'active',
  startsOn: '2026-10-12',
  endsOn: null,
  dealId: null,
  finalApproval: null,
  deliveredAt: null,
  approvals: [],
  updates: [],
  phases: [],
};

function renderCard(health: Parameters<typeof ProjectCard>[0]['health']) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <ProjectCard project={PROJECT} team={[]} health={health} />
    </NextIntlClientProvider>,
  );
}

describe('ProjectCard health line', () => {
  it('says there is not enough data yet when there is no health score', () => {
    renderCard(null);

    expect(screen.getByText('Saúde: ainda sem dados suficientes')).toBeTruthy();
  });
});
