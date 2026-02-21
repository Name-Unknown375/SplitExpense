import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  api,
  GroupData,
  MemberData,
  ExpenseData,
  BalanceData,
  TransactionData,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import AddExpense from '../components/AddExpense';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const groupId = parseInt(id!);

  const [group, setGroup] = useState<GroupData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [balances, setBalances] = useState<BalanceData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances'>('expenses');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberError, setAddMemberError] = useState('');

  useEffect(() => {
    loadAll();
  }, [groupId]);

  const loadAll = async () => {
    try {
      const [groupData, expenseData, balanceData] = await Promise.all([
        api.groups.get(groupId),
        api.expenses.listByGroup(groupId),
        api.groups.getBalances(groupId),
      ]);
      setGroup(groupData.group);
      setMembers(groupData.members);
      setExpenses(expenseData.expenses);
      setBalances(balanceData.balances);
      setTransactions(balanceData.transactions);
    } catch (error) {
      console.error('Failed to load group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddMemberError('');

    try {
      const data = await api.groups.addMember(groupId, addMemberInput.trim());
      setMembers([...members, data.member]);
      setAddMemberInput('');
    } catch (err) {
      setAddMemberError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.expenses.delete(expenseId);
      await loadAll();
    } catch (error) {
      console.error('Failed to delete expense:', error);
    }
  };

  const handleExpenseAdded = () => {
    setShowAddExpense(false);
    loadAll();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">Group not found or you don't have access.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link to="/" className="text-sm text-primary-600 hover:text-primary-700">
            &larr; Back to groups
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{group.name}</h1>
          {group.description && (
            <p className="text-sm text-gray-500">{group.description}</p>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Members section */}
        <section className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-3">
            Members ({members.length})
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {members.map((m) => (
              <span
                key={m.id}
                className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
              >
                {m.username}
                {m.id === user?.id && (
                  <span className="text-gray-400 ml-1">(you)</span>
                )}
              </span>
            ))}
          </div>
          <form onSubmit={handleAddMember} className="flex gap-2">
            <input
              type="text"
              value={addMemberInput}
              onChange={(e) => setAddMemberInput(e.target.value)}
              placeholder="Add member by username or email"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              type="submit"
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 text-sm font-medium"
            >
              Add
            </button>
          </form>
          {addMemberError && (
            <p className="text-red-600 text-sm mt-2">{addMemberError}</p>
          )}
        </section>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'expenses'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Expenses
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'balances'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Balances
          </button>
        </div>

        {/* Expenses tab */}
        {activeTab === 'expenses' && (
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Expenses</h2>
              <button
                onClick={() => setShowAddExpense(!showAddExpense)}
                className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 text-sm font-medium"
              >
                {showAddExpense ? 'Cancel' : 'Add Expense'}
              </button>
            </div>

            {showAddExpense && (
              <AddExpense
                groupId={groupId}
                members={members}
                onExpenseAdded={handleExpenseAdded}
              />
            )}

            {expenses.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <p className="text-gray-500">No expenses yet. Add one to get started!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="bg-white rounded-lg shadow-sm p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {expense.description}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Paid by{' '}
                          <span className="font-medium">
                            {expense.paid_by_username}
                          </span>{' '}
                          &middot;{' '}
                          {new Date(expense.created_at).toLocaleDateString()}
                        </p>
                        <div className="mt-2 text-xs text-gray-400">
                          Split ({expense.split_type}):{' '}
                          {expense.splits.map((s, i) => (
                            <span key={i}>
                              {s.username}: ${parseFloat(s.amount).toFixed(2)}
                              {i < expense.splits.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-lg font-semibold text-gray-900">
                          ${parseFloat(expense.amount).toFixed(2)}
                        </p>
                        {expense.paid_by === user?.id && (
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="text-xs text-red-500 hover:text-red-700 mt-1"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Balances tab */}
        {activeTab === 'balances' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Balances</h2>

            {/* Net balances */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-medium text-gray-900 mb-3">Net balances</h3>
              {balances.length === 0 ? (
                <p className="text-gray-500 text-sm">No expenses to calculate balances from.</p>
              ) : (
                <div className="space-y-2">
                  {balances.map((b) => (
                    <div key={b.userId} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        {b.username}
                        {b.userId === user?.id && (
                          <span className="text-gray-400 ml-1">(you)</span>
                        )}
                      </span>
                      <span
                        className={`text-sm font-medium ${
                          b.netBalance > 0
                            ? 'text-green-600'
                            : b.netBalance < 0
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {b.netBalance > 0 ? '+' : ''}
                        ${b.netBalance.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggested payments */}
            {transactions.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="font-medium text-gray-900 mb-3">
                  Suggested payments to settle up
                </h3>
                <div className="space-y-3">
                  {transactions.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-gray-50 rounded-md p-3"
                    >
                      <span className="text-sm">
                        <span className="font-medium text-gray-900">{t.from}</span>
                        <span className="text-gray-500"> pays </span>
                        <span className="font-medium text-gray-900">{t.to}</span>
                      </span>
                      <span className="font-semibold text-primary-700">
                        ${t.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
