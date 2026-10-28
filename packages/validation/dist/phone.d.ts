/**
 * Phone number formatting utilities for Indian numbers (E.164).
 *
 * Ensures all Indian phone numbers use the correct E.164 format (+91XXXXXXXXXX).
 * Non-Indian or already-correctly-formatted international numbers are left unchanged.
 */
export declare function formatIndianPhoneNumber(phone: string | null | undefined): string | null;
/**
 * Formats a phone number for use in tel: links.
 * Returns the formatted number or null if invalid/missing.
 */
export declare function formatPhoneForCall(phone: string | null | undefined): string | null;
//# sourceMappingURL=phone.d.ts.map