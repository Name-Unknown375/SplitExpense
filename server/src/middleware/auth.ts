import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../types';
import { AUTH_COOKIE, JWT_SECRET } from '../config';

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.[AUTH_COOKIE];

  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
