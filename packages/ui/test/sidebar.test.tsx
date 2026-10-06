// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
} from '../src/components/sidebar';
import { installMatchMedia } from './match-media';

beforeAll(() => {
  installMatchMedia();
});

afterEach(() => {
  document.cookie = 'sidebar_state=; max-age=0; path=/';
});

describe('sidebar', () => {
  it('sidebar collapses to 64px and persists preference', async () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar collapsible="icon" mobileTitle="Navigation" mobileDescription="Main menu">
          <SidebarContent />
        </Sidebar>
        <SidebarTrigger label="Toggle menu" />
      </SidebarProvider>,
    );
    const wrapper = container.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');

    expect(wrapper?.style.getPropertyValue('--sidebar-width')).toBe('240px');
    expect(wrapper?.style.getPropertyValue('--sidebar-width-icon')).toBe('64px');

    await userEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(container.querySelector('[data-state="collapsed"]')).not.toBeNull();
    expect(document.cookie).toContain('sidebar_state=false');
  });
});
