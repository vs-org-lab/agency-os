export type ReportKind = 'monthly' | 'qbr';

/** A whole calendar month or quarter, as Lisbon days `YYYY-MM-DD`. */
export type ReportPeriod = { kind: ReportKind; start: string; end: string };

const MONTHS_IN = { monthly: 1, qbr: 3 } as const;

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;

const dayOf = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;

function lastDay(startIndex: number, months: number): string {
  const year = Math.floor((startIndex + months) / 12);
  const month = (startIndex + months) % 12;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function periodAt(kind: ReportKind, startIndex: number): ReportPeriod {
  return {
    kind,
    start: dayOf(startIndex),
    end: lastDay(startIndex, MONTHS_IN[kind]),
  };
}

/** The month or quarter that contains the day. */
export function periodOf(kind: ReportKind, day: string): ReportPeriod {
  const index = monthIndex(day);
  return periodAt(kind, kind === 'qbr' ? index - (index % 3) : index);
}

/** The month or quarter before the one that contains today. */
export function previousPeriod(kind: ReportKind, today: string): ReportPeriod {
  const current = monthIndex(periodOf(kind, today).start);
  return periodAt(kind, current - MONTHS_IN[kind]);
}

/** A report covers only a period that has ended. */
export function isFinished(period: ReportPeriod, today: string): boolean {
  return period.end < today;
}

export function quarterOf(start: string): { quarter: 1 | 2 | 3 | 4; year: number } {
  const month = Number(start.slice(5, 7));
  return {
    quarter: (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4,
    year: Number(start.slice(0, 4)),
  };
}

/** Whether the month (its first day) is the last of a quarter. */
export function closesQuarter(monthStart: string): boolean {
  return Number(monthStart.slice(5, 7)) % 3 === 0;
}
