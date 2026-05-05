import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import CloseGameModal from '../components/CloseGameModal';
import LiveIndicator from '../components/LiveIndicator';
import PlayerCard from '../components/PlayerCard';
import QRShareModal from '../components/QRShareModal';
import RebuyModal from '../components/RebuyModal';
import StatusBadge from '../components/StatusBadge';
import { useLocalPlayer } from '../hooks/useLocalPlayer';
import { usePlayers } from '../hooks/usePlayers';
import { useRebuys } from '../hooks/useRebuys';
import { useRoom } from '../hooks/useRoom';
import { calculateSettlements } from '../lib/settlements';
import { supabase } from '../lib/supabase';
import {
  buildRoomShareUrl,
  buildWhatsappShareUrl,
  formatCurrency,
  getErrorMessage,
  roundCurrency,
  sum
} from '../lib/utils';
import type { PlayerSummary, RealtimeState } from '../types';

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

export default function Room(): JSX.Element {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { playerId, roomCode: localRoomCode } = useLocalPlayer();
  const { room, loading: roomLoading, error: roomError, realtimeState: roomState, updateRoom } = useRoom(code);
  const {
    players,
    loading: playersLoading,
    error: playersError,
    realtimeState: playersState,
    bulkUpdateFinalAmounts,
    removePlayer
  } = usePlayers(room?.id);
  const {
    rebuys,
    loading: rebuysLoading,
    error: rebuysError,
    realtimeState: rebuysState,
    addRebuy,
    softDeleteRebuy
  } = useRebuys(room?.id);

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSummary | null>(null);
  const [isSavingRebuy, setIsSavingRebuy] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosingGame, setIsClosingGame] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const realtimeState = aggregateRealtimeState([roomState, playersState, rebuysState]);
  const loading = roomLoading || playersLoading || rebuysLoading;
  const pageError = roomError ?? playersError ?? rebuysError;

  const playerSummaries = useMemo<PlayerSummary[]>(() => {
    return players.map((player) => {
      const playerHistory = rebuys.filter((rebuy) => rebuy.player_id === player.id);
      const activeRebuys = playerHistory.filter((rebuy) => !rebuy.deleted_at);
      const totalRebuyAmount = sum(activeRebuys.map((rebuy) => rebuy.amount));
      const totalContributed = roundCurrency(player.initial_buy_in + totalRebuyAmount);
      const finalAmount = player.final_amount;

      return {
        ...player,
        rebuyHistory: playerHistory,
        rebuyCount: activeRebuys.length,
        totalRebuyAmount,
        totalContributed,
        balance: finalAmount === null ? null : roundCurrency(finalAmount - totalContributed)
      };
    });
  }, [players, rebuys]);

  const playerNames = useMemo<Record<string, string>>(
    () =>
      players.reduce<Record<string, string>>((accumulator, player) => {
        accumulator[player.id] = player.name;
        return accumulator;
      }, {}),
    [players]
  );

  const totalPot = useMemo(
    () => sum(playerSummaries.map((player) => player.totalContributed)),
    [playerSummaries]
  );
  const currentPlayer = players.find((player) => player.id === playerId);
  const isHost = Boolean(currentPlayer?.is_host || room?.host_player_id === playerId);
  const shareUrl = buildRoomShareUrl(code);
  const shareText = room
    ? `Unete a "${room.name}" en PokerNight. Codigo: ${room.code}. ${shareUrl}`
    : '';

  useEffect(() => {
    if (room?.status === 'closed') {
      navigate(`/room/${room.code}/summary`, { replace: true });
    }
  }, [navigate, room?.code, room?.status]);

  async function handleAddRebuy(amount: number): Promise<void> {
    if (!selectedPlayer || !playerId) {
      return;
    }

    setIsSavingRebuy(true);
    setActionError(null);

    const { error } = await addRebuy({
      amount,
      createdByPlayerId: playerId,
      playerId: selectedPlayer.id
    });

    if (error) {
      setActionError(error);
    } else {
      setSelectedPlayer(null);
    }

    setIsSavingRebuy(false);
  }

  async function handleDeleteRebuy(rebuyId: string): Promise<void> {
    const confirmed = window.confirm('Quieres eliminar esta recompra del historial?');

    if (!confirmed) {
      return;
    }

    const { error } = await softDeleteRebuy(rebuyId);
    if (error) {
      setActionError(error);
    }
  }

  async function handleRemovePlayer(player: PlayerSummary): Promise<void> {
    const confirmed = window.confirm(`Quieres eliminar a ${player.name} de esta partida?`);

    if (!confirmed) {
      return;
    }

    const { error } = await removePlayer(player.id);
    if (error) {
      setActionError(error);
    }
  }

  async function handleStartGame(): Promise<void> {
    if (!room) {
      return;
    }

    setActionError(null);
    const { error } = await updateRoom({
      status: 'active',
      closed_at: null
    });

    if (error) {
      setActionError(error);
    }
  }

  async function handleCloseGame(
    values: Array<{ finalAmount: number; playerId: string }>,
    allowMismatch: boolean
  ): Promise<void> {
    if (!room) {
      return;
    }

    const confirmed = allowMismatch
      ? window.confirm('Los totales no cuadran con el bote. Quieres cerrar la partida igualmente?')
      : true;

    if (!confirmed) {
      return;
    }

    setIsClosingGame(true);
    setActionError(null);

    try {
      const { error: playersUpdateError } = await bulkUpdateFinalAmounts(
        values.map((value) => ({
          playerId: value.playerId,
          finalAmount: value.finalAmount
        }))
      );

      if (playersUpdateError) {
        throw new Error(playersUpdateError);
      }

      const contributions = playerSummaries.reduce<Record<string, number>>((accumulator, player) => {
        accumulator[player.id] = player.totalContributed;
        return accumulator;
      }, {});

      const settlements = calculateSettlements(
        values.map((value) => ({
          id: value.playerId,
          name: playerNames[value.playerId] ?? 'Jugador desconocido',
          finalAmount: value.finalAmount,
          totalContributed: contributions[value.playerId] ?? 0
        }))
      );

      const { error: deleteSettlementsError } = await supabase
        .from('settlements')
        .delete()
        .eq('room_id', room.id);

      if (deleteSettlementsError) {
        throw deleteSettlementsError;
      }

      if (settlements.length > 0) {
        const { error: insertSettlementsError } = await supabase.from('settlements').insert(
          settlements.map((settlement) => ({
            room_id: room.id,
            from_player_id: settlement.fromPlayerId,
            to_player_id: settlement.toPlayerId,
            amount: settlement.amount
          }))
        );

        if (insertSettlementsError) {
          throw insertSettlementsError;
        }
      }

      const { error: roomUpdateError } = await updateRoom({
        status: 'closed',
        closed_at: new Date().toISOString()
      });

      if (roomUpdateError) {
        throw new Error(roomUpdateError);
      }

      navigate(`/room/${room.code}/summary`);
    } catch (closeError) {
      setActionError(getErrorMessage(closeError));
    } finally {
      setIsClosingGame(false);
      setShowCloseModal(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-4 text-slate-300">
          Cargando sala...
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-10">
        <div className="glass-card w-full max-w-xl p-8 text-center">
          <h1 className="text-3xl font-bold text-white">Sala no encontrada</h1>
          <p className="mt-3 text-slate-300">
            Esta sala puede haberse eliminado o el codigo no es correcto.
          </p>
          <Link className="primary-button mt-6" to="/join">
            Unirme a otra partida
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-5">
        <div className="glass-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Link className="secondary-button px-4" to="/">
                  Inicio
                </Link>
                <StatusBadge status={room.status} />
                <LiveIndicator state={realtimeState} />
              </div>

              <h1 className="mt-5 text-4xl font-black text-white">{room.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                <span>Codigo {room.code}</span>
                <span>{players.length} jugadores</span>
                <span>Bote total {formatCurrency(totalPot, room.currency)}</span>
                {localRoomCode === room.code ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                    Estas en esta sala
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="secondary-button" onClick={() => setShowShareModal(true)}>
                Compartir sala
              </button>
              {isHost && room.status === 'lobby' ? (
                <button className="primary-button" onClick={() => void handleStartGame()}>
                  Empezar partida
                </button>
              ) : null}
              {isHost && room.status !== 'closed' ? (
                <button className="primary-button" onClick={() => setShowCloseModal(true)}>
                  Cerrar partida
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {pageError || actionError ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {actionError ?? pageError}
          </div>
        ) : null}

        {!playerId ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <div>
              Estas viendo esta sala en modo solo lectura porque no se ha encontrado una identidad
              local de jugador en este dispositivo.
            </div>
            <Link className="mt-3 inline-flex text-amber-50 underline underline-offset-4" to={`/join?code=${room.code}`}>
              Elegir mi jugador desde el enlace
            </Link>
          </div>
        ) : null}

        <section className="grid gap-5">
          {playerSummaries.map((player) => {
            const canAddRebuy = Boolean(
              playerId && room.status !== 'closed' && (player.id === playerId || isHost)
            );
            const canRemovePlayer = Boolean(
              isHost && room.status !== 'closed' && !player.is_host
            );

            return (
              <PlayerCard
                canAddRebuy={canAddRebuy}
                canDeleteRebuy={isHost}
                canRemovePlayer={canRemovePlayer}
                creatorNames={playerNames}
                currency={room.currency}
                key={player.id}
                onAddRebuy={() => setSelectedPlayer(player)}
                onDeleteRebuy={handleDeleteRebuy}
                onRemovePlayer={() => handleRemovePlayer(player)}
                player={player}
                roomStatus={room.status}
              />
            );
          })}
        </section>
      </div>

      {selectedPlayer ? (
        <RebuyModal
          currency={room.currency}
          defaultAmount={room.default_buy_in}
          loading={isSavingRebuy}
          onClose={() => setSelectedPlayer(null)}
          onConfirm={handleAddRebuy}
          open={Boolean(selectedPlayer)}
          playerName={selectedPlayer.name}
        />
      ) : null}

      <CloseGameModal
        currency={room.currency}
        loading={isClosingGame}
        onClose={() => setShowCloseModal(false)}
        onConfirm={handleCloseGame}
        open={showCloseModal}
        players={playerSummaries}
      />

      <QRShareModal
        onClose={() => setShowShareModal(false)}
        open={showShareModal}
        roomCode={room.code}
        roomName={room.name}
        shareText={shareText}
        shareUrl={shareUrl}
      />
    </main>
  );
}
