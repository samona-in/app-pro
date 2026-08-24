import { extractOtpCode } from '../use-otp-autofill';

describe('extractOtpCode', () => {
  it('prefers the code following a keyword', () => {
    expect(extractOtpCode('SAMONA: your code is 482913. Do not share.', 6)).toBe('482913');
  });

  it('matches keyword variants case-insensitively', () => {
    expect(extractOtpCode('Your OTP is 551204', 6)).toBe('551204');
    expect(extractOtpCode('Passcode 9031 expires in 10 minutes', 4)).toBe('9031');
  });

  it('falls back to an isolated digit group without a keyword', () => {
    expect(extractOtpCode('482913 is your SAMONA verification', 6)).toBe('482913');
  });

  it('ignores digit runs longer than the expected length', () => {
    expect(extractOtpCode('Order 1234567890 shipped, code 771209', 6)).toBe('771209');
    expect(extractOtpCode('1234567890123', 6)).toBeNull();
  });

  it('returns null when no code of the right length exists', () => {
    expect(extractOtpCode('Welcome to SAMONA Pro!', 6)).toBeNull();
    expect(extractOtpCode('', 4)).toBeNull();
  });
});
