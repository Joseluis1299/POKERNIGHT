import type { SettlementResult } from '../types';

import { formatCurrency } from '../lib/utils';

interface SettlementListProps {
  currency: string;
  emptyText?: string;
  settlements: SettlementResult[];
}

export default function SettlementList({
  currency,
  emptyText = 'No hace falta ningun pago entre jugadores.',
  settlements
}: SettlementListProps): JSX.Element {
  if (settlements.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {settlements.map((settlement, index) => (
        <div
          key={`${settlement.fromPlayerId}-${settlement.toPlayerId}-${settlement.amount}`}
          className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-200 shadow-lg shadow-slate-950/20"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-slate-400">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-white">
                {settlement.from}{' '}
                <span className="text-slate-400">debe</span>{' '}
                <span className="text-amber-200">{formatCurrency(settlement.amount, currency)}</span>{' '}
                <span className="text-slate-400">a</span> {settlement.to}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Paga {settlement.from} y cobra {settlement.to}.
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
