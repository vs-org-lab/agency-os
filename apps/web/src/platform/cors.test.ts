import { describe, expect, it } from 'vitest';
import { corsHeaders } from './cors';

describe('corsHeaders', () => {
  it('allows only configured origins, with the methods and header the site uses', () => {
    const allowed = ['https://hubs.example.com'];
    expect(corsHeaders('https://hubs.example.com', allowed)).toEqual({
      'access-control-allow-origin': 'https://hubs.example.com',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '600',
      vary: 'Origin',
    });
    expect(corsHeaders('https://evil.example', allowed)).toEqual({ vary: 'Origin' });
    expect(corsHeaders(null, allowed)).toEqual({ vary: 'Origin' });
  });
});
