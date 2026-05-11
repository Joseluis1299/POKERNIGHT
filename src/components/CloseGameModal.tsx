import { useEffect, useMemo, useState } from 'react';

import type { PlayerSummary } from '../types';

import { formatCurrency, roundCurrency, sum, toNumber } from '../lib/utils';

interface CloseGameModalProps {
  currency: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (values: Array<{ finalAmount: number; playerId: string }>, allowMismatch: boolean) => Promise<void>;
  open: boolean;
  players: PlayerSummary[];
}

export default function CloseGameModal({
  currency,
  loading,
  onClose,
  onConfirm,
  open,
  players
}: CloseGameModalProps): JSX.Element | null {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const initialValues = players.reduce<Record<string, string>>((accumulator, player) => {
      accumulator[player.id] = (player.final_amount ?? player.totalContributed).toFixed(2);
      return accumulator;
    }, {});

    setValues(initialValues);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
    };
  }, [open, players]);

  const expectedTotal = useMemo(
    () => sum(players.map((player) => player.totalContributed)),
    [players]
  );
  const submittedValues = useMemo(
    () =>
      players.map((player) => ({
        playerId: player.id,
        finalAmount: roundCurrency(toNumber(values[player.id] ?? '0'))
      })),
    [players, values]
  );
  const enteredTotal = useMemo(
    () => sum(submittedValues.map((value) => value.finalAmount)),
    [submittedValues]
  );
  const difference = roundCurrency(enteredTotal - expectedTotal);
  const hasMismatch = Math.abs(difference) > 0.009;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-4 backdrop-blur-sm sm:py-8">
      <div className="mx-auto flex min-h-full w-full items-start justify-center">
        <div className="glass-card w-full max-w-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Cerrar partida</p>
              <h3 className="mt-2 text-2xl font-bold text-white">Importes finales</h3>
            </div>
            <button className="secondary-button px-4" onClick={onClose} type="button">
              Cancelar
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            {players.map((player) => (
              <label
                className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"
                key={player.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div>
                    <p className="font-semibold text-white">{player.name}</p>
                    <p className="text-sm text-slate-400">
                      Aportado {formatCurrency(player.totalContributed, currency)}
                    </p>
                  </div>
                  <div className="field-shell w-full sm:w-36">
                    <input
                      className="input-base text-right"
                      inputMode="decimal"
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [player.id]: event.target.value
                        }))
                      }
                      value={values[player.id] ?? ''}
                    />
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
            <p>Bote esperado: {formatCurrency(expectedTotal, currency)}</p>
            <p>Total introducido: {formatCurrency(enteredTotal, currency)}</p>
            {hasMismatch ? (
              <p className="mt-2 text-rose-300">
                Descuadre total: se esperaba {formatCurrency(expectedTotal, currency)}, pero se ha
                introducido {formatCurrency(enteredTotal, currency)}. Diferencia:{' '}
                {formatCurrency(Math.abs(difference), currency)}
              </p>
            ) : (
              <p className="mt-2 text-emerald-300">Los totales cuadran. Los pagos ya se pueden calcular.</p>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              className="primary-button flex-1"
              disabled={loading}
              onClick={() => void onConfirm(submittedValues, hasMismatch)}
              type="button"
            >
              {loading
                ? 'Cerrando partida...'
                : hasMismatch
                  ? 'Forzar cierre igualmente'
                  : 'Confirmar y calcular pagos'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
