import { describe, expect, it } from 'vitest';
import { normaliseHostname } from './hostname';

describe('normaliseHostname', () => {
  it('hostnames are normalised or refused', () => {
    expect(normaliseHostname('marca.cliente.com')).toBe('marca.cliente.com');
    expect(normaliseHostname('  Marca.Cliente.COM. ')).toBe('marca.cliente.com');
    expect(normaliseHostname('https://marca.cliente.com/path?x=1')).toBe('marca.cliente.com');
    expect(normaliseHostname('brand.client.co.uk')).toBe('brand.client.co.uk');

    for (const refused of [
      '',
      'cliente.com',
      'localhost',
      '127.0.0.1',
      '1.2.3.4.5',
      'marca_x.cliente.com',
      'marca.cliente.c',
      '-marca.cliente.com',
      'marca-.cliente.com',
      'marca..cliente.com',
      `${'a'.repeat(64)}.cliente.com`,
      `${'abcdefghi.'.repeat(26)}com`,
      'marca.cliente.com:8080',
      'user@marca.cliente.com',
      'marca cliente.com',
    ]) {
      expect(normaliseHostname(refused), refused).toBeNull();
    }
  });
});
