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
