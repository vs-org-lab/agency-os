'use client';

import { CalendarPlus, ListTodo, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CreateMenu, type CreateMenuItem } from '@/components/ui/create-menu';
import type { HomeView } from '@/modules/studio';

/** "+ Novo" with only the creation flows the reader may use; each item opens its screen's dialog. */
export function HomeCreateMenu({ create }: { create: HomeView['create'] }) {
  const t = useTranslations('studio.home.create');
  const items: CreateMenuItem[] = [
    ...(create.task
      ? [{ label: t('task'), href: '/tasks?new=1', icon: <ListTodo className="size-4" /> }]
      : []),
    ...(create.target
      ? [{ label: t('target'), href: '/acquisition?new=1', icon: <Target className="size-4" /> }]
      : []),
    ...(create.event
      ? [
          {
            label: t('event'),
            href: '/calendar?new=1',
            icon: <CalendarPlus className="size-4" />,
          },
        ]
      : []),
  ];
  return <CreateMenu label={t('label')} items={items} />;
}
