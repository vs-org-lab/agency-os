'use client';

import { useTranslations } from 'next-intl';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { FormMessage } from '@/components/forms/form-message';
import type { MemberView } from '@/modules/team';
import type { TeamActionResult } from './team-errors';
import { useTeamAction } from './use-team-action';

type Option = { id: string; label: string; assigned: boolean };

function OptionList({
  idPrefix,
  options,
  disabled,
  onToggle,
}: {
  idPrefix: string;
  options: Option[];
  disabled: boolean;
  onToggle: (id: string, assigned: boolean) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {options.map((option) => (
        <li key={option.id} className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${option.id}`}
            checked={option.assigned}
            disabled={disabled}
            onCheckedChange={(checked) => onToggle(option.id, checked === true)}
          />
          <label htmlFor={`${idPrefix}-${option.id}`} className="text-body-sm text-text">
            {option.label}
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Clients for managers and freelancers; projects, within assigned clients, for freelancers. */
export function AssignmentList({
  member,
  setClient,
  setProject,
}: {
  member: MemberView;
  setClient: (userId: string, clientId: string, assigned: boolean) => Promise<TeamActionResult>;
  setProject: (userId: string, projectId: string, assigned: boolean) => Promise<TeamActionResult>;
}) {
  const t = useTranslations('team');
  const { outcome, pending, run } = useTeamAction();

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="assignments-clients" className="flex flex-col gap-3">
        <h2 id="assignments-clients" className="text-heading text-text">
          {t('assignments.clients')}
        </h2>
        {member.clients.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('assignments.none')}</p>
        ) : (
          <OptionList
            idPrefix="assignment-client"
            options={member.clients.map((client) => ({
              id: client.id,
              label: client.name,
              assigned: client.assigned,
            }))}
            disabled={pending}
            onToggle={(clientId, assigned) =>
              run('saved', () => setClient(member.userId, clientId, assigned))
            }
          />
        )}
      </section>
      {member.role === 'freelancer' ? (
        <section aria-labelledby="assignments-projects" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="assignments-projects" className="text-heading text-text">
              {t('assignments.projects')}
            </h2>
            <p className="text-body-sm text-text-secondary">{t('assignments.projectsHint')}</p>
          </div>
          {member.projects.length === 0 ? (
            <p className="text-body-sm text-text-secondary">{t('assignments.noProjects')}</p>
          ) : (
            <OptionList
              idPrefix="assignment-project"
              options={member.projects.map((project) => ({
                id: project.id,
                label: t('assignments.project', {
                  project: project.name,
                  client: project.clientName,
                }),
                assigned: project.assigned,
              }))}
              disabled={pending}
              onToggle={(projectId, assigned) =>
                run('saved', () => setProject(member.userId, projectId, assigned))
              }
            />
          )}
        </section>
      ) : null}
      {outcome?.ok === false ? (
        <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>
      ) : null}
      {outcome?.ok ? <FormMessage tone="success">{t('assignments.saved')}</FormMessage> : null}
    </div>
  );
}
