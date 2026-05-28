import type { AuthSession, AuthUser, PhoneVerificationInput, SignInInput, SignUpInput } from './types';

export interface IAuthProvider {
  signIn(input: SignInInput): Promise<AuthUser>;
  signUp(input: SignUpInput): Promise<AuthUser>;
  signOut(): Promise<void>;
  verifyPhone(input: PhoneVerificationInput): Promise<boolean>;
  currentUser(): Promise<AuthUser | null>;
  currentSession(): Promise<AuthSession | null>;
}
