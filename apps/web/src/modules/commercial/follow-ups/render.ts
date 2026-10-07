export type FollowUpValues = { firstName: string; companyName: string; callDate: string };

export function renderFollowUpMessage(template: string, values: FollowUpValues): string {
  return template.replace(
    /\{(firstName|companyName|callDate)\}/g,
    (_match, key: keyof FollowUpValues) => values[key],
  );
}
