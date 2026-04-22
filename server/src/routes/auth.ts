import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import pool from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest } from '../types';
import {
  JWT_SECRET,
  AUTH_COOKIE,
  CSRF_COOKIE,
  authCookieOptions,
  csrfCookieOptions,
} from '../config';

const router = Router();
const SALT_ROUNDS = 12;

function issueSession(
  res: Response,
  user: { id: number; email: string; username: string; created_at?: Date }
) {
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const csrf = crypto.randomBytes(32).toString('hex');
  res.cookie(AUTH_COOKIE, token, authCookieOptions);
  res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions);
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('username').isLength({ min: 3, max: 100 }).trim(),
    body('password').isLength({ min: 10 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, username, password } = req.body;

    try {
      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existing.rows.length > 0) {
        res.status(409).json({ error: 'Email or username already taken' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const result = await pool.query(
        'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
        [email, username, passwordHash]
      );

      const user = result.rows[0];
      issueSession(res, user);
      res.status(201).json({ user });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    try {
      const result = await pool.query(
        'SELECT id, email, username, password_hash, created_at FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      issueSession(res, user);
      const { password_hash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get(
  '/me',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await pool.query(
        'SELECT id, email, username, created_at FROM users WHERE id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user: result.rows[0] });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
