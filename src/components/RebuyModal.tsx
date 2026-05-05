import { useEffect, useState } from 'react';

import { formatCurrency, toNumber } from '../lib/utils';

interface RebuyModalProps {
  currency: string;
  defaultAmount: number;
  loading: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
  open: boolean;
  playerName: string;
}

export default function RebuyModal({
  currency,
  defaultAmount,
  loading,
  onClose,
  onConfirm,
  open,
  playerName
}: RebuyModalProps): JSX.Element | null {
  const [amount, setAmount] = useState(defaultAmount.toFixed(2));

  useEffect(() => {
    if (open) {
      setAmount(defaultAmount.toFixed(2));
    }
  }, [defaultAmount, open]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsedAmount = toNumber(amount);

    if (parsedAmount <= 0) {
      return;
    }

    const confirmed = window.confirm(
      `Quieres anadir una recompra de ${formatCurrency(parsedAmount, currency)} para ${playerName}?`
    );

    if (!confirmed) {
      return;
    }

    await onConfirm(parsedAmount);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center">
      <form className="glass-card w-full max-w-md p-6" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Recompra</p>
            <h3 className="mt-2 text-2xl font-bold text-white">{playerName}</h3>
          </div>
          <button className="secondary-button px-4" onClick={onClose} type="button">
            Cancelar
          </button>
        </div>

        <label className="mt-6 block text-sm font-medium text-slate-300">
          Importe
          <div className="field-shell mt-2">
            <input
              autoFocus
              className="input-base"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder={defaultAmount.toFixed(2)}
              value={amount}
            />
          </div>
        </label>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
          La compra inicial por defecto de esta sala es {formatCurrency(defaultAmount, currency)}.
        </div>

        <button className="primary-button mt-6 w-full" disabled={loading} type="submit">
          {loading ? 'Guardando recompra...' : 'Guardar recompra'}
        </button>
      </form>
    </div>
  );
}
