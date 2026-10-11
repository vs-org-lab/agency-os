import { describe, expect, it } from 'vitest';
import { documentActions, statusAfterNewVersion } from './lifecycle';
import { documentLink } from './links';

describe('documentLink', () => {
  it('links are validated by kind', () => {
    expect(
      documentLink('figma', ' https://www.figma.com/design/AbC123/Estrategia?node-id=1-2 '),
    ).toBe('https://www.figma.com/design/AbC123/Estrategia?node-id=1-2');
    expect(documentLink('figma', 'https://figma.com.evil.io/design/AbC123/x')).toBeNull();
    expect(documentLink('figma', 'https://example.com/briefing')).toBeNull();
    expect(documentLink('link', 'https://example.com/briefing')).toBe(
      'https://example.com/briefing',
    );
    expect(documentLink('link', 'http://example.com/briefing')).toBeNull();
    expect(documentLink('link', 'javascript:alert(1)')).toBeNull();
    expect(documentLink('link', 'https://')).toBeNull();
    expect(documentLink('link', `https://example.com/${'a'.repeat(2000)}`)).toBeNull();
  });
});

describe('documentActions', () => {
  it('actions follow the document state', () => {
    expect(
      documentActions({ status: 'draft', everApproved: false, pendingApproval: false }),
    ).toEqual({
      share: true,
      withdraw: false,
      remove: true,
      requestApproval: false,
    });
    expect(
      documentActions({ status: 'with_client', everApproved: false, pendingApproval: false }),
    ).toEqual({ share: false, withdraw: true, remove: true, requestApproval: true });
    expect(
      documentActions({ status: 'with_client', everApproved: false, pendingApproval: true }),
    ).toEqual({ share: false, withdraw: true, remove: true, requestApproval: false });
    expect(
      documentActions({ status: 'approved', everApproved: true, pendingApproval: false }),
    ).toEqual({
      share: false,
      withdraw: false,
      remove: false,
      requestApproval: false,
    });
    expect(
      documentActions({ status: 'draft', everApproved: true, pendingApproval: false }),
    ).toEqual({
      share: true,
      withdraw: false,
      remove: false,
      requestApproval: false,
    });
  });

  it('a new version reopens an approved document', () => {
    expect(statusAfterNewVersion('approved')).toBe('draft');
    expect(statusAfterNewVersion('with_client')).toBe('with_client');
    expect(statusAfterNewVersion('draft')).toBe('draft');
  });
});
