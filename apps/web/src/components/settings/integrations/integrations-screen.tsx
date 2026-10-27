import {
  Bot,
  CalendarDays,
  CreditCard,
  FolderInput,
  Globe,
  Mail,
  MessageSquare,
  Mic,
  Package,
  PenTool,
  Receipt,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import type { ConnectionStatus } from '@/modules/commercial/server';
import type { StudioService, StudioServiceKey } from '@/platform/studio-services';
import { ConnectedList, type ConnectedItem } from './connected-list';
import { IntegrationCard, type IntegrationTone } from './integration-card';
import { IntegrationGroup } from './integration-group';

const SERVICE_ICONS: Record<StudioServiceKey, LucideIcon> = {
  payments: CreditCard,
  email: Mail,
  transcription: Mic,
  receipts: Receipt,
  domains: Globe,
  events: Workflow,
};

const SERVICE_TONE: Record<StudioService['status'], IntegrationTone> = {
  active: 'active',
  test: 'test',
  missing: 'warning',
};

type IdeaKey = 'mcp' | 'slack' | 'drive' | 'dropbox' | 'figma';

const IDEAS: { key: IdeaKey; icon: LucideIcon }[] = [
  { key: 'mcp', icon: Bot },
  { key: 'slack', icon: MessageSquare },
  { key: 'drive', icon: FolderInput },
  { key: 'dropbox', icon: Package },
  { key: 'figma', icon: PenTool },
];

type IntegrationsScreenProps = {
  google: ConnectionStatus;
  provider: 'google' | 'fake';
  services: StudioService[];
  connectAction: () => Promise<void>;
  disconnectAction: () => Promise<void>;
};

export function IntegrationsScreen({
  google,
  provider,
  services,
  connectAction,
  disconnectAction,
}: IntegrationsScreenProps) {
  const t = useTranslations('settings.integrations');
  const connected = google.status === 'active';

  const disconnect = (
    <form action={disconnectAction}>
      <Button type="submit" variant="outline">
        {t('disconnect')}
      </Button>
    </form>
  );

  const connections: ConnectedItem[] =
    google.status === 'none'
      ? []
      : [
          {
            key: 'google',
            title: t('google.title'),
            account: google.email,
            since: google.connectedAt,
            action: connected ? disconnect : undefined,
          },
        ];

  return (
    <div className="flex flex-col gap-8">
      <IntegrationGroup
        title={t('groups.account.title')}
        description={t('groups.account.description')}
      >
        <IntegrationCard
          icon={CalendarDays}
          title={t('google.title')}
          description={t('google.description')}
          status={{
            tone: connected ? 'active' : 'neutral',
            label:
              google.status === 'none'
                ? t('status.none')
                : t(`status.${google.status}`, { email: google.email }),
          }}
          note={provider === 'fake' ? t('fakeProvider') : undefined}
          action={
            connected ? (
              disconnect
            ) : (
              <form action={connectAction}>
                <Button type="submit" disabled={provider !== 'google'}>
                  {google.status === 'none' ? t('connect') : t('reconnect')}
                </Button>
              </form>
            )
          }
        />
      </IntegrationGroup>

      <IntegrationGroup
        title={t('groups.studio.title')}
        description={t('groups.studio.description')}
      >
        {services.map((service) => (
          <IntegrationCard
            key={service.key}
            icon={SERVICE_ICONS[service.key]}
            title={t(`services.${service.key}.title`)}
            description={t(`services.${service.key}.description`)}
            status={{ tone: SERVICE_TONE[service.status], label: t(`state.${service.status}`) }}
          />
        ))}
      </IntegrationGroup>

      <IntegrationGroup title={t('groups.ideas.title')} description={t('groups.ideas.description')}>
        {IDEAS.map(({ key, icon }) => (
          <IntegrationCard
            key={key}
            icon={icon}
            title={t(`ideas.${key}.title`)}
            description={t(`ideas.${key}.description`)}
            badge={t('soon')}
          />
        ))}
      </IntegrationGroup>

      <ConnectedList items={connections} />
    </div>
  );
}
