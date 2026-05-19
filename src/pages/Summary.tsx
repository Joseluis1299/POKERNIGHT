import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import LiveIndicator from '../components/LiveIndicator';
import PlayerAvatar from '../components/PlayerAvatar';
import SettlementList from '../components/SettlementList';
import StatusBadge from '../components/StatusBadge';
import { useDinnerExpenses } from '../hooks/useDinnerExpenses';
import { useLocalPlayer } from '../hooks/useLocalPlayer';
import { usePlayers } from '../hooks/usePlayers';
import { useRebuys } from '../hooks/useRebuys';
import { useRoom } from '../hooks/useRoom';
import { calculateDinnerBalances } from '../lib/dinner';
import { calculateSettlementsFromBalances } from '../lib/settlements';
import { supabase } from '../lib/supabase';
import {
  buildSummaryText,
  buildWhatsappShareUrl,
  copyToClipboard,
  formatCurrency,
  formatSignedCurrency,
  formatTime,
  getErrorMessage,
  roundCurrency,
  sum,
  toNumber
} from '../lib/utils';
import type { DinnerExpense, PlayerSummary, RealtimeState, SettlementBalanceInput, SettlementResult } from '../types';

function aggregateRealtimeState(states: RealtimeState[]): RealtimeState {
  if (states.some((state) => state === 'error')) {
    return 'error';
  }

  if (states.every((state) => state === 'live')) {
    return 'live';
  }

  if (states.some((state) => state === 'offline')) {
    return 'offline';
  }

  return 'connecting';
}

interface GlobalBalanceRow {
  dinnerBalance: number;
  globalBalance: number;
  id: string;
  name: string;
  pokerBalance: number;
}

function combineBalances(
  players: PlayerSummary[],
  dinnerBalances: SettlementBalanceInput[]
): GlobalBalanceRow[] {
  const dinnerByPlayerId = dinnerBalances.reduce<Record<string, number>>((accumulator, player) => {
    accumulator[player.id] = player.balance;
    return accumulator;
  }, {});

  return players
    .map((player) => {
      const pokerBalance = player.balance ?? 0;
      const dinnerBalance = dinnerByPlayerId[player.id] ?? 0;

      return {
        dinnerBalance,
        globalBalance: roundCurrency(pokerBalance + dinnerBalance),
        id: player.id,
        name: player.name,
        pokerBalance
      };
    })
    .sort((first, second) => second.globalBalance - first.globalBalance);
}

