import { StateFrame, type StateProps } from './state-frame';
import { cn } from '@agency-os/ui/lib/utils';

export function BlockedState({ className, ...props }: StateProps) {
  return (
    <StateFrame
      {...props}
      className={cn('border-solid border-warning-bg bg-warning-bg/40', className)}
    />
  );
}
