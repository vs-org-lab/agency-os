'use client';

import { forwardRef, useId, type ComponentProps } from 'react';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { cn } from '@agency-os/ui/lib/utils';

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, className, ...props },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-label text-text">
        {label}
      </Label>
      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn('h-11 text-body md:h-9', className)}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-caption text-text-tertiary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
