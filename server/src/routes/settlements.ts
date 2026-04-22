import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import pool from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticateToken);

// POST /api/settlements - Record a payment between two group members
router.post(
  '/',
  [
    body('groupId').isInt(),
    body('fromUserId').isInt(),
    body('toUserId').isInt(),
    body('amount').isFloat({ gt: 0 }),
    body('note').optional({ nullable: true }).isLength({ max: 500 }).trim(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { groupId, fromUserId, toUserId, amount, note } = req.body;
    const requesterId = req.userId!;

    if (fromUserId === toUserId) {
      res.status(400).json({ error: 'From and to users must be different' });
      return;
    }

    if (requesterId !== fromUserId && requesterId !== toUserId) {
      res
        .status(403)
        .json({ error: 'You can only record a settlement you are a party to' });
      return;
    }

    try {
      const memberResult = await pool.query(
        'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2)',
        [groupId, [fromUserId, toUserId]]
      );

      if (memberResult.rows.length !== 2) {
        res
          .status(400)
          .json({ error: 'Both users must be members of the group' });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const insert = await client.query(
          `INSERT INTO settlements (group_id, from_user, to_user, amount, note)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [groupId, fromUserId, toUserId, amount, note ?? null]
        );

        await client.query('COMMIT');
        res.status(201).json({ settlement: insert.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create settlement error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/settlements/group/:groupId - List settlements for a group (newest first)
router.get(
  '/group/:groupId',
  [param('groupId').isInt()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.params.groupId);

    try {
      const memberCheck = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.userId]
      );

      if (memberCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not a member of this group' });
        return;
      }

      const result = await pool.query(
        `SELECT s.id, s.group_id, s.amount, s.note, s.created_at,
                s.from_user, fu.username AS from_username,
                s.to_user,   tu.username AS to_username
         FROM settlements s
         JOIN users fu ON s.from_user = fu.id
         JOIN users tu ON s.to_user   = tu.id
         WHERE s.group_id = $1
         ORDER BY s.created_at DESC`,
        [groupId]
      );

      res.json({ settlements: result.rows });
    } catch (error) {
      console.error('List settlements error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
