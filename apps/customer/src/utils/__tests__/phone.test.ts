import { toLocalDigits } from '../phone';

const india = { dial: '91', maxLocalDigits: 10 };
const us = { dial: '1', maxLocalDigits: 10 };
const uk = { dial: '44', maxLocalDigits: 10 };
const singapore = { dial: '65', maxLocalDigits: 8 };

describe('toLocalDigits', () => {
  it('keeps a plain national number as typed', () => {
    expect(toLocalDigits('9876543210', india)).toBe('9876543210');
  });

  it('drops spaces, dashes and parentheses', () => {
    expect(toLocalDigits('98765 43210', india)).toBe('9876543210');
    expect(toLocalDigits('(987) 654-3210', india)).toBe('9876543210');
  });

  it('strips a pasted E.164 dial code instead of keeping it', () => {
    expect(toLocalDigits('+91 98765 43210', india)).toBe('9876543210');
    expect(toLocalDigits('+1 (415) 555-2671', us)).toBe('4155552671');
  });

  it('strips the national trunk zero before applying the length cap', () => {
    // The bug this guards: a naive cap turned this into "+910987654321".
    expect(toLocalDigits('09876543210', india)).toBe('9876543210');
    expect(toLocalDigits('07911 123456', uk)).toBe('7911123456');
  });

  it('handles a pasted number that carries both the trunk zero and the code', () => {
    expect(toLocalDigits('+91 09876543210', india)).toBe('9876543210');
    expect(toLocalDigits('0091 9876543210', india)).toBe('9876543210');
  });

  it('does not strip a dial code from a number that is itself the full length', () => {
    // An Indian number beginning with 91 stays intact at exactly 10 digits.
    expect(toLocalDigits('9123456789', india)).toBe('9123456789');
  });

  it('caps numbers that are too long for the selected country', () => {
    expect(toLocalDigits('9876543210', singapore)).toBe('98765432');
  });

  it('returns an empty string when there are no digits', () => {
    expect(toLocalDigits('', india)).toBe('');
    expect(toLocalDigits('+', india)).toBe('');
  });
});
