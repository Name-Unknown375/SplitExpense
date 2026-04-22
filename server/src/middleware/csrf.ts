import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { CSRF_COOKIE, CSRF_HEADER } from '../config';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
]);

export function csrfProtection(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }

  if (EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.header(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'CSRF token missing or invalid' });
    return;
  }

  next();
}
