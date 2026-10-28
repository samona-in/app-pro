/**
 * Phone number formatting utilities for Indian numbers (E.164).
 *
 * Ensures all Indian phone numbers use the correct E.164 format (+91XXXXXXXXXX).
 * Non-Indian or already-correctly-formatted international numbers are left unchanged.
 */
export function formatIndianPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }

  // If it already starts with +91, keep it unchanged
  if (trimmed.startsWith('+91')) {
    return trimmed;
  }

  // Remove all non-digit characters to analyze
  const digitsOnly = trimmed.replace(/\D/g, '');

  // If number contains only 10 digits, prepend +91
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  // If the number contains 12 digits starting with 91, prepend +
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }

  // For other cases (international numbers, etc.), don't add +91
  // If it doesn't start with + and has country code, check if it's non-Indian
  if (!trimmed.startsWith('+')) {
    // If it starts with 91 and is not 12 digits total in our cleaned form? 
    // Or if it's already a full international number without + - be cautious
    // The requirement says: "do not modify correctly formatted international phone numbers or add +91 to non-Indian numbers"
    // If it's 12 digits starting with 91, we've handled it above
    // Otherwise leave as-is or try to be safe
    return trimmed;
  }

  // Already has + but not +91 - keep unchanged (non-Indian international)
  return trimmed;
}

/**
 * Formats a phone number for use in tel: links.
 * Returns the formatted number or null if invalid/missing.
 */
export function formatPhoneForCall(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }

  // Check if it's an Indian number that needs formatting
  if (trimmed.startsWith('+91')) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');

  // 10 digits -> +91
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  // 12 digits starting with 91 -> +91...
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }

  // If it starts with + and is not +91, it's international - keep as-is (remove any extra chars except + and digits)
  if (trimmed.startsWith('+')) {
    const internationalDigits = trimmed.replace(/[^\d+]/g, '');
    // Must start with + followed by country code
    if (/^\+[1-9]\d{7,14}$/.test(internationalDigits)) {
      return internationalDigits;
    }
    return trimmed;
  }

  // If it's all digits and longer than 10, might be international without +
  // Don't assume +91 for non-Indian numbers
  if (digitsOnly.length > 10 && !digitsOnly.startsWith('91')) {
    // Could be international - but without +, tel: needs +. But requirement says don't add +91 to non-Indian numbers
    // Better to return as-is and let system handle, or just return cleaned digits if no country context
    return trimmed;
  }

  // Default: if it's not clearly international, and we can't format as Indian per rules, return null or original
  // But be defensive
  return trimmed;
}
