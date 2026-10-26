// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/components/tabs';
import { MotionProvider } from '../src/motion';

function Group({ label }: { label: string }) {
  return (
    <Tabs defaultValue="a">
      <TabsList aria-label={label}>
        <TabsTrigger value="a">{`${label} A`}</TabsTrigger>
        <TabsTrigger value="b">{`${label} B`}</TabsTrigger>
      </TabsList>
      <TabsContent value="a">{`${label} panel A`}</TabsContent>
      <TabsContent value="b">{`${label} panel B`}</TabsContent>
    </Tabs>
  );
}

const indicators = (root: ParentNode) => root.querySelectorAll('[data-slot="tabs-indicator"]');

describe('tabs indicator', () => {
  it('shows one indicator on the active trigger', () => {
    const { container } = render(
      <MotionProvider>
        <Group label="One" />
      </MotionProvider>,
    );
    expect(indicators(container)).toHaveLength(1);
    expect(
      screen.getByRole('tab', { name: 'One A' }).querySelector('[data-slot="tabs-indicator"]'),
    ).not.toBeNull();
  });

  it('moves the indicator when another tab is selected', async () => {
    const { container } = render(
      <MotionProvider>
        <Group label="One" />
      </MotionProvider>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'One B' }));
    expect(indicators(container)).toHaveLength(1);
    expect(
      screen.getByRole('tab', { name: 'One B' }).querySelector('[data-slot="tabs-indicator"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole('tab', { name: 'One A' }).querySelector('[data-slot="tabs-indicator"]'),
    ).toBeNull();
  });

  it('keeps indicators independent across two tab groups', async () => {
    const { container } = render(
      <MotionProvider>
        <Group label="One" />
        <Group label="Two" />
      </MotionProvider>,
    );
    expect(indicators(container)).toHaveLength(2);
    await userEvent.click(screen.getByRole('tab', { name: 'One B' }));
    expect(indicators(container)).toHaveLength(2);
    expect(
      screen.getByRole('tab', { name: 'Two A' }).querySelector('[data-slot="tabs-indicator"]'),
    ).not.toBeNull();
  });

  it('indicator is hidden from assistive technology', () => {
    const { container } = render(
      <MotionProvider>
        <Group label="One" />
      </MotionProvider>,
    );
    expect(indicators(container)[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('supports controlled usage', async () => {
    let received = '';
    render(
      <MotionProvider>
        <Tabs value="a" onValueChange={(v) => (received = v)}>
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b">B</TabsTrigger>
          </TabsList>
        </Tabs>
      </MotionProvider>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(received).toBe('b');
    expect(
      screen.getByRole('tab', { name: 'A' }).querySelector('[data-slot="tabs-indicator"]'),
    ).not.toBeNull();
  });
});
