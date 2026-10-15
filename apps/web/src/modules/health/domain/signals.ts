export type SignalDetail =
  | { kind: 'payments'; onTime: number; total: number }
  | { kind: 'approvals'; medianDays: number }
  | { kind: 'responses'; medianHours: number }
  | { kind: 'outcome'; progress: number; expected: number };

/** One health signal from 0 to 100, with what it was computed from (RF-160). */
export type Signal = { score: number; detail: SignalDetail };

const DAY_MS = 24 * 60 * 60 * 1000;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** 100 at or under the best value, 0 at or over the worst, linear in between. */
function linear(value: number, best: number, worst: number): number {
  if (value <= best) return 100;
  if (value >= worst) return 0;
  return Math.round((100 * (worst - value)) / (worst - best));
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const days = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

/** Requests due in the window, paid by their due date; an open overdue one counts as late. */
export function paymentsSignal(
  requests: readonly { dueDate: string; paidOn: string | null }[],
): Signal | null {
  if (requests.length === 0) return null;
  const onTime = requests.filter(
    (request) => request.paidOn !== null && request.paidOn <= request.dueDate,
  ).length;
  return {
    score: Math.round((onTime / requests.length) * 100),
    detail: { kind: 'payments', onTime, total: requests.length },
  };
}

/** The client's median days to decide an approval: 3 days or less is 100, 14 or more is 0. */
export function approvalsSignal(daysToDecide: readonly number[]): Signal | null {
  const middle = median(daysToDecide);
  if (middle === null) return null;
  return { score: linear(middle, 3, 14), detail: { kind: 'approvals', medianDays: middle } };
}

/** The client's median hours to answer the team: 24 hours or less is 100, 7 days or more is 0. */
export function responsesSignal(hoursToAnswer: readonly number[]): Signal | null {
  const middle = median(hoursToAnswer);
  if (middle === null) return null;
  return { score: linear(middle, 24, 168), detail: { kind: 'responses', medianHours: middle } };
}

/**
 * The outcome's progress towards its target against the share of time gone by; a guarantee
 * decided because the target was met counts as 100.
 */
export function outcomeSignal(input: {
  baseline: number;
  target: number;
  latest: number | null;
  createdOn: string;
  deadline: string;
  today: string;
  guarantee: { status: string; reason: string | null };
}): Signal | null {
  if (input.latest === null) return null;
  const progress = clamp((input.latest - input.baseline) / (input.target - input.baseline));
  const window = days(input.createdOn, input.deadline);
  const expected = window <= 0 ? 1 : clamp(days(input.createdOn, input.today) / window);
  const detail = { kind: 'outcome' as const, progress, expected };
  const targetMet =
    input.guarantee.reason === 'target_met' &&
    (input.guarantee.status === 'not_activated' || input.guarantee.status === 'closed');
  if (targetMet || expected === 0) return { score: 100, detail };
  return { score: Math.round(Math.min(1, progress / expected) * 100), detail };
}
