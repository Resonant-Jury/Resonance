import type { Locale } from '@/lib/db/types';

export interface AuthUser {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  emailVerified: boolean;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: Date | null;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput extends SignInInput {
  handle: string;
  region: string;
  primaryLocale: Locale;
  phone?: string;
}

export interface PhoneVerificationInput {
  phone: string;
  code: string;
}
