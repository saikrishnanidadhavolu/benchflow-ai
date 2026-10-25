import { describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimits } from '../rate-limit';

describe('rateLimit', () => {
  it('allows up to the limit within a window, then blocks, then resets', () => {
    resetRateLimits();
    const t = 1_000_000;
    expect([1, 2, 3].map(() => rateLimit('k', 3, 1000, t))).toEqual([true, true, true]);
    expect(rateLimit('k', 3, 1000, t + 10)).toBe(false);
    expect(rateLimit('other', 3, 1000, t + 10)).toBe(true);
    expect(rateLimit('k', 3, 1000, t + 1001)).toBe(true);
  });
});
