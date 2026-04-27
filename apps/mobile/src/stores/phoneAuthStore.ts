import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

let _confirmation: FirebaseAuthTypes.ConfirmationResult | null = null;
let _phone: string = '';
let _fullName: string = '';

export const phoneAuthStore = {
  setConfirmation(c: FirebaseAuthTypes.ConfirmationResult, phone: string, fullName: string) {
    _confirmation = c;
    _phone = phone;
    _fullName = fullName;
  },
  getConfirmation(): FirebaseAuthTypes.ConfirmationResult | null {
    return _confirmation;
  },
  getPhone(): string {
    return _phone;
  },
  getFullName(): string {
    return _fullName;
  },
  clear() {
    _confirmation = null;
    _phone = '';
    _fullName = '';
  },
};
