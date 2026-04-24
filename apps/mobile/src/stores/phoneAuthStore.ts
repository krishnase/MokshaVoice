import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

let _confirmation: FirebaseAuthTypes.ConfirmationResult | null = null;
let _phone: string = '';

export const phoneAuthStore = {
  setConfirmation(c: FirebaseAuthTypes.ConfirmationResult, phone: string) {
    _confirmation = c;
    _phone = phone;
  },
  getConfirmation(): FirebaseAuthTypes.ConfirmationResult | null {
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
