import { StateFrame, type StateProps } from './state-frame';
import { cn } from '@agency-os/ui/lib/utils';

export function ErrorState({ className, ...props }: StateProps) {
  return (
    <StateFrame
      {...props}
      role="alert"
      className={cn('border-solid border-danger-bg bg-danger-bg/40', className)}
    />
  );
}
