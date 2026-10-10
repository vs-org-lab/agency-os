/** `clientIds` is null for founders, who may take tasks of any client. */
export type TaskPerson = { id: string; name: string; clientIds: string[] | null };

/** Whether a person may take a task of the given client (or a studio task, when null). */
export function canTakeTask(person: TaskPerson, clientId: string | null): boolean {
  return clientId === null || person.clientIds === null || person.clientIds.includes(clientId);
}
