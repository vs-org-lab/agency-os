import { describe, expect, it } from 'vitest';
import { runCallBookedFlow, type CallFlowDeps, type FlowStep } from './call-flow';

class StepInterrupt extends Error {}

type Clock = { now: Date };

function replayingStep(clock: Clock): FlowStep {
  const memo = new Map<string, unknown>();
  return {
    async run<T>(id: string, operation: () => Promise<T>): Promise<T> {
      if (memo.has(id)) return memo.get(id) as T;
      memo.set(id, await operation());
      throw new StepInterrupt(id);
    },
    async sleepUntil(id: string, at: Date): Promise<void> {
      if (memo.has(id)) return;
      memo.set(id, null);
      if (at.getTime() > clock.now.getTime()) clock.now = at;
      throw new StepInterrupt(id);
    },
  };
}

async function replay<T>(execute: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      if (!(error instanceof StepInterrupt)) throw error;
    }
  }
  throw new Error('Flow did not complete');
}

const STARTS_AT = new Date('2026-10-15T09:00:00Z');
const ENDS_AT = new Date('2026-10-15T09:45:00Z');

function recordingDeps(clock: Clock) {
  const reminders: Date[] = [];
  const outcomeChecks: Date[] = [];
  const confirmations: Date[] = [];
  const coreChecks: string[] = [];
  const deps: CallFlowDeps = {
    now: () => clock.now,
    ensureCore: async (callId) => {
      coreChecks.push(callId);
      return true;
    },
    syncCall: async () => ENDS_AT.toISOString(),
    sendConfirmation: async () => {
      confirmations.push(clock.now);
      return true;
    },
    sendReminder: async () => {
      reminders.push(clock.now);
      return 'sent';
    },
    checkOutcome: async () => {
      outcomeChecks.push(clock.now);
      return true;
    },
  };
  return { deps, reminders, outcomeChecks, confirmations, coreChecks };
}

describe('runCallBookedFlow', () => {
  it('sends the day-before and hour-before reminders across replays', async () => {
    const clock: Clock = { now: new Date('2026-10-12T10:00:00Z') };
    const { deps, reminders, outcomeChecks, confirmations, coreChecks } = recordingDeps(clock);
    const step = replayingStep(clock);

    await replay(() => runCallBookedFlow({ callId: 'call-1', startsAt: STARTS_AT }, step, deps));

    expect(confirmations).toHaveLength(1);
    expect(coreChecks).toEqual(['call-1']);
    expect(reminders).toEqual([new Date('2026-10-14T09:00:00Z'), new Date('2026-10-15T08:00:00Z')]);
    expect(outcomeChecks).toEqual([new Date('2026-10-15T11:45:00Z')]);
  });

  it('skips a reminder whose moment passed before the booking', async () => {
    const clock: Clock = { now: new Date('2026-10-14T20:00:00Z') };
    const { deps, reminders } = recordingDeps(clock);
    const step = replayingStep(clock);

    await replay(() => runCallBookedFlow({ callId: 'call-1', startsAt: STARTS_AT }, step, deps));

    expect(reminders).toEqual([new Date('2026-10-15T08:00:00Z')]);
  });

  it('stops when the call no longer exists', async () => {
    const clock: Clock = { now: new Date('2026-10-12T10:00:00Z') };
    const { deps, confirmations } = recordingDeps(clock);
    deps.syncCall = async () => null;
    const step = replayingStep(clock);

    const result = await replay(() =>
      runCallBookedFlow({ callId: 'call-1', startsAt: STARTS_AT }, step, deps),
    );

    expect(result).toEqual({ skipped: true });
    expect(confirmations).toHaveLength(0);
  });
});
