'use client';

import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

type CardTab = { value: string; label: string };

type CardTabsProps = {
  title: string;
  tabs: readonly CardTab[];
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
};

/** A card whose header carries a title and tabs that switch the one panel below. */
function CardTabs({ title, tabs, value, onValueChange, children, className }: CardTabsProps) {
  const titleId = React.useId();
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      className={cn('gap-4 rounded-lg border border-border bg-surface p-4', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-title-sm text-text">
          {title}
        </h2>
        <TabsList aria-labelledby={titleId}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={value}>{children}</TabsContent>
    </Tabs>
  );
}

export { CardTabs };
export type { CardTab, CardTabsProps };
