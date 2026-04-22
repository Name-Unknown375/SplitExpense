import { useState, FormEvent } from 'react';
import { api, MemberData } from '../api/client';

interface Props {
  groupId: number;
  members: MemberData[];
  onExpenseAdded: () => void;
}

export default function AddExpense({ groupId, members, onExpenseAdded }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState<'equal' | 'exact' | 'percentage' | 'shares'>('equal');
  const [splitValues, setSplitValues] = useState<Record<number, string>>({});
  const [selectedMembers, setSelectedMembers] = useState<number[]>(
    members.map((m) => m.id)
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleMember = (userId: number) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSplitValueChange = (userId: number, value: string) => {
    setSplitValues((prev) => ({ ...prev, [userId]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Enter a valid positive amount');
      return;
    }

    if (selectedMembers.length === 0) {
      setError('Select at least one member to split with');
      return;
    }

    let splits: { userId: number; value: number }[];

    if (splitType === 'equal') {
      splits = selectedMembers.map((userId) => ({
        userId,
        value: 1,
      }));
    } else {
      splits = selectedMembers.map((userId) => ({
        userId,
        value: parseFloat(splitValues[userId] || '0'),
      }));

      if (splits.some((s) => isNaN(s.value) || s.value < 0)) {
        setError('All split values must be valid non-negative numbers');
        return;
      }

      const sum = splits.reduce((acc, s) => acc + s.value, 0);

      if (splitType === 'exact' && Math.abs(sum - numAmount) > 0.01) {
        setError(
          `Exact amounts must sum to $${numAmount.toFixed(2)} (currently $${sum.toFixed(2)})`
        );
        return;
      }

      if (splitType === 'percentage' && Math.abs(sum - 100) > 0.01) {
        setError(`Percentages must sum to 100 (currently ${sum.toFixed(2)})`);
        return;
      }

      if (splitType === 'shares' && sum <= 0) {
        setError('Total shares must be greater than 0');
        return;
      }
    }

    setSubmitting(true);

    try {
      await api.expenses.create({
        groupId,
        description,
        amount: numAmount,
        splitType,
        splits,
      });
      onExpenseAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const numAmount = parseFloat(amount) || 0;

  const splitSum = selectedMembers.reduce(
    (acc, id) => acc + (parseFloat(splitValues[id] || '0') || 0),
    0
  );

  let splitSummary: { text: string; ok: boolean } | null = null;
  if (splitType === 'exact') {
    const remaining = numAmount - splitSum;
    const ok = Math.abs(remaining) <= 0.01;
    splitSummary = {
      text: `Entered: $${splitSum.toFixed(2)} / $${numAmount.toFixed(2)}${
        ok ? '' : ` — $${remaining.toFixed(2)} remaining`
      }`,
      ok,
    };
  } else if (splitType === 'percentage') {
    const ok = Math.abs(splitSum - 100) <= 0.01;
    splitSummary = {
      text: `Total: ${splitSum.toFixed(2)}% / 100%`,
      ok,
    };
  } else if (splitType === 'shares') {
    splitSummary = {
      text: `Total shares: ${splitSum}`,
      ok: splitSum > 0,
    };
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 mb-4 space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Dinner, Groceries, Uber"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Amount ($)</label>
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Split Type</label>
        <div className="flex gap-2 flex-wrap">
          {(['equal', 'exact', 'percentage', 'shares'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSplitType(type)}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                splitType === type
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Split between</label>
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <label className="flex items-center gap-2 flex-1">
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(member.id)}
                  onChange={() => toggleMember(member.id)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">{member.username}</span>
              </label>

              {splitType !== 'equal' && selectedMembers.includes(member.id) && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step={splitType === 'shares' ? '1' : '0.01'}
                    value={splitValues[member.id] || ''}
                    onChange={(e) => handleSplitValueChange(member.id, e.target.value)}
                    placeholder="0"
                    className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-500">
                    {splitType === 'exact'
                      ? '$'
                      : splitType === 'percentage'
                      ? '%'
                      : 'shares'}
                  </span>
                </div>
              )}

              {splitType === 'equal' && selectedMembers.includes(member.id) && numAmount > 0 && (
                <span className="text-sm text-gray-400">
                  ${(numAmount / selectedMembers.length).toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>

        {splitSummary && (
          <p
            className={`text-xs mt-2 ${
              splitSummary.ok ? 'text-gray-500' : 'text-red-600'
            }`}
          >
            {splitSummary.text}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? 'Adding...' : 'Add Expense'}
      </button>
    </form>
  );
}
