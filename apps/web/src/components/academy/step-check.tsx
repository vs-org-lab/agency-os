'use client';

import { useOptimistic, useTransition } from 'react';

/**
 * A checklist step's checkbox: it shows the new state at once and settles on the server's answer
 * once the change is saved and the page refreshed.
 */
export function StepCheck({
  id,
  text,
  done,
  disabled,
  change,
}: {
  id: string;
  text: string;
  done: boolean;
  disabled: boolean;
  change: (done: boolean) => Promise<void>;
}) {
  const [shown, setShown] = useOptimistic(done);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <input
        type="checkbox"
        id={id}
        checked={shown}
        disabled={disabled || pending}
        onChange={() =>
          startTransition(async () => {
            setShown(!shown);
            await change(!shown);
          })
        }
      />
      <label htmlFor={id}>{text}</label>
    </>
  );
}
