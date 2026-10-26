import type { ReactNode } from 'react';

export type CreateResult = { message: string };

export type CreateOverlayProps = {
  label: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  variant?: 'default' | 'outline';
  defaultOpen?: boolean;
  children: (close: (result?: CreateResult) => void) => ReactNode;
};
