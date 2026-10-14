export const EXPENSE_CATEGORIES = [
  'software',
  'advertising',
  'freelancers',
  'equipment',
  'travel',
  'training',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
