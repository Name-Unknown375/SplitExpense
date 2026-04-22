import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import pool from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticateToken);

// POST /api/groups - Create a new group
router.post(
  '/',
  [
    body('name').isLength({ min: 1, max: 255 }).trim(),
    body('description').optional().trim(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, description } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const groupResult = await client.query(
        'INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
        [name, description || null, req.userId]
      );

      const group = groupResult.rows[0];

      // Add creator as a member
      await client.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
        [group.id, req.userId]
      );

      await client.query('COMMIT');
      res.status(201).json({ group });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create group error:', error);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  }
);

// GET /api/groups - List user's groups
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT g.*,
              COUNT(DISTINCT gm.user_id) as member_count
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = $1)
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [req.userId]
    );

    res.json({ groups: result.rows });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/groups/:id - Get group details with members
router.get(
  '/:id',
  [param('id').isInt()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const groupId = parseInt(req.params.id);

    try {
      // Verify user is a member
      const memberCheck = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.userId]
      );

      if (memberCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not a member of this group' });
        return;
      }

      const groupResult = await pool.query(
        'SELECT * FROM groups WHERE id = $1',
        [groupId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({ error: 'Group not found' });
        return;
      }

      const membersResult = await pool.query(
        `SELECT u.id, u.username, u.email, gm.joined_at
         FROM group_members gm
         JOIN users u ON gm.user_id = u.id
         WHERE gm.group_id = $1
         ORDER BY gm.joined_at`,
        [groupId]
      );

      res.json({
        group: groupResult.rows[0],
        members: membersResult.rows,
      });
    } catch (error) {
      console.error('Get group error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/groups/:id/members - Add member to group (by username or email)
router.post(
  '/:id/members',
  [
    param('id').isInt(),
    body('identifier').isLength({ min: 1 }).trim(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const groupId = parseInt(req.params.id);
    const { identifier } = req.body;

    try {
      // Verify requester is a member of the group
      const memberCheck = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.userId]
      );

      if (memberCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not a member of this group' });
        return;
      }

      // Find user by email or username
      const userResult = await pool.query(
        'SELECT id, username, email FROM users WHERE email = $1 OR username = $1',
        [identifier]
      );

      if (userResult.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const targetUser = userResult.rows[0];

      // Check if already a member
      const existingMember = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, targetUser.id]
      );

      if (existingMember.rows.length > 0) {
        res.status(409).json({ error: 'User is already a member' });
        return;
      }

      await pool.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
        [groupId, targetUser.id]
      );

      res.status(201).json({
        member: { id: targetUser.id, username: targetUser.username, email: targetUser.email },
      });
    } catch (error) {
      console.error('Add member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/groups/:id/balances - Get simplified balances for a group
router.get(
  '/:id/balances',
  [param('id').isInt()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const groupId = parseInt(req.params.id);

    try {
      // Verify user is a member
      const memberCheck = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.userId]
      );

      if (memberCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not a member of this group' });
        return;
      }

      // Calculate net balance for each user in the group
      // Positive = owed money, Negative = owes money
      const result = await pool.query(
        `SELECT
          u.id as user_id,
          u.username,
          COALESCE(paid.total_paid, 0)
            - COALESCE(owed.total_owed, 0)
            + COALESCE(settled_out.total, 0)
            - COALESCE(settled_in.total, 0) AS net_balance
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        LEFT JOIN (
          SELECT paid_by, SUM(amount) as total_paid
          FROM expenses
          WHERE group_id = $1
          GROUP BY paid_by
        ) paid ON u.id = paid.paid_by
        LEFT JOIN (
          SELECT es.user_id, SUM(es.amount) as total_owed
          FROM expense_splits es
          JOIN expenses e ON es.expense_id = e.id
          WHERE e.group_id = $1
          GROUP BY es.user_id
        ) owed ON u.id = owed.user_id
        LEFT JOIN (
          SELECT from_user, SUM(amount) as total
          FROM settlements
          WHERE group_id = $1
          GROUP BY from_user
        ) settled_out ON u.id = settled_out.from_user
        LEFT JOIN (
          SELECT to_user, SUM(amount) as total
          FROM settlements
          WHERE group_id = $1
          GROUP BY to_user
        ) settled_in ON u.id = settled_in.to_user
        WHERE gm.group_id = $1
        ORDER BY net_balance DESC`,
        [groupId]
      );

      // Simplify debts: who should pay whom
      const balances = result.rows.map((r) => ({
        userId: r.user_id,
        username: r.username,
        netBalance: parseFloat(r.net_balance),
      }));

      // Calculate simplified transactions
      const transactions = simplifyDebts(balances);

      res.json({ balances, transactions });
    } catch (error) {
      console.error('Get balances error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

function simplifyDebts(
  balances: { userId: number; username: string; netBalance: number }[]
): { from: string; to: string; fromId: number; toId: number; amount: number }[] {
  const debtors = balances
    .filter((b) => b.netBalance < -0.01)
    .map((b) => ({ ...b, netBalance: Math.abs(b.netBalance) }))
    .sort((a, b) => b.netBalance - a.netBalance);

  const creditors = balances
    .filter((b) => b.netBalance > 0.01)
    .sort((a, b) => b.netBalance - a.netBalance);

  const transactions: { from: string; to: string; fromId: number; toId: number; amount: number }[] = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].netBalance, creditors[j].netBalance);
    const rounded = Math.round(amount * 100) / 100;

    if (rounded > 0) {
      transactions.push({
        from: debtors[i].username,
        fromId: debtors[i].userId,
        to: creditors[j].username,
        toId: creditors[j].userId,
        amount: rounded,
      });
    }

    debtors[i].netBalance -= amount;
    creditors[j].netBalance -= amount;

    if (debtors[i].netBalance < 0.01) i++;
    if (creditors[j].netBalance < 0.01) j++;
  }

  return transactions;
}

export default router;
