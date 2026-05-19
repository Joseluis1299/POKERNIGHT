import { useEffect, useMemo, useState } from 'react';

import type { PlayerSummary } from '../types';

import { formatCurrency, formatSignedCurrency, roundCurrency, sum, toNumber } from '../lib/utils';

interface CloseGameModalProps {
  currency: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (values: Array<{ finalAmount: number; playerId: string }>, allowMismatch: boolean) => Promise<void>;
  open: boolean;
  players: PlayerSummary[];
}

interface FinalAmountValue {
  finalAmount: number;
  playerId: string;
}

interface MismatchAdjustment {
  adjustedValues: FinalAmountValue[];
  adjustments: Record<string, number>;
}

type MismatchMode = 'adjust-winners' | 'force';

function distributeMismatchBetweenWinners(
  values: FinalAmountValue[],
  players: PlayerSummary[],
  difference: number
): MismatchAdjustment {
  const byPlayerId = players.reduce<Record<string, PlayerSummary>>((accumulator, player) => {
    accumulator[player.id] = player;
    return accumulator;
  }, {});
  const provisionalRows = values.map((value) => {
    const player = byPlayerId[value.playerId];
    const balance = roundCurrency(value.finalAmount - (player?.totalContributed ?? 0));

    return {
      balance,
      finalAmount: value.finalAmount,
      playerId: value.playerId
    };
  });
  const winners = provisionalRows.filter((row) => row.balance > 0);
  const fallbackTargets = provisionalRows
    .slice()
    .sort((first, second) => second.finalAmount - first.finalAmount)
    .slice(0, Math.max(1, Math.min(2, provisionalRows.length)));
  const targets = winners.length > 0 ? winners : fallbackTargets;
  const totalWeight = sum(
    targets.map((target) => (winners.length > 0 ? target.balance : 1))
  );
  const adjustments = values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value.playerId] = 0;
    return accumulator;
  }, {});
  let remaining = Math.abs(difference);

  if (targets.length === 0 || totalWeight <= 0) {
    return {
      adjustedValues: values,
      adjustments
    };
  }

  targets.forEach((target, index) => {
    const isLastTarget = index === targets.length - 1;
    const weight = winners.length > 0 ? target.balance : 1;
    const share = isLastTarget
      ? remaining
      : roundCurrency((Math.abs(difference) * weight) / totalWeight);
    const signedShare = difference > 0 ? -share : share;

    adjustments[target.playerId] = roundCurrency(adjustments[target.playerId] + signedShare);
    remaining = roundCurrency(remaining - share);
  });

  return {
    adjustedValues: values.map((value) => ({
      ...value,
      finalAmount: Math.max(0, roundCurrency(value.finalAmount + adjustments[value.playerId]))
    })),
    adjustments
  };
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
  const [mismatchMode, setMismatchMode] = useState<MismatchMode>('adjust-winners');

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
  const mismatchAdjustment = useMemo(
    () => distributeMismatchBetweenWinners(submittedValues, players, difference),
    [difference, players, submittedValues]
  );
  const valuesToConfirm =
    hasMismatch && mismatchMode === 'adjust-winners'
      ? mismatchAdjustment.adjustedValues
      : submittedValues;
  const adjustedTotal = sum(mismatchAdjustment.adjustedValues.map((value) => value.finalAmount));

  function handleConfirm(): void {
    void onConfirm(valuesToConfirm, hasMismatch && mismatchMode === 'force');
  }

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

          {hasMismatch ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-100">
                Las cuentas no cuadran. Como suele pasar cuando sobran o faltan fichas, puedes
                ajustar el descuadre entre los jugadores que van ganando.
              </p>

              <div className="mt-4 grid gap-3">
                <label className="flex cursor-pointer gap-3 rounded-2xl border border-emerald-500/20 bg-slate-950/60 p-4 text-sm text-slate-200">
                  <input
                    checked={mismatchMode === 'adjust-winners'}
                    className="mt-1 h-5 w-5 accent-emerald-500"
                    onChange={() => setMismatchMode('adjust-winners')}
                    type="radio"
                  />
                  <span>
                    <span className="block font-semibold text-white">
                      Ajustar automaticamente entre ganadores
                    </span>
                    <span className="mt-1 block text-slate-400">
                      Si sobra dinero, se resta proporcionalmente a los positivos. Si falta, se suma
                      proporcionalmente a los positivos. Total final:{' '}
                      {formatCurrency(adjustedTotal, currency)}.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-200">
                  <input
                    checked={mismatchMode === 'force'}
                    className="mt-1 h-5 w-5 accent-rose-500"
                    onChange={() => setMismatchMode('force')}
                    type="radio"
                  />
                  <span>
                    <span className="block font-semibold text-white">Cerrar sin ajustar</span>
                    <span className="mt-1 block text-slate-400">
                      Guarda exactamente lo introducido, aunque sobre o falte dinero.
                    </span>
                  </span>
                </label>
              </div>

              {mismatchMode === 'adjust-winners' ? (
                <div className="mt-4 space-y-2 text-sm">
                  {players
                    .filter((player) => Math.abs(mismatchAdjustment.adjustments[player.id] ?? 0) > 0.009)
                    .map((player) => (
                      <div
                        className="flex items-center justify-between gap-4 rounded-xl bg-slate-950/60 px-3 py-2 text-slate-200"
                        key={player.id}
                      >
                        <span>{player.name}</span>
                        <span
                          className={
                            (mismatchAdjustment.adjustments[player.id] ?? 0) >= 0
                              ? 'font-semibold text-emerald-300'
                              : 'font-semibold text-rose-300'
                          }
                        >
                          {formatSignedCurrency(mismatchAdjustment.adjustments[player.id] ?? 0, currency)}
                        </span>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              className="primary-button flex-1"
              disabled={loading}
              onClick={handleConfirm}
              type="button"
            >
              {loading
                ? 'Cerrando partida...'
                : hasMismatch
                  ? mismatchMode === 'adjust-winners'
                    ? 'Ajustar descuadre y cerrar'
                    : 'Forzar cierre igualmente'
                  : 'Confirmar y calcular pagos'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
