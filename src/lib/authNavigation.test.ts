import { describe, expect, it } from 'vitest';
import { normalizePathname, pathEquals } from './authNavigation';

describe('auth navigation loop protection', () => {
  it('treats trailing slashes as the same path', () => {
    expect(normalizePathname('/signup/')).toBe('/signup');
    expect(pathEquals('/signup', '/signup/')).toBe(true);
    expect(pathEquals('/login', '/signup')).toBe(false);
  });

  it('strips query from path comparison so /signup?x=1 is still signup', () => {
    expect(normalizePathname('/signup?next=1')).toBe('/signup');
    expect(pathEquals('/signup?foo=1', '/signup')).toBe(true);
  });
});
