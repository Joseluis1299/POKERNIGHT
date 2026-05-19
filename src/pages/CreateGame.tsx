import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import QRShareModal from '../components/QRShareModal';
import { useLocalPlayer } from '../hooks/useLocalPlayer';
import { REGULAR_PLAYER_NAMES } from '../lib/playerProfiles';
import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';
import {
  buildRoomShareUrl,
  buildWhatsappShareUrl,
  copyToClipboard,
  generateCode,
  getErrorMessage
} from '../lib/utils';

interface CreatedRoomState {
  code: string;
  name: string;
  shareUrl: string;
}

interface CreateGameFormState {
  buyIn: string;
  currency: string;
  gameName: string;
}

interface PlayerDraft {
  buyIn: string;
  enabled: boolean;
  fixed: boolean;
  id: string;
  name: string;
}

interface NewPlayerFormState {
  buyIn: string;
  name: string;
}

const DEFAULT_BUY_IN = '5';

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function createDraftId(name: string): string {
  return `player-${normalizeName(name).replace(/[^a-z0-9]+/g, '-')}`;
}

function createInitialPlayerDrafts(): PlayerDraft[] {
  return REGULAR_PLAYER_NAMES.map((playerName) => ({
    buyIn: DEFAULT_BUY_IN,
    enabled: true,
    fixed: true,
    id: createDraftId(playerName),
    name: playerName
  }));
}

