import { toast } from 'sonner';

type NotifyAction = { label: string; onClick: () => void };

export const notify = {
  success(message: string, options?: { action?: NotifyAction }) {
    toast.success(message, options);
  },
  error(message: string) {
    toast.error(message);
  },
  info(message: string) {
    toast.info(message);
  },
};
