import type { ReactNode } from 'react';

export type CreateResult = { message: string };

export type CreateOverlayProps = {
  label: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  variant?: 'default' | 'outline' | 'destructive';
  defaultOpen?: boolean;
  /** Opens the overlay whenever it turns true after mount (for example a `?new=1` navigation). */
  openRequested?: boolean;
  /** Called whenever the overlay closes, by result or dismissal. */
  onClose?: () => void;
  children: (close: (result?: CreateResult) => void) => ReactNode;
};
