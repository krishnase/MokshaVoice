import type { ConfirmationResult } from 'firebase/auth';

// Module-level singleton — holds Firebase ConfirmationResult between
// login.tsx and verify.tsx. Not Zustand because it's non-serializable and
// only lives for the duration of a single OTP flow.
let _confirmation: ConfirmationResult | null = null;
let _phone: string = '';

export const phoneAuthStore = {
  setConfirmation(c: ConfirmationResult, phone: string) {
    _confirmation = c;
    _phone = phone;
  },
  getConfirmation(): ConfirmationResult | null {
    return _confirmation;
  },
  getPhone(): string {
    return _phone;
  },
  clear() {
    _confirmation = null;
    _phone = '';
  },
};
