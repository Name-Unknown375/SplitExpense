import { Request } from 'express';

export interface AuthRequest extends Request {
  userId?: number;
}

export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  created_at: Date;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: Date;
}

export interface Expense {
  id: number;
  group_id: number;
  paid_by: number;
  description: string;
  amount: number;
  split_type: 'equal' | 'exact' | 'percentage' | 'shares';
  created_at: Date;
}

export interface ExpenseSplit {
  id: number;
  expense_id: number;
  user_id: number;
  amount: number;
}
