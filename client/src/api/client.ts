const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth
export const api = {
  auth: {
    register(data: { email: string; username: string; password: string }) {
      return request<{ user: { id: number; email: string; username: string }; token: string }>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify(data) }
      );
    },
    login(data: { email: string; password: string }) {
      return request<{ user: { id: number; email: string; username: string }; token: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify(data) }
      );
    },
    me() {
      return request<{ user: { id: number; email: string; username: string } }>('/auth/me');
    },
  },

  groups: {
    list() {
      return request<{ groups: GroupData[] }>('/groups');
    },
    get(id: number) {
      return request<{ group: GroupData; members: MemberData[] }>(`/groups/${id}`);
    },
    create(data: { name: string; description?: string }) {
      return request<{ group: GroupData }>('/groups', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    addMember(groupId: number, identifier: string) {
      return request<{ member: MemberData }>(`/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
    },
    getBalances(groupId: number) {
      return request<{ balances: BalanceData[]; transactions: TransactionData[] }>(
        `/groups/${groupId}/balances`
      );
    },
  },

  expenses: {
    listByGroup(groupId: number) {
      return request<{ expenses: ExpenseData[] }>(`/expenses/group/${groupId}`);
    },
    create(data: {
      groupId: number;
      description: string;
      amount: number;
      splitType: string;
      splits: { userId: number; value: number }[];
    }) {
      return request<{ expense: ExpenseData }>('/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    delete(id: number) {
      return request<{ message: string }>(`/expenses/${id}`, { method: 'DELETE' });
    },
  },

  settlements: {
    create(data: {
      groupId: number;
      fromUserId: number;
      toUserId: number;
      amount: number;
      note?: string;
    }) {
      return request<{ settlement: SettlementData }>('/settlements', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    listByGroup(groupId: number) {
      return request<{ settlements: SettlementData[] }>(
        `/settlements/group/${groupId}`
      );
    },
  },
};

// Types
export interface GroupData {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
  member_count?: string;
}

export interface MemberData {
  id: number;
  username: string;
  email: string;
  joined_at?: string;
}

export interface ExpenseData {
  id: number;
  group_id: number;
  paid_by: number;
  paid_by_username: string;
  description: string;
  amount: string;
  split_type: string;
  created_at: string;
  splits: { userId: number; username: string; amount: string }[];
}

export interface BalanceData {
  userId: number;
  username: string;
  netBalance: number;
}

export interface TransactionData {
  from: string;
  fromId: number;
  to: string;
  toId: number;
  amount: number;
}

export interface SettlementData {
  id: number;
  group_id: number;
  from_user: number;
  from_username: string;
  to_user: number;
  to_username: string;
  amount: string;
  note: string | null;
  created_at: string;
}
