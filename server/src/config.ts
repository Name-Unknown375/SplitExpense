import 'dotenv/config';

const secret = process.env.JWT_SECRET;

if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set in production');
    process.exit(1);
  }
  console.warn(
    '[warn] JWT_SECRET not set — using an insecure development default. ' +
      'Set JWT_SECRET in server/.env before sharing this instance.'
  );
}

export const JWT_SECRET = secret || 'dev-secret-change-me';

export const IS_PROD = process.env.NODE_ENV === 'production';

export const AUTH_COOKIE = 'token';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const authCookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_MS,
};

export const csrfCookieOptions = {
  httpOnly: false,
  secure: IS_PROD,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_MS,
};

