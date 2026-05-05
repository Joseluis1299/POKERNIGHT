import type { SettlementResult } from '../types';

import { formatCurrency } from '../lib/utils';

interface SettlementListProps {
  currency: string;
  settlements: SettlementResult[];
}

export default function SettlementList({
  currency,
  settlements
}: SettlementListProps): JSX.Element {
  if (settlements.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        No hace falta ningun pago entre jugadores.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {settlements.map((settlement) => (
        <div
          key={`${settlement.fromPlayerId}-${settlement.toPlayerId}-${settlement.amount}`}
          className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-200"
        >
          <span className="font-semibold text-rose-200">{settlement.from}</span> paga{' '}
          <span className="font-semibold text-amber-200">
            {formatCurrency(settlement.amount, currency)}
          </span>{' '}
          a <span className="font-semibold text-emerald-200">{settlement.to}</span>
        </div>
      ))}
    </div>
  );
}
