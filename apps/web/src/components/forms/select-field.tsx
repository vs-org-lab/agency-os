'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@agency-os/ui/components/select';

// Radix Select rejects an empty item value, so the empty choice travels under this token.
const EMPTY = '__empty__';

export type SelectFieldOption = { value: string; label: string };

/**
 * A shadcn Select that behaves like a native one inside a form: the submitted value is the plain
 * option value, or an empty string for the empty choice, in a single hidden input named `name`.
 */
export function SelectField({
  id,
  name,
  label,
  value,
  onValueChange,
  options,
  emptyLabel,
  disabled,
  className,
}: {
  id?: string;
  name?: string;
  /** Accessible name; use it when no visible label points at `id`. */
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  /** Label of the choice that stands for "no value"; omitted when a value is always required. */
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <>
      <Select
        value={value === '' && emptyLabel !== undefined ? EMPTY : value}
        onValueChange={(next) => onValueChange(next === EMPTY ? '' : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={label} className={className ?? 'w-full'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {emptyLabel !== undefined ? <SelectItem value={EMPTY}>{emptyLabel}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}
    </>
  );
}
