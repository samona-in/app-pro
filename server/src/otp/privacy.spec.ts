import { hashPhone, phoneLast2 } from './privacy';

describe('OTP telemetry privacy helpers', () => {
  const secret = 'a-server-only-secret';

  it('hashes the same number to the same digest', () => {
    expect(hashPhone('+919876543210', secret)).toBe(hashPhone('+919876543210', secret));
  });

  it('produces a different digest for a different number', () => {
    expect(hashPhone('+919876543210', secret)).not.toBe(hashPhone('+919876543211', secret));
  });

  it('produces a different digest under a different secret', () => {
    expect(hashPhone('+919876543210', secret)).not.toBe(hashPhone('+919876543210', 'other-secret'));
  });

  it('never returns the number itself', () => {
    expect(hashPhone('+919876543210', secret)).not.toContain('9876543210');
    expect(hashPhone('+919876543210', secret)).toHaveLength(64);
  });

  it('keeps only the last two digits, padded for short input', () => {
    expect(phoneLast2('+919876543210')).toBe('10');
    expect(phoneLast2('+91 98765 43210')).toBe('10');
    expect(phoneLast2('7')).toBe('07');
  });
});
