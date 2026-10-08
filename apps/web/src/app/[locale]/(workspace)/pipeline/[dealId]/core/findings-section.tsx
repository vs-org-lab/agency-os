'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { OrbitFront } from '@agency-os/db';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { ORBIT_FRONTS } from '@/modules/diagnosis';
import { removeFindingAction, saveFindingAction } from './actions';
import { FindingForm, type FindingDefaults } from './finding-form';

export function EvidenceLink({ findingId, label }: { findingId: string; label: string }) {
  return (
    <a
      href={`/api/core/evidence/${findingId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-body-sm text-link hover:underline"
    >
      {label}
    </a>
  );
}

function EvidenceLine({ finding }: { finding: FindingDefaults }) {
  const t = useTranslations('diagnosis.findings');
  if (!finding.evidenceKind) {
    return <span className="text-caption text-warning">{t('withoutEvidence')}</span>;
  }
  if (finding.evidenceKind === 'file') {
    return <EvidenceLink findingId={finding.id} label={t('viewEvidence')} />;
  }
  if (finding.evidenceKind === 'link' && finding.evidenceValue) {
    return (
      <a
        href={finding.evidenceValue}
        target="_blank"
        rel="noopener noreferrer"
        className="text-body-sm text-link hover:underline"
      >
        {t('viewEvidence')}
      </a>
    );
  }
  return <span className="text-body-sm text-text-secondary">{finding.evidenceValue}</span>;
}

function FindingItem({
  finding,
  engagementId,
  dealId,
  writable,
}: {
  finding: FindingDefaults;
  engagementId: string;
  dealId: string;
  writable: boolean;
}) {
  const t = useTranslations('diagnosis');
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <li className="flex flex-col gap-3 rounded-md border border-border p-3">
        <FindingForm
          action={saveFindingAction.bind(null, engagementId, dealId)}
          defaults={finding}
          onSaved={() => setEditing(false)}
        />
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {t('findings.cancel')}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-body font-medium text-text">{finding.title}</span>
          {finding.description ? (
            <p className="text-body-sm text-text-secondary">{finding.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`lanes.${finding.lane}`)}</Badge>
          <Badge variant="outline">{t(`owners.${finding.owner}`)}</Badge>
          {finding.bringToCall ? (
            <Badge className="bg-info-bg text-info">{t('findings.forCall')}</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceLine finding={finding} />
        {writable ? (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {t('findings.edit')}
            </Button>
            {confirming ? (
              <>
                <span className="text-body-sm text-text">{t('findings.confirmRemove')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removeFindingAction(finding.id, dealId);
                      if (!result.ok) setError(t('findings.errors.not_found'));
                      setConfirming(false);
                    })
                  }
                >
                  {t('findings.remove')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  {t('findings.cancel')}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                {t('findings.remove')}
              </Button>
            )}
          </>
        ) : null}
      </div>
      {error ? <FormMessage tone="danger">{error}</FormMessage> : null}
    </li>
  );
}

export function FindingsSection({
  engagementId,
  dealId,
  findings,
  writable,
}: {
  engagementId: string;
  dealId: string;
  findings: FindingDefaults[];
  writable: boolean;
}) {
  const t = useTranslations('diagnosis');
  const [adding, setAdding] = useState<OrbitFront | null>(null);

  return (
    <section
      aria-labelledby="core-findings-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="core-findings-title" className="text-title-sm text-text">
          {t('findings.title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('findings.description')}</p>
      </header>
      {ORBIT_FRONTS.map((front) => {
        const items = findings.filter((finding) => finding.front === front);
        return (
          <div key={front} className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-label text-text">{t(`fronts.${front}`)}</h3>
              {writable && adding !== front ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setAdding(front)}>
                  {t('findings.add')}
                </Button>
              ) : null}
            </div>
            {adding === front ? (
              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <FindingForm
                  action={saveFindingAction.bind(null, engagementId, dealId)}
                  front={front}
                  onSaved={() => setAdding(null)}
                />
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(null)}>
                    {t('findings.cancel')}
                  </Button>
                </div>
              </div>
            ) : null}
            {items.length === 0 ? (
              <p className="text-body-sm text-text-tertiary">{t('findings.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((finding) => (
                  <FindingItem
                    key={finding.id}
                    finding={finding}
                    engagementId={engagementId}
                    dealId={dealId}
                    writable={writable}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
