import { fail } from './errors.mjs';

// Conservative project defaults, not Hue's published per-second allowance.
// Process-local only; production must use an atomic shared per-account budget.
export class RequestBudget {
  #day;
  #used = 0;
  #next = 0;
  #blockedUntil = 0;
  constructor({ now = Date.now, daily = 1000, intervalMs = 1000 } = {}) {
    if (!Number.isInteger(daily) || daily < 1 || !Number.isFinite(intervalMs) || intervalMs < 1) fail('INVALID_INPUT');
    this.now = now;
    this.daily = daily;
    this.intervalMs = intervalMs;
  }
  take() {
    const now = this.now();
    const day = Math.floor(now / 86_400_000);
    if (day !== this.#day) { this.#day = day; this.#used = 0; }
    const wait = Math.max(this.#next, this.#blockedUntil) - now;
    if (wait > 0) fail('RATE_LIMITED', Math.ceil(wait / 1000));
    if (this.#used >= this.daily) fail('DAILY_BUDGET_EXCEEDED');
    this.#used += 1;
    this.#next = now + this.intervalMs;
  }
  backoff(retryAfter) {
    let milliseconds;
    if (typeof retryAfter === 'string' && /^\d+(\.\d+)?$/.test(retryAfter)) {
      milliseconds = Number(retryAfter) * 1000;
    } else if (typeof retryAfter === 'string') {
      milliseconds = Date.parse(retryAfter) - this.now();
    }
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) milliseconds = 60_000;
    // Never shorten a valid Retry-After. No automatic retries, especially writes.
    this.#blockedUntil = Math.max(this.#blockedUntil, this.now() + milliseconds);
    return Math.ceil(milliseconds / 1000);
  }
}
