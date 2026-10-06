import { describe, expect, it } from 'vitest';
import en from '../src/messages/en.json';
import ptPT from '../src/messages/pt-PT.json';

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      entries.set(path, value);
    } else {
      for (const [nestedKey, nestedValue] of flatten(value, path)) {
        entries.set(nestedKey, nestedValue);
      }
    }
  }
  return entries;
}

const catalogues = { 'pt-PT': flatten(ptPT), en: flatten(en) };

describe('message catalogues', () => {
  it('pt-PT and en have identical key sets', () => {
    expect([...catalogues.en.keys()].sort()).toEqual([...catalogues['pt-PT'].keys()].sort());
  });

  it('no message value is empty', () => {
    for (const [locale, messages] of Object.entries(catalogues)) {
      for (const [key, value] of messages) {
        expect(value.trim(), `${locale} ${key}`).not.toBe('');
      }
    }
  });

  it('covers the foundation namespaces', () => {
    const namespaces = new Set([...catalogues['pt-PT'].keys()].map((key) => key.split('.')[0]));
    for (const namespace of ['app', 'auth', 'shell', 'states', 'sessions', 'errors']) {
      expect(namespaces.has(namespace), namespace).toBe(true);
    }
  });

  it('app name is Agency OS in both locales', () => {
    expect(catalogues['pt-PT'].get('app.name')).toBe('Agency OS');
    expect(catalogues.en.get('app.name')).toBe('Agency OS');
  });
});
