// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const received = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: { children: ReactNode }) => {
    received.props = props;
    return <>{children}</>;
  },
  useTheme: () => ({}),
}));

const { ThemeProvider } = await import('../src/theme/theme-provider');

afterEach(cleanup);

describe('ThemeProvider', () => {
  it('starts in the dark theme and still follows the system when chosen', () => {
    render(<ThemeProvider>content</ThemeProvider>);

    expect(received.props.defaultTheme).toBe('dark');
    expect(received.props.enableSystem).toBe(true);
    expect(received.props.attribute).toBe('class');
  });
});
