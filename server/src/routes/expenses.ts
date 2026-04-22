import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import pool from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticateToken);

// POST /api/expenses - Create a new expense
router.post(
  '/',
  [
    body('groupId').isInt(),
    body('description').isLength({ min: 1, max: 500 }).trim(),
    body('amount').isFloat({ gt: 0 }),
    body('splitType').isIn(['equal', 'exact', 'percentage', 'shares']),
    body('splits').isArray({ min: 1 }),
    body('splits.*.userId').isInt(),
    body('splits.*.value').isFloat({ min: 0 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { groupId, description, amount, splitType, splits } = req.body;
    const paidBy = req.userId!;

    try {
      // Verify payer is a member of the group
      const memberCheck = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, paidBy]
      );

      if (memberCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not a member of this group' });
        return;
      }

      // Verify all split users are members
      const splitUserIds: number[] = splits.map((s: { userId: number }) => s.userId);
      const memberResult = await pool.query(
        'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2)',
        [groupId, splitUserIds]
      );

      if (memberResult.rows.length !== splitUserIds.length) {
        res.status(400).json({ error: 'All split users must be group members' });
        return;
      }

      // Calculate actual split amounts
      const splitAmounts = calculateSplits(amount, splitType, splits);

      if (!splitAmounts) {
        res.status(400).json({ error: 'Invalid split configuration' });
        return;
      }

      // Verify splits add up to total
      const splitTotal = splitAmounts.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(splitTotal - amount) > 0.01) {
        res.status(400).json({
          error: `Split amounts (${splitTotal.toFixed(2)}) don't match expense total (${amount})`,
        });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const expenseResult = await client.query(
          `INSERT INTO expenses (group_id, paid_by, description, amount, split_type)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [groupId, paidBy, description, amount, splitType]
        );

        const expense = expenseResult.rows[0];

        // Insert splits
        for (const split of splitAmounts) {
          await client.query(
            'INSERT INTO expense_splits (expense_id, user_id, amount) VALUES ($1, $2, $3)',
            [expense.id, split.userId, split.amount]
          );
        }

        await client.query('COMMIT');

        res.status(201).json({ expense, splits: splitAmounts });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/expenses/group/:groupId - List expenses for a group
router.get(
  '/group/:groupId',
  [param('groupId').isInt()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const groupId = parseInt(req.params.groupId);

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

      const result = await pool.query(
        `SELECT e.*, u.username as paid_by_username,
                json_agg(json_build_object(
                  'userId', es.user_id,
                  'username', su.username,
                  'amount', es.amount
                )) as splits
         FROM expenses e
         JOIN users u ON e.paid_by = u.id
         JOIN expense_splits es ON e.id = es.expense_id
         JOIN users su ON es.user_id = su.id
         WHERE e.group_id = $1
         GROUP BY e.id, u.username
         ORDER BY e.created_at DESC`,
        [groupId]
      );

      res.json({ expenses: result.rows });
    } catch (error) {
      console.error('List expenses error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/expenses/:id - Delete an expense
router.delete(
  '/:id',
  [param('id').isInt()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const expenseId = parseInt(req.params.id);

    try {
      const expenseResult = await pool.query(
        'SELECT * FROM expenses WHERE id = $1',
        [expenseId]
      );

      if (expenseResult.rows.length === 0) {
        res.status(404).json({ error: 'Expense not found' });
        return;
      }

      const expense = expenseResult.rows[0];

      // Only the person who paid can delete
      if (expense.paid_by !== req.userId) {
        res.status(403).json({ error: 'Only the payer can delete this expense' });
        return;
      }

      await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
      res.json({ message: 'Expense deleted' });
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

function calculateSplits(
  totalAmount: number,
  splitType: string,
  splits: { userId: number; value: number }[]
): { userId: number; amount: number }[] | null {
  switch (splitType) {
    case 'equal': {
      const perPerson = Math.floor((totalAmount / splits.length) * 100) / 100;
      const remainder = Math.round((totalAmount - perPerson * splits.length) * 100) / 100;

      return splits.map((s, i) => ({
        userId: s.userId,
        amount: i === 0 ? perPerson + remainder : perPerson,
      }));
    }

    case 'exact': {
      return splits.map((s) => ({
        userId: s.userId,
        amount: Math.round(s.value * 100) / 100,
      }));
    }

    case 'percentage': {
      const totalPercent = splits.reduce((sum, s) => sum + s.value, 0);
      if (Math.abs(totalPercent - 100) > 0.01) return null;

      return splits.map((s) => ({
        userId: s.userId,
        amount: Math.round((totalAmount * s.value) / 100 * 100) / 100,
      }));
    }

    case 'shares': {
      const totalShares = splits.reduce((sum, s) => sum + s.value, 0);
      if (totalShares <= 0) return null;

      return splits.map((s) => ({
        userId: s.userId,
        amount: Math.round((totalAmount * s.value) / totalShares * 100) / 100,
      }));
    }

    default:
      return null;
  }
}

export default router;
