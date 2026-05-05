import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import LiveIndicator from '../components/LiveIndicator';
import SettlementList from '../components/SettlementList';
import StatusBadge from '../components/StatusBadge';
import { useLocalPlayer } from '../hooks/useLocalPlayer';
import { usePlayers } from '../hooks/usePlayers';
import { useRebuys } from '../hooks/useRebuys';
import { useRoom } from '../hooks/useRoom';
import { supabase } from '../lib/supabase';
import {
  buildSummaryText,
  buildWhatsappShareUrl,
  copyToClipboard,
  formatCurrency,
  getErrorMessage,
  roundCurrency,
  sum
} from '../lib/utils';
import type { PlayerSummary, RealtimeState, SettlementResult } from '../types';

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

  const [settlements, setSettlements] = useState<SettlementResult[]>([]);
  const [settlementsLoading, setSettlementsLoading] = useState(true);
  const [settlementsError, setSettlementsError] = useState<string | null>(null);
  const [isReopening, setIsReopening] = useState(false);

  const realtimeState = aggregateRealtimeState([roomState, playersState, rebuysState]);
  const loading = roomLoading || playersLoading || rebuysLoading || settlementsLoading;

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

  const isHost = Boolean(players.find((player) => player.id === playerId)?.is_host);
  const totalPot = sum(playerSummaries.map((player) => player.totalContributed));
  const finalTotal = sum(playerSummaries.map((player) => player.final_amount ?? 0));
  const difference = roundCurrency(finalTotal - totalPot);

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

      const playerNames = players.reduce<Record<string, string>>((accumulator, player) => {
        accumulator[player.id] = player.name;
        return accumulator;
      }, {});

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
  }, [players, room?.id]);

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

  const summaryText = buildSummaryText(room.name, room.currency, playerSummaries, settlements);

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

      {roomError || playersError || rebuysError || settlementsError ? (
        <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {settlementsError ?? rebuysError ?? playersError ?? roomError}
        </div>
      ) : null}

      {Math.abs(difference) > 0.009 ? (
        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          La partida se cerro con descuadre. Se esperaba {formatCurrency(totalPot, room.currency)},
          pero se introdujo {formatCurrency(finalTotal, room.currency)}. Diferencia:{' '}
          {formatCurrency(Math.abs(difference), room.currency)}.
        </div>
      ) : null}

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
                    <p className="mt-2 text-lg font-semibold text-white">{player.name}</p>
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
                <span className="font-medium">{player.name}</span>
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
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Pagos</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Quien paga a quien</h2>
          <div className="mt-6">
            <SettlementList currency={room.currency} settlements={settlements} />
          </div>
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
