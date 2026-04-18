import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scheduleValidate, verifyNow, _resetValidationStateForTests } from '../validate';

beforeEach(() => {
  _resetValidationStateForTests();
  vi.useFakeTimers();
});

describe('validation guards', () => {
  it('debounces blur-triggered validation by 800ms', async () => {
    const probe = vi.fn().mockResolvedValue({});
    scheduleValidate('openrouter', undefined, 'sk-1', probe);
    scheduleValidate('openrouter', undefined, 'sk-1', probe);
    scheduleValidate('openrouter', undefined, 'sk-1', probe);
    expect(probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(799);
    expect(probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('skips dedup: same key already validated within 3s throttle', async () => {
    const probe = vi.fn().mockResolvedValue({});
    scheduleValidate('openrouter', undefined, 'sk-1', probe);
    await vi.advanceTimersByTimeAsync(850);
    expect(probe).toHaveBeenCalledTimes(1);
    scheduleValidate('openrouter', undefined, 'sk-1', probe);
    await vi.advanceTimersByTimeAsync(850);
    expect(probe).toHaveBeenCalledTimes(1); // throttled, same key
  });

  it('aborts in-flight when key changes during debounce', async () => {
    const probe = vi.fn().mockResolvedValue({});
    scheduleValidate('openrouter', undefined, 'sk-1', probe);
    await vi.advanceTimersByTimeAsync(400);
    scheduleValidate('openrouter', undefined, 'sk-2', probe);
    await vi.advanceTimersByTimeAsync(900);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenLastCalledWith('sk-2', expect.any(AbortSignal));
  });

  it('locks out 60s after 3 consecutive auth failures', async () => {
    const probe = vi.fn().mockRejectedValue(Object.assign(new Error('401'), { status: 401 }));
    for (let i = 0; i < 3; i++) {
      scheduleValidate('openrouter', undefined, 'sk-bad-' + i, probe);
      await vi.advanceTimersByTimeAsync(5000);
    }
    expect(probe).toHaveBeenCalledTimes(3);
    scheduleValidate('openrouter', undefined, 'sk-bad-fourth', probe);
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_001);
    scheduleValidate('openrouter', undefined, 'sk-new', probe);
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe).toHaveBeenCalledTimes(4);
  });
});

describe('verifyNow', () => {
  it('bypasses debounce, awaits the probe, returns KeyInfo', async () => {
    const probe = vi.fn().mockResolvedValue({ label: 'test' });
    vi.useRealTimers();
    const result = await verifyNow('openrouter', undefined, 'sk-1', probe);
    expect(result).toEqual({ label: 'test' });
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
