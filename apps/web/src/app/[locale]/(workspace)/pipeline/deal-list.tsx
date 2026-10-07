import { getFormatter, getTranslations } from 'next-intl/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@agency-os/ui/components/table';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import { pipelineCodeMessageKey, type PipelineCard } from '@/modules/commercial';

export async function DealList({ cards }: { cards: PipelineCard[] }) {
  const t = await getTranslations('commercial');
  const format = await getFormatter();

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('board.list.client')}</TableHead>
            <TableHead>{t('board.list.code')}</TableHead>
            <TableHead>{t('board.list.nextStep')}</TableHead>
            <TableHead>{t('board.list.owner')}</TableHead>
            <TableHead>{t('board.list.due')}</TableHead>
            <TableHead className="text-right">{t('board.list.value')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.map((card) => (
            <TableRow key={card.dealId}>
              <TableCell className="font-medium">
                <Link href={`/pipeline/${card.dealId}`} className="text-text hover:underline">
                  {card.clientName}
                </Link>
              </TableCell>
              <TableCell>
                <span className="font-mono text-text-secondary">{card.code}</span>{' '}
                {t(`pipeline.codes.${pipelineCodeMessageKey(card.code)}` as never)}
              </TableCell>
              <TableCell className="max-w-64 truncate">
                {card.nextStep ?? t('board.card.noNextStep')}
              </TableCell>
              <TableCell>
                {card.ownerKind === 'client'
                  ? t('board.card.client')
                  : (card.ownerLabel ?? t('board.card.noOwner'))}
              </TableCell>
              <TableCell className={cn('tabular-nums', card.overdue && 'text-danger')}>
                {card.dueOn ? format.dateTime(new Date(card.dueOn), { dateStyle: 'medium' }) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {card.estimatedValue
                  ? format.number(Number(card.estimatedValue), {
                      style: 'currency',
                      currency: card.currency,
                    })
                  : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