export default function Summary(): JSX.Element {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { playerId } = useLocalPlayer();
  const { room, loading: roomLoading, error: roomError, realtimeState: roomState, updateRoom } = useRoom(code);
  const {
    players,
    loading: playersLoading,
    error: playersError,
    realtimeState: playersState,
    clearFinalAmounts
  } = usePlayers(room?.id);
  const { rebuys, loading: rebuysLoading, error: rebuysError, realtimeState: rebuysState } =
    useRebuys(room?.id);
  const {
    addDinnerExpense,
    dinnerExpenses,
    error: dinnerError,
    loading: dinnerLoading,
    realtimeState: dinnerState,
    softDeleteDinnerExpense
  } = useDinnerExpenses(room?.id);

  const [settlements, setSettlements] = useState<SettlementResult[]>([]);
  const [settlementsLoading, setSettlementsLoading] = useState(true);
  const [settlementsError, setSettlementsError] = useState<string | null>(null);
  const [isReopening, setIsReopening] = useState(false);
  const [dinnerForm, setDinnerForm] = useState({
    amount: '',
    description: 'Cena',
    paidByPlayerId: ''
  });
  const [isSavingDinner, setIsSavingDinner] = useState(false);

  const realtimeState = aggregateRealtimeState([roomState, playersState, rebuysState, dinnerState]);
  const loading = roomLoading || playersLoading || rebuysLoading || dinnerLoading || settlementsLoading;

  const playerSummaries = useMemo<PlayerSummary[]>(() => {
    return players
      .map((player) => {
        const playerHistory = rebuys.filter((rebuy) => rebuy.player_id === player.id);
        const activeRebuys = playerHistory.filter((rebuy) => !rebuy.deleted_at);
        const totalRebuyAmount = sum(activeRebuys.map((rebuy) => rebuy.amount));
        const totalContributed = roundCurrency(player.initial_buy_in + totalRebuyAmount);

        return {
          ...player,
          rebuyHistory: playerHistory,
          rebuyCount: activeRebuys.length,
          totalRebuyAmount,
          totalContributed,
          balance:
            player.final_amount === null
              ? null
              : roundCurrency(player.final_amount - totalContributed)
        };
      })
      .sort((first, second) => (second.balance ?? 0) - (first.balance ?? 0));
  }, [players, rebuys]);

  const playerNames = useMemo<Record<string, string>>(
    () =>
      players.reduce<Record<string, string>>((accumulator, player) => {
        accumulator[player.id] = player.name;
        return accumulator;
      }, {}),
    [players]
  );
  const activeDinnerExpenses = useMemo<DinnerExpense[]>(
    () => dinnerExpenses.filter((expense) => !expense.deleted_at),
    [dinnerExpenses]
  );
  const dinnerBalances = useMemo(
    () => calculateDinnerBalances(playerSummaries, dinnerExpenses),
    [dinnerExpenses, playerSummaries]
  );
  const dinnerSettlements = useMemo(
    () => calculateSettlementsFromBalances(dinnerBalances),
    [dinnerBalances]
  );
  const globalRows = useMemo(
    () => combineBalances(playerSummaries, dinnerBalances),
    [dinnerBalances, playerSummaries]
  );
  const globalSettlements = useMemo(
    () =>
      calculateSettlementsFromBalances(
        globalRows.map((row) => ({
          balance: row.globalBalance,
          id: row.id,
          name: row.name
        }))
      ),
    [globalRows]
  );
  const isHost = Boolean(players.find((player) => player.id === playerId)?.is_host);
  const totalPot = sum(playerSummaries.map((player) => player.totalContributed));
  const finalTotal = sum(playerSummaries.map((player) => player.final_amount ?? 0));
  const difference = roundCurrency(finalTotal - totalPot);
  const dinnerTotal = sum(activeDinnerExpenses.map((expense) => expense.amount));

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
  }, [code]);

  useEffect(() => {
    if (dinnerForm.paidByPlayerId || players.length === 0) {
      return;
    }

    setDinnerForm((current) => ({
      ...current,
      paidByPlayerId: players[0].id
    }));
  }, [dinnerForm.paidByPlayerId, players]);

  useEffect(() => {
    if (room?.status && room.status !== 'closed') {
      navigate(`/room/${code}`, { replace: true });
    }
  }, [code, navigate, room?.status]);

  useEffect(() => {
    async function loadSettlements(): Promise<void> {
      if (!room?.id) {
        setSettlements([]);
        setSettlementsLoading(false);
        return;
      }

      setSettlementsLoading(true);
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true });

      if (error) {
        setSettlementsError(getErrorMessage(error));
        setSettlements([]);
        setSettlementsLoading(false);
        return;
      }

      setSettlements(
        data.map((settlement) => ({
          amount: settlement.amount,
          from: playerNames[settlement.from_player_id] ?? 'Jugador desconocido',
          fromPlayerId: settlement.from_player_id,
          to: playerNames[settlement.to_player_id] ?? 'Jugador desconocido',
          toPlayerId: settlement.to_player_id
        }))
      );
      setSettlementsError(null);
      setSettlementsLoading(false);
    }

    void loadSettlements();
  }, [playerNames, room?.id]);

  async function handleReopen(): Promise<void> {
    if (!room) {
      return;
    }

    const confirmed = window.confirm(
      'Quieres reabrir la partida y borrar los importes finales y los pagos calculados?'
    );

    if (!confirmed) {
      return;
    }

    setIsReopening(true);

    try {
      const { error: clearPlayersError } = await clearFinalAmounts();
      if (clearPlayersError) {
        throw new Error(clearPlayersError);
      }

      const { error: deleteSettlementsError } = await supabase
        .from('settlements')
        .delete()
        .eq('room_id', room.id);

      if (deleteSettlementsError) {
        throw deleteSettlementsError;
      }

      const { error: deleteDinnerError } = await supabase
        .from('dinner_expenses')
        .delete()
        .eq('room_id', room.id);

      if (deleteDinnerError) {
        throw deleteDinnerError;
      }

      const { error: roomUpdateError } = await updateRoom({
        status: 'active',
        closed_at: null
      });

      if (roomUpdateError) {
        throw new Error(roomUpdateError);
      }

      navigate(`/room/${room.code}`);
    } catch (reopenError) {
      setSettlementsError(getErrorMessage(reopenError));
    } finally {
      setIsReopening(false);
    }
  }

  async function handleAddDinnerExpense(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!room || !playerId || !isHost) {
      setSettlementsError('Solo el anfitrion puede anadir gastos de cena.');
      return;
    }

    const amount = roundCurrency(toNumber(dinnerForm.amount));

    if (!dinnerForm.paidByPlayerId) {
      setSettlementsError('Elige a quien se le debe la cena.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setSettlementsError('Introduce un importe de cena valido.');
      return;
    }

    setIsSavingDinner(true);
    setSettlementsError(null);

    const { error } = await addDinnerExpense({
      amount,
      createdByPlayerId: playerId,
      description: dinnerForm.description.trim() || 'Cena',
      paidByPlayerId: dinnerForm.paidByPlayerId
    });

    if (error) {
      setSettlementsError(error);
    } else {
      setDinnerForm((current) => ({
        ...current,
        amount: '',
        description: 'Cena'
      }));
    }

    setIsSavingDinner(false);
  }

  async function handleDeleteDinnerExpense(expenseId: string): Promise<void> {
    const confirmed = window.confirm('Quieres eliminar este gasto de cena?');

    if (!confirmed) {
      return;
    }

    const { error } = await softDeleteDinnerExpense(expenseId);

    if (error) {
      setSettlementsError(error);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-4 text-slate-300">
          Cargando resumen...
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-10">
        <div className="glass-card w-full max-w-xl p-8 text-center">
          <h1 className="text-3xl font-bold text-white">Partida no encontrada</h1>
          <p className="mt-3 text-slate-300">Esta sala ya no esta disponible.</p>
          <Link className="primary-button mt-6" to="/">
            Ir al inicio
          </Link>
        </div>
      </main>
    );
  }

  const summaryText = buildSummaryText(room.name, room.currency, playerSummaries, settlements, {
    dinnerExpenses,
    dinnerSettlements,
    globalRows,
    globalSettlements,
    playerNames
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="glass-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="secondary-button px-4" to={`/room/${room.code}`}>
                Volver a la sala
              </Link>
              <StatusBadge status={room.status} />
              <LiveIndicator state={realtimeState} />
            </div>

            <h1 className="mt-5 text-4xl font-black text-white">{room.name} · resumen</h1>
            <p className="mt-3 text-sm text-slate-300">
              Cerrada el{' '}
              {room.closed_at
                ? new Date(room.closed_at).toLocaleString('es-ES')
                : 'justo ahora'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="primary-button" onClick={() => void copyToClipboard(summaryText)}>
              Copiar resumen
            </button>
            <Link className="secondary-button" to="/stats">
              Ver estadisticas
            </Link>
            <a
              className="secondary-button"
              href={buildWhatsappShareUrl(summaryText)}
              rel="noreferrer"
              target="_blank"
            >
              Enviar cuentas por WhatsApp
            </a>
            {isHost ? (
              <button
                className="secondary-button"
                disabled={isReopening}
                onClick={() => void handleReopen()}
              >
                {isReopening ? 'Reabriendo...' : 'Reabrir partida'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {roomError || playersError || rebuysError || dinnerError || settlementsError ? (
        <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {settlementsError ?? dinnerError ?? rebuysError ?? playersError ?? roomError}
        </div>
      ) : null}

      {Math.abs(difference) > 0.009 ? (
        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          La partida se cerro con descuadre. Se esperaba {formatCurrency(totalPot, room.currency)},
          pero se introdujo {formatCurrency(finalTotal, room.currency)}. Diferencia:{' '}
          {formatCurrency(Math.abs(difference), room.currency)}.
        </div>
      ) : null}

      <section className="glass-card mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Cuentas completas</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Poker, cena y cuenta global</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Primero se ven las cuentas por separado y abajo queda la cuenta global buena: esa es
              la que normalmente se manda para pagar una sola vez.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="primary-button" onClick={() => void copyToClipboard(summaryText)}>
              Copiar cuentas completas
            </button>
            <a
              className="secondary-button"
              href={buildWhatsappShareUrl(summaryText)}
              rel="noreferrer"
              target="_blank"
            >
              Enviar por WhatsApp
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <AccountSummaryCard
            accent="slate"
            currency={room.currency}
            emptyText="No hace falta ningun pago de poker."
            label="Cuentas poker"
            settlements={settlements}
          />
          <AccountSummaryCard
            accent="amber"
            currency={room.currency}
            emptyText="No hace falta ningun pago de cena."
            label="Cuentas cena"
            settlements={dinnerSettlements}
          />
          <AccountSummaryCard
            accent="emerald"
            currency={room.currency}
            emptyText="No hace falta ningun pago global."
            label="Cuenta global"
            settlements={globalSettlements}
          />
        </div>

        <pre className="mt-5 max-h-80 overflow-auto whitespace-pre-wrap rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-xs leading-5 text-slate-300 sm:text-sm">
          {summaryText}
        </pre>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Clasificacion</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Balances finales</h2>
            </div>
            <p className="text-sm text-slate-400">{playerSummaries.length} jugadores</p>
          </div>

          <div className="mt-6 space-y-3 md:hidden">
            {playerSummaries.map((player, index) => (
              <div
                className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-200"
                key={player.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Puesto {index + 1}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <PlayerAvatar name={player.name} />
                      <p className="text-lg font-semibold text-white">{player.name}</p>
                    </div>
                  </div>
                  <p
                    className={
                      (player.balance ?? 0) >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'
                    }
                  >
                    {formatCurrency(player.balance ?? 0, room.currency)}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <SummaryStat
                    label="Aportado"
                    value={formatCurrency(player.totalContributed, room.currency)}
                  />
                  <SummaryStat label="Final" value={formatCurrency(player.final_amount ?? 0, room.currency)} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 hidden overflow-hidden rounded-3xl border border-white/10 md:block">
            <div className="grid grid-cols-[72px_1.2fr_1fr_1fr_1fr] gap-3 bg-slate-950/90 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
              <span>Puesto</span>
              <span>Jugador</span>
              <span>Aportado</span>
              <span>Final</span>
              <span>Balance</span>
            </div>
            {playerSummaries.map((player, index) => (
              <div
                className="grid grid-cols-[72px_1.2fr_1fr_1fr_1fr] gap-3 border-t border-white/10 bg-slate-900/70 px-4 py-4 text-sm text-slate-200"
                key={player.id}
              >
                <span className="font-semibold text-white">{index + 1}</span>
                <span className="flex items-center gap-3 font-medium">
                  <PlayerAvatar name={player.name} size="sm" />
                  {player.name}
                </span>
                <span>{formatCurrency(player.totalContributed, room.currency)}</span>
                <span>{formatCurrency(player.final_amount ?? 0, room.currency)}</span>
                <span
                  className={
                    (player.balance ?? 0) >= 0
                      ? 'font-semibold text-emerald-300'
                      : 'font-semibold text-rose-300'
                  }
                >
                  {formatCurrency(player.balance ?? 0, room.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Poker</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Cuentas poker</h2>
          <div className="mt-6">
            <SettlementList currency={room.currency} settlements={settlements} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="glass-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Cena</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Gastos cena</h2>
              <p className="mt-2 text-sm text-slate-400">
                Total cena {formatCurrency(dinnerTotal, room.currency)} repartido entre{' '}
                {playerSummaries.length} jugadores.
              </p>
            </div>
          </div>

          {isHost ? (
            <form className="mt-5 space-y-4" onSubmit={(event) => void handleAddDinnerExpense(event)}>
              <label className="block text-sm font-medium text-slate-300">
                A quien se le debe
                <div className="field-shell mt-2">
                  <select
                    className="input-base"
                    onChange={(event) =>
                      setDinnerForm((current) => ({ ...current, paidByPlayerId: event.target.value }))
                    }
                    value={dinnerForm.paidByPlayerId}
                  >
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="block text-sm font-medium text-slate-300">
                Importe total
                <div className="field-shell mt-2">
                  <input
                    className="input-base"
                    inputMode="decimal"
                    onChange={(event) =>
                      setDinnerForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    placeholder="80"
                    value={dinnerForm.amount}
                  />
                </div>
              </label>

              <label className="block text-sm font-medium text-slate-300">
                Concepto
                <div className="field-shell mt-2">
                  <input
                    className="input-base"
                    onChange={(event) =>
                      setDinnerForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Cena"
                    value={dinnerForm.description}
                  />
                </div>
              </label>

              <button className="primary-button w-full" disabled={isSavingDinner} type="submit">
                {isSavingDinner ? 'Anadiendo cena...' : 'Anadir gasto cena'}
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">
              Solo el anfitrion puede anadir o borrar gastos de cena.
            </div>
          )}

          <div className="mt-5 space-y-3">
            {activeDinnerExpenses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">
                Todavia no hay gastos de cena.
              </div>
            ) : (
              activeDinnerExpenses.map((expense) => (
                <div
                  className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-200"
                  key={expense.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        {expense.description} · {formatCurrency(expense.amount, room.currency)}
                      </p>
                      <p className="mt-1 text-slate-400">
                        Se le debe a {playerNames[expense.paid_by_player_id] ?? 'Jugador desconocido'} ·{' '}
                        {formatTime(expense.created_at)}
                      </p>
                    </div>
                    {isHost ? (
                      <button
                        className="secondary-button border-rose-500/30 px-4 text-rose-100 hover:bg-rose-500/10"
                        onClick={() => void handleDeleteDinnerExpense(expense.id)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="glass-card p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Cena</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Cuentas cena</h2>
            <div className="mt-6">
              <SettlementList currency={room.currency} settlements={dinnerSettlements} />
            </div>
          </div>

          <div className="glass-card p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Global</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Cuenta global final</h2>
            <div className="mt-6">
              <SettlementList currency={room.currency} settlements={globalSettlements} />
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Detalle global</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Poker + cena por jugador</h2>
          </div>
          <p className="text-sm text-slate-400">{globalRows.length} jugadores</p>
        </div>

        <div className="mt-6 grid gap-3">
          {globalRows.map((row) => (
            <div
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-200"
              key={row.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <PlayerAvatar name={row.name} />
                  <div>
                    <p className="font-semibold text-white">{row.name}</p>
                    <p className="text-xs text-slate-500">Resultado combinado</p>
                  </div>
                </div>
                <p
                  className={
                    row.globalBalance >= 0
                      ? 'text-2xl font-black text-emerald-300'
                      : 'text-2xl font-black text-rose-300'
                  }
                >
                  {formatSignedCurrency(row.globalBalance, room.currency)}
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <SummaryStat
                  label="Poker"
                  value={formatSignedCurrency(row.pokerBalance, room.currency)}
                />
                <SummaryStat
                  label="Cena"
                  value={formatSignedCurrency(row.dinnerBalance, room.currency)}
                />
                <SummaryStat
                  label="Global"
                  value={formatSignedCurrency(row.globalBalance, room.currency)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

interface SummaryStatProps {
  label: string;
  value: string;
}

function SummaryStat({ label, value }: SummaryStatProps): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

interface AccountSummaryCardProps {
  accent: 'amber' | 'emerald' | 'slate';
  currency: string;
  emptyText: string;
  label: string;
  settlements: SettlementResult[];
}

const ACCOUNT_CARD_ACCENTS: Record<AccountSummaryCardProps['accent'], string> = {
  amber: 'border-amber-500/20 bg-amber-500/5 text-amber-200',
  emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
  slate: 'border-white/10 bg-slate-950/60 text-slate-200'
};

function AccountSummaryCard({
  accent,
  currency,
  emptyText,
  label,
  settlements
}: AccountSummaryCardProps): JSX.Element {
  return (
    <div className={`rounded-3xl border p-4 ${ACCOUNT_CARD_ACCENTS[accent]}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-white">{label}</h3>
        <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-semibold text-slate-300">
          {settlements.length} pagos
        </span>
      </div>
      <SettlementList currency={currency} emptyText={emptyText} settlements={settlements} />
    </div>
  );
}
