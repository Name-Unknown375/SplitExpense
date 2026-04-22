import { useState, FormEvent } from 'react';
import { api, MemberData } from '../api/client';

interface Props {
  groupId: number;
  members: MemberData[];
  currentUserId: number;
  prefill?: { fromId: number; toId: number; amount: number };
  onClose: () => void;
  onSettled: () => void;
}

export default function SettleUpModal({
  groupId,
  members,
  currentUserId,
  prefill,
  onClose,
  onSettled,
}: Props) {
  const [fromId, setFromId] = useState<number>(prefill?.fromId ?? currentUserId);
  const [toId, setToId] = useState<number | ''>(prefill?.toId ?? '');
  const [amount, setAmount] = useState<string>(
    prefill?.amount != null ? prefill.amount.toFixed(2) : ''
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (toId === '' || fromId === toId) {
      setError('Choose two different people');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Enter a valid positive amount');
      return;
    }

    if (fromId !== currentUserId && toId !== currentUserId) {
      setError('You can only record a payment you are a party to');
      return;
    }

    setSubmitting(true);
    try {
      await api.settlements.create({
        groupId,
        fromUserId: fromId,
        toUserId: toId as number,
        amount: numAmount,
        note: note.trim() || undefined,
      });
      onSettled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">Record a payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">From</label>
            <select
              value={fromId}
              onChange={(e) => setFromId(parseInt(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.username}
                  {m.id === currentUserId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">To</label>
            <select
              value={toId}
              onChange={(e) =>
                setToId(e.target.value === '' ? '' : parseInt(e.target.value))
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Select a recipient</option>
              {members
                .filter((m) => m.id !== fromId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.username}
                    {m.id === currentUserId ? ' (you)' : ''}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Amount
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Note <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Venmo, cash, etc."
              maxLength={500}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Recording...' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
