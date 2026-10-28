import { describe, expect, it } from 'vitest';
import { gettingStartedSteps, type GettingStartedSources } from './getting-started';

const BASE: GettingStartedSources = {
  toured: false,
  decides: true,
  pays: true,
  proposal: null,
  invoices: [],
  colleagues: 1,
};

const ids = (sources: GettingStartedSources) =>
  gettingStartedSteps(sources).map((step) => `${step.id}:${step.done ? 'done' : 'todo'}`);

describe('getting started', () => {
  it('always starts with the tour and asks the decision maker to invite the team', () => {
    expect(ids(BASE)).toEqual(['tour:todo', 'team:todo']);
    expect(ids({ ...BASE, toured: true, colleagues: 2 })).toEqual(['tour:done', 'team:done']);
  });

  it('follows the proposal, the contract and the first payment', () => {
    expect(
      ids({
        ...BASE,
        proposal: {
          status: 'sent',
          contractId: null,
          contractStatus: null,
          contractClientSigned: false,
        },
      }),
    ).toEqual(['tour:todo', 'proposal:todo', 'team:todo']);

    expect(
      ids({
        ...BASE,
        proposal: {
          status: 'accepted',
          contractId: 'c1',
          contractStatus: 'awaiting_signatures',
          contractClientSigned: false,
        },
        invoices: [{ status: 'sent' }],
      }),
    ).toEqual(['tour:todo', 'proposal:done', 'contract:todo', 'payment:todo', 'team:todo']);

    expect(
      ids({
        ...BASE,
        proposal: {
          status: 'accepted',
          contractId: 'c1',
          contractStatus: 'signed',
          contractClientSigned: true,
        },
        invoices: [{ status: 'paid' }, { status: 'sent' }],
      }),
    ).toEqual(['tour:todo', 'proposal:done', 'contract:done', 'payment:done', 'team:todo']);
  });

  it('leaves out what the user does not do', () => {
    expect(ids({ ...BASE, decides: false, pays: false, invoices: [{ status: 'sent' }] })).toEqual([
      'tour:todo',
    ]);
  });

  it('links the contract step to the contract', () => {
    const contract = gettingStartedSteps({
      ...BASE,
      proposal: {
        status: 'accepted',
        contractId: 'c1',
        contractStatus: 'awaiting_signatures',
        contractClientSigned: false,
      },
    }).find((step) => step.id === 'contract');
    expect(contract?.href).toBe('/portal/contracts/c1');
  });

  it('asks for the onboarding until every request is done', () => {
    expect(ids({ ...BASE, onboarding: { done: 1, total: 3 } })).toEqual([
      'tour:todo',
      'onboarding:todo',
      'team:todo',
    ]);
    expect(ids({ ...BASE, onboarding: { done: 3, total: 3 } })).toContain('onboarding:done');
    expect(ids({ ...BASE, onboarding: { done: 0, total: 0 } })).not.toContain('onboarding:todo');
  });
});
