'use client';

import { forwardRef, useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextField } from './text-field';

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, 'type'> & {
  showLabel: string;
  hideLabel: string;
};

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ showLabel, hideLabel, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <TextField ref={ref} type={visible ? 'text' : 'password'} className="pr-11" {...props} />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          className="absolute top-7 right-1 flex size-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-(--duration-fast) hover:text-text md:top-7 md:size-8"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
