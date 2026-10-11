/** The ways in the sign-in and sign-up pages offer. */
export type SignInProvider = 'apple' | 'google';

/**
 * Sign in with Apple on the web: Firebase's Apple provider needs a Services
 * ID and a Sign in with Apple key (Apple's developer portal) before a browser
 * can use it — the iOS app needs only its bundle ID — so the button waits on
 * this flag.
 */
export const APPLE_SIGN_IN = process.env.NEXT_PUBLIC_ENABLE_APPLE_SIGNIN === 'true';

/**
 * What a failed provider sign-in means for the page: the reader closed the
 * window (say nothing), the address already belongs to an account made with
 * the other provider (say which way in), or anything else (try again).
 */
export function signInFailure(err: unknown): 'cancelled' | 'otherProvider' | 'failed' {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') {
    return 'cancelled';
  }
  if (code === 'auth/account-exists-with-different-credential') return 'otherProvider';
  return 'failed';
}
