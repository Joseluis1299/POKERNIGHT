import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useLocalPlayer } from '../hooks/useLocalPlayer';
import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';
import { getErrorMessage, normalizeRoomCode } from '../lib/utils';
import type { Player, Room } from '../types';

function sortPlayersForJoin(players: Player[]): Player[] {
  return players.slice().sort((first, second) => {
    if (first.is_host !== second.is_host) {
      return first.is_host ? -1 : 1;
    }

    const firstClaimed = Boolean(first.claimed_by_device_id);
    const secondClaimed = Boolean(second.claimed_by_device_id);
    if (firstClaimed !== secondClaimed) {
      return firstClaimed ? 1 : -1;
    }

    return first.name.localeCompare(second.name, 'es', { sensitivity: 'base' });
  });
}

export default function JoinGame(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { deviceId, identity, isInRoom, saveIdentity } = useLocalPlayer();
  const [roomCode, setRoomCode] = useState(() => normalizeRoomCode(searchParams.get('code') ?? ''));
  const [playerName, setPlayerName] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualJoin, setShowManualJoin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedPlayers = useMemo(() => sortPlayersForJoin(players), [players]);
  const selectedPlayer = sortedPlayers.find((player) => player.id === selectedPlayerId) ?? null;
  const canContinueAsSavedPlayer = Boolean(room && identity && isInRoom(room.code));

  async function loadRoom(codeOverride?: string): Promise<void> {
    const normalizedCode = normalizeRoomCode(codeOverride ?? roomCode);

    if (!normalizedCode) {
      setError('Introduce un codigo de sala valido.');
      setRoom(null);
      setPlayers([]);
      setSelectedPlayerId(null);
      return;
    }

    if (!isSupabaseConfigured) {
      setError(supabaseConfigError);
      return;
    }

    setIsLoadingRoom(true);
    setError(null);

    try {
      const { data: nextRoom, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', normalizedCode)
        .maybeSingle();

      if (roomError) {
        throw roomError;
      }

      if (!nextRoom) {
        setRoom(null);
        setPlayers([]);
        setSelectedPlayerId(null);
        setError('Esa sala no existe.');
        return;
      }

      if (nextRoom.status === 'closed') {
        setRoom(nextRoom);
        setPlayers([]);
        setSelectedPlayerId(null);
        setError('Esa partida ya esta cerrada.');
        return;
      }

      const { data: nextPlayers, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', nextRoom.id);

      if (playersError) {
        throw playersError;
      }

      const sorted = sortPlayersForJoin(nextPlayers);
      const storedPlayer = sorted.find((player) => player.id === identity?.playerId);
      const defaultPlayer = storedPlayer ?? sorted.find((player) => !player.claimed_by_device_id) ?? null;

      setRoom(nextRoom);
      setPlayers(sorted);
      setSelectedPlayerId(defaultPlayer?.id ?? null);
      setShowManualJoin(sorted.length === 0);
    } catch (loadError) {
      setRoom(null);
      setPlayers([]);
      setSelectedPlayerId(null);
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingRoom(false);
    }
  }

  useEffect(() => {
    const nextCode = normalizeRoomCode(searchParams.get('code') ?? '');
    if (!nextCode) {
      return;
    }

    setRoomCode(nextCode);
    void loadRoom(nextCode);
  }, [searchParams]);

  async function handleLookup(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadRoom();
  }

  async function handleClaimSelectedPlayer(): Promise<void> {
    if (!room || !selectedPlayer) {
      setError('Primero carga una sala y elige un jugador.');
      return;
    }

    if (!deviceId) {
      setError('No se ha podido preparar la identidad local de este dispositivo.');
      return;
    }

    if (selectedPlayer.claimed_by_device_id && selectedPlayer.claimed_by_device_id !== deviceId) {
      setError('Ese jugador ya se ha vinculado desde otro dispositivo. Elige otro disponible.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const claimedAt = new Date().toISOString();
      const { data: claimedPlayer, error: claimError } = await supabase
        .from('players')
        .update({
          claimed_at: claimedAt,
          claimed_by_device_id: deviceId
        })
        .eq('id', selectedPlayer.id)
        .or(`claimed_by_device_id.is.null,claimed_by_device_id.eq.${deviceId}`)
        .select('*')
        .maybeSingle();

      if (claimError) {
        throw claimError;
      }

      if (!claimedPlayer) {
        await loadRoom(room.code);
        setError('Ese jugador acaba de ser elegido por otro dispositivo. Refresca y prueba otro.');
        return;
      }

      saveIdentity({
        playerId: claimedPlayer.id,
        playerName: claimedPlayer.name,
        roomCode: room.code,
        isHost: claimedPlayer.is_host
      });

      navigate(`/room/${room.code}`);
    } catch (claimPlayerError) {
      setError(getErrorMessage(claimPlayerError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateMissingPlayer(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!room) {
      setError('Primero carga una sala valida.');
      return;
    }

    if (!deviceId) {
      setError('No se ha podido preparar la identidad local de este dispositivo.');
      return;
    }

    const trimmedName = playerName.trim();
    if (trimmedName.length < 2) {
      setError('Escribe un nombre de jugador valido.');
      return;
    }

    const nameTaken = players.some(
      (player) => player.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (nameTaken) {
      setError('Ese nombre ya existe en la mesa. Elige tu jugador de la lista.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const playerId = crypto.randomUUID();
      const claimedAt = new Date().toISOString();
      const { error: insertError } = await supabase.from('players').insert({
        id: playerId,
        room_id: room.id,
        name: trimmedName,
        initial_buy_in: room.default_buy_in,
        is_host: false,
        claimed_at: claimedAt,
        claimed_by_device_id: deviceId
      });

      if (insertError) {
        throw insertError;
      }

      saveIdentity({
        playerId,
        playerName: trimmedName,
        roomCode: room.code,
        isHost: false
      });

      navigate(`/room/${room.code}`);
    } catch (createPlayerError) {
      setError(getErrorMessage(createPlayerError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link className="secondary-button px-4" to="/">
          Volver
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="glass-card p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Entrar en la mesa</p>
          <h1 className="mt-3 text-4xl font-black text-white">Abre la partida y elige tu jugador.</h1>
          <p className="mt-4 text-slate-300">
            Carga la sala con su codigo, reclama tu nombre desde la lista y veras la mesa en
            directo desde tu movil.
          </p>

          <form className="mt-8 space-y-5" onSubmit={(event) => void handleLookup(event)}>
            <label className="block text-sm font-medium text-slate-300">
              Codigo de sala
              <div className="field-shell mt-2">
                <input
                  autoCapitalize="characters"
                  className="input-base uppercase tracking-[0.45em]"
                  onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
                  placeholder="AB12C"
                  value={roomCode}
                />
              </div>
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              className="primary-button w-full"
              disabled={isLoadingRoom || !isSupabaseConfigured}
              type="submit"
            >
              {isLoadingRoom ? 'Cargando mesa...' : 'Cargar mesa'}
            </button>
          </form>
        </section>

        <section className="glass-card p-6 sm:p-8">
          {room ? (
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Sala encontrada</p>
                <h2 className="mt-3 text-4xl font-black text-white">{room.name}</h2>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                  <span>Codigo {room.code}</span>
                  <span>{sortedPlayers.length} jugadores preparados</span>
                </div>
              </div>

              {canContinueAsSavedPlayer ? (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="text-sm text-emerald-100">
                    Este dispositivo ya esta vinculado como {identity?.playerName}.
                  </p>
                  <button
                    className="primary-button mt-4"
                    onClick={() => navigate(`/room/${room.code}`)}
                    type="button"
                  >
                    Entrar en la sala
                  </button>
                </div>
              ) : null}

              {sortedPlayers.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">Selecciona tu jugador</p>
                    <button
                      className="secondary-button px-4"
                      onClick={() => void loadRoom(room.code)}
                      type="button"
                    >
                      Refrescar lista
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {sortedPlayers.map((player) => {
                      const isSelected = selectedPlayerId === player.id;
                      const isClaimedByCurrentDevice = player.claimed_by_device_id === deviceId;
                      const isClaimedByOtherDevice = Boolean(
                        player.claimed_by_device_id && player.claimed_by_device_id !== deviceId
                      );

                      return (
                        <button
                          className={`rounded-3xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-emerald-400 bg-emerald-500/10'
                              : 'border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-900/80'
                          } ${isClaimedByOtherDevice ? 'opacity-70' : ''}`}
                          disabled={isClaimedByOtherDevice}
                          key={player.id}
                          onClick={() => setSelectedPlayerId(player.id)}
                          type="button"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-lg font-semibold text-white">
                                {player.name}
                                {player.is_host ? ' · anfitrion' : ''}
                              </p>
                              <p className="mt-1 text-sm text-slate-400">
                                {isClaimedByCurrentDevice
                                  ? 'Ya vinculado en este dispositivo.'
                                  : isClaimedByOtherDevice
                                    ? 'Ya vinculado desde otro dispositivo.'
                                    : 'Disponible para entrar desde el enlace.'}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                isClaimedByCurrentDevice
                                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                                  : isClaimedByOtherDevice
                                    ? 'border border-rose-500/20 bg-rose-500/10 text-rose-100'
                                    : 'border border-white/10 bg-slate-900 text-slate-200'
                              }`}
                            >
                              {isClaimedByCurrentDevice
                                ? 'Tu jugador'
                                : isClaimedByOtherDevice
                                  ? 'Ocupado'
                                  : 'Libre'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    className="primary-button mt-5 w-full"
                    disabled={!selectedPlayer || isSubmitting}
                    onClick={() => void handleClaimSelectedPlayer()}
                    type="button"
                  >
                    {isSubmitting
                      ? 'Entrando en la sala...'
                      : selectedPlayer
                        ? `Entrar como ${selectedPlayer.name}`
                        : 'Elige un jugador'}
                  </button>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/60 p-5 text-sm text-slate-400">
                  Esta mesa todavia no tiene jugadores preparados. Puedes anadirte manualmente
                  desde abajo.
                </div>
              )}

              <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">No estoy en la lista</p>
                  <button
                    className="secondary-button px-4"
                    onClick={() => setShowManualJoin((current) => !current)}
                    type="button"
                  >
                    {showManualJoin ? 'Ocultar' : 'Anadirme ahora'}
                  </button>
                </div>

                {showManualJoin ? (
                  <form className="mt-4 space-y-4" onSubmit={(event) => void handleCreateMissingPlayer(event)}>
                    <label className="block text-sm font-medium text-slate-300">
                      Nombre del jugador
                      <div className="field-shell mt-2">
                        <input
                          className="input-base"
                          onChange={(event) => setPlayerName(event.target.value)}
                          placeholder="Pedro"
                          value={playerName}
                        />
                      </div>
                    </label>

                    <button className="primary-button w-full" disabled={isSubmitting} type="submit">
                      {isSubmitting ? 'Anadiendo jugador...' : 'Crear mi jugador y entrar'}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Listo para entrar</p>
              <h2 className="text-3xl font-black text-white">Cargaremos aqui la mesa y sus jugadores.</h2>
              <p className="text-slate-300">
                En cuanto pongas el codigo de sala, veras a todos los participantes preparados para
                elegir el tuyo.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