function toMoney(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function CreateGame(): JSX.Element {
  const navigate = useNavigate();
  const { deviceId, saveIdentity } = useLocalPlayer();
  const [playerDrafts, setPlayerDrafts] = useState<PlayerDraft[]>(() => createInitialPlayerDrafts());
  const [hostDraftId, setHostDraftId] = useState(() => createDraftId(REGULAR_PLAYER_NAMES[0]));
  const [newPlayer, setNewPlayer] = useState<NewPlayerFormState>({
    buyIn: DEFAULT_BUY_IN,
    name: ''
  });
  const [form, setForm] = useState<CreateGameFormState>({
    gameName: 'Poker del viernes',
    buyIn: DEFAULT_BUY_IN,
    currency: '€'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<CreatedRoomState | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    if (!createdRoom) {
      return;
    }

    const timer = window.setTimeout(() => {
      navigate(`/room/${createdRoom.code}`);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [createdRoom, navigate]);

  const shareText = useMemo(() => {
    if (!createdRoom) {
      return '';
    }

    return `Unete a "${createdRoom.name}" en PokerNight. Codigo: ${createdRoom.code}. ${createdRoom.shareUrl}`;
  }, [createdRoom]);

  const hostDraft = useMemo(
    () => playerDrafts.find((player) => player.id === hostDraftId) ?? playerDrafts[0] ?? null,
    [hostDraftId, playerDrafts]
  );
  const selectedDrafts = useMemo(
    () => playerDrafts.filter((player) => player.enabled || player.id === hostDraft?.id),
    [hostDraft?.id, playerDrafts]
  );

  function handleHostChange(nextHostId: string): void {
    setHostDraftId(nextHostId);
    setPlayerDrafts((current) =>
      current.map((player) =>
        player.id === nextHostId ? { ...player, enabled: true } : player
      )
    );
    setError(null);
  }

  function handleTogglePlayer(playerId: string): void {
    if (playerId === hostDraft?.id) {
      return;
    }

    setPlayerDrafts((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, enabled: !player.enabled } : player
      )
    );
    setError(null);
  }

  function handlePlayerBuyInChange(playerId: string, buyIn: string): void {
    setPlayerDrafts((current) =>
      current.map((player) => (player.id === playerId ? { ...player, buyIn } : player))
    );
    setError(null);
  }

  function handleSelectAllPlayers(): void {
    setPlayerDrafts((current) => current.map((player) => ({ ...player, enabled: true })));
    setError(null);
  }

  function handleClearPlayers(): void {
    setPlayerDrafts((current) =>
      current.map((player) => ({
        ...player,
        enabled: player.id === hostDraft?.id
      }))
    );
    setError(null);
  }

  function handleAddPlayer(): void {
    const playerName = newPlayer.name.trim();
    const playerBuyIn = toMoney(newPlayer.buyIn);

    if (playerName.length < 2) {
      setError('Escribe un nombre valido para anadir un jugador.');
      return;
    }

    if (!Number.isFinite(playerBuyIn) || playerBuyIn <= 0) {
      setError('Introduce un importe inicial valido para el jugador nuevo.');
      return;
    }

    if (playerDrafts.some((player) => normalizeName(player.name) === normalizeName(playerName))) {
      setError('Ese jugador ya esta en la lista.');
      return;
    }

    setPlayerDrafts((current) => [
      ...current,
      {
        buyIn: newPlayer.buyIn,
        enabled: true,
        fixed: false,
        id: `custom-${crypto.randomUUID()}`,
        name: playerName
      }
    ]);
    setNewPlayer({ buyIn: form.buyIn || DEFAULT_BUY_IN, name: '' });
    setError(null);
  }

  function handleRemovePlayer(playerId: string): void {
    setPlayerDrafts((current) => current.filter((player) => player.id !== playerId));

    if (playerId === hostDraft?.id) {
      const nextHost = playerDrafts.find((player) => player.id !== playerId);
      if (nextHost) {
        setHostDraftId(nextHost.id);
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError(supabaseConfigError);
      return;
    }

    setIsSubmitting(true);

    const gameName = form.gameName.trim();
    const defaultBuyIn = toMoney(form.buyIn);
    const currency = form.currency.trim() || '€';
    const hostPlayer = hostDraft;
    const activePlayers = selectedDrafts;
    const invalidPlayer = activePlayers.find((player) => toMoney(player.buyIn) <= 0);

    if (!gameName || !hostPlayer || !Number.isFinite(defaultBuyIn) || defaultBuyIn <= 0) {
      setError('Introduce un nombre de partida, elige el anfitrion y revisa la recompra por defecto.');
      setIsSubmitting(false);
      return;
    }

    if (activePlayers.length === 0) {
      setError('Marca al menos un jugador para crear la partida.');
      setIsSubmitting(false);
      return;
    }

    if (invalidPlayer) {
      setError(`Revisa el importe inicial de ${invalidPlayer.name}.`);
      setIsSubmitting(false);
      return;
    }

    if (!deviceId) {
      setError('No se ha podido preparar la identidad local de este dispositivo.');
      setIsSubmitting(false);
      return;
    }

    try {
      let roomCreated = false;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const roomId = crypto.randomUUID();
        const playerId = crypto.randomUUID();
        const code = generateCode();

        const { error: roomError } = await supabase.from('rooms').insert({
          id: roomId,
          code,
          name: gameName,
          currency,
          default_buy_in: defaultBuyIn,
          host_player_id: playerId,
          status: 'lobby'
        });

        if (roomError) {
          if (roomError.message.toLowerCase().includes('duplicate')) {
            continue;
          }

          throw roomError;
        }

        const hostClaimedAt = new Date().toISOString();
        const playersToInsert = [
          {
            id: playerId,
            room_id: roomId,
            name: hostPlayer.name,
            initial_buy_in: toMoney(hostPlayer.buyIn),
            is_host: true,
            claimed_at: hostClaimedAt,
            claimed_by_device_id: deviceId
          },
          ...activePlayers.filter((player) => player.id !== hostPlayer.id).map((player) => ({
            id: crypto.randomUUID(),
            room_id: roomId,
            name: player.name,
            initial_buy_in: toMoney(player.buyIn),
            is_host: false,
            claimed_at: null,
            claimed_by_device_id: null
          }))
        ];

        const { error: playerError } = await supabase.from('players').insert(playersToInsert);

        if (playerError) {
          await supabase.from('rooms').delete().eq('id', roomId);
          throw playerError;
        }

        saveIdentity({
          playerId,
          playerName: hostPlayer.name,
          roomCode: code,
          isHost: true
        });

        roomCreated = true;
        const shareUrl = buildRoomShareUrl(code);
        setCreatedRoom({
          code,
          name: gameName,
          shareUrl
        });
        setShowQrModal(true);
        break;
      }

      if (!roomCreated) {
        setError('No se ha podido reservar un codigo unico para la sala. Intentalo otra vez.');
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError));
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
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Crear partida</p>
          <h1 className="mt-3 text-4xl font-black text-white">Prepara la mesa en menos de un minuto.</h1>
          <p className="mt-4 text-slate-300">
            Define la compra inicial por defecto, entra como anfitrion y comparte la sala por
            codigo, enlace o QR.
          </p>

          <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block text-sm font-medium text-slate-300">
              Nombre de la partida
              <div className="field-shell mt-2">
                <input
                  className="input-base"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, gameName: event.target.value }))
                  }
                  placeholder="Poker del viernes"
                  value={form.gameName}
                />
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-300">
              Quien crea la partida
              <div className="field-shell mt-2">
                <select
                  className="input-base"
                  onChange={(event) => handleHostChange(event.target.value)}
                  value={hostDraft?.id ?? ''}
                >
                  {playerDrafts.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                El anfitrion entra automaticamente en la sala y no se duplica en participantes.
              </p>
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-300">
                Recompra por defecto
                <div className="field-shell mt-2">
                  <input
                    className="input-base"
                    inputMode="decimal"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, buyIn: event.target.value }))
                    }
                    placeholder="5"
                    value={form.buyIn}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Esta cantidad se usara como valor rapido al anadir recompras durante la partida.
                </p>
              </label>

              <label className="block text-sm font-medium text-slate-300">
                Moneda
                <div className="field-shell mt-2">
                  <input
                    className="input-base"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, currency: event.target.value }))
                    }
                    placeholder="€"
                    value={form.currency}
                  />
                </div>
              </label>
            </div>

            <div className="rounded-3xl border border-emerald-500/10 bg-emerald-500/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Jugadores de la partida</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Marca quien juega hoy y ajusta la cantidad inicial de cada uno.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  {selectedDrafts.length} en mesa
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {playerDrafts.map((player) => {
                  const checked = player.enabled || player.id === hostDraft?.id;
                  const isHost = player.id === hostDraft?.id;

                  return (
                    <div
                      className={`rounded-2xl border p-3 transition ${
                        checked
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-50'
                          : 'border-white/10 bg-slate-950/70 text-slate-300'
                      }`}
                      key={player.id}
                    >
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-center">
                        <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-semibold">
                          <input
                            checked={checked}
                            className="h-5 w-5 accent-emerald-500"
                            disabled={isHost}
                            onChange={() => handleTogglePlayer(player.id)}
                            type="checkbox"
                          />
                          <span>
                            {player.name}
                            {isHost ? (
                              <span className="ml-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-100">
                                anfitrion
                              </span>
                            ) : null}
                          </span>
                        </label>

                        <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Inicial
                          <div className="field-shell mt-1">
                            <input
                              className="input-base text-right"
                              inputMode="decimal"
                              onChange={(event) => handlePlayerBuyInChange(player.id, event.target.value)}
                              value={player.buyIn}
                            />
                          </div>
                        </label>

                        {!player.fixed ? (
                          <button
                            className="secondary-button border-rose-500/30 px-4 text-rose-100 hover:bg-rose-500/10"
                            onClick={() => handleRemovePlayer(player.id)}
                            type="button"
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button className="secondary-button px-4" onClick={handleSelectAllPlayers} type="button">
                  Marcar todos
                </button>
                <button className="secondary-button px-4" onClick={handleClearPlayers} type="button">
                  Desmarcar todos
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
              <div>
                <p className="text-sm font-semibold text-white">Anadir jugador</p>
                <p className="mt-1 text-xs text-slate-400">
                  Para invitados o alguien que no este en la lista fija.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-end">
                <label className="block text-sm font-medium text-slate-300">
                  Nombre
                  <div className="field-shell mt-2">
                    <input
                      className="input-base"
                      onChange={(event) =>
                        setNewPlayer((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Nombre"
                      value={newPlayer.name}
                    />
                  </div>
                </label>

                <label className="block text-sm font-medium text-slate-300">
                  Inicial
                  <div className="field-shell mt-2">
                    <input
                      className="input-base text-right"
                      inputMode="decimal"
                      onChange={(event) =>
                        setNewPlayer((current) => ({ ...current, buyIn: event.target.value }))
                      }
                      value={newPlayer.buyIn}
                    />
                  </div>
                </label>

                <button className="primary-button px-4" onClick={handleAddPlayer} type="button">
                  Anadir
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">Vista previa de la mesa</p>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  {selectedDrafts.length} jugadores
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {selectedDrafts.map((player) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                    key={player.id}
                  >
                    <span className="font-medium">
                      {player.name}
                      {player.id === hostDraft?.id ? (
                        <span className="ml-2 text-xs text-amber-200">anfitrion</span>
                      ) : null}
                    </span>
                    <span className="font-semibold text-emerald-200">
                      {form.currency.trim() || '€'}
                      {toMoney(player.buyIn).toFixed(2)}
                    </span>
                  </div>
                ))}
                {selectedDrafts.length === 0 ? (
                  <span className="rounded-full border border-dashed border-white/10 px-3 py-2 text-sm text-slate-500">
                    Marca al menos un jugador para crear la partida.
                  </span>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              className="primary-button w-full"
              disabled={isSubmitting || !isSupabaseConfigured}
              type="submit"
            >
              {isSubmitting ? 'Creando partida...' : 'Crear partida'}
            </button>
          </form>
        </section>

        <section className="glass-card p-6 sm:p-8">
          {createdRoom ? (
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Sala lista</p>
                <h2 className="mt-3 text-4xl font-black text-white">{createdRoom.code}</h2>
                <p className="mt-2 text-slate-300">Entrando en la sala en 3 segundos.</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
                <p className="text-sm text-slate-400">Enlace para compartir</p>
                <p className="mt-2 break-all text-sm text-white">{createdRoom.shareUrl}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="primary-button"
                  onClick={() => void copyToClipboard(createdRoom.shareUrl)}
                >
                  Copiar enlace
                </button>
                <button className="secondary-button" onClick={() => setShowQrModal(true)}>
                  Ver QR
                </button>
                <a
                  className="secondary-button"
                  href={buildWhatsappShareUrl(shareText)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Compartir por WhatsApp
                </a>
                <button
                  className="secondary-button"
                  onClick={() => navigate(`/room/${createdRoom.code}`)}
                >
                  Entrar a la sala
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-between rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-500/10 to-slate-900/70 p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Vista del anfitrion</p>
                <h2 className="mt-3 text-3xl font-bold text-white">Que pasa despues?</h2>
              </div>
              <div className="mt-8 space-y-4 text-sm text-slate-300">
                <p>1. PokerNight crea un codigo privado de 5 caracteres para la sala.</p>
                <p>2. Tu entras automaticamente como anfitrion con la compra inicial por defecto.</p>
                <p>3. Tus amigos se unen por enlace o QR y la sala se actualiza en vivo.</p>
                <p>4. Al terminar, cierras la partida y PokerNight calcula quien paga a quien.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {createdRoom ? (
        <QRShareModal
          onClose={() => setShowQrModal(false)}
          open={showQrModal}
          roomCode={createdRoom.code}
          roomName={createdRoom.name}
          shareText={shareText}
          shareUrl={createdRoom.shareUrl}
        />
      ) : null}
    </main>
  );
}
