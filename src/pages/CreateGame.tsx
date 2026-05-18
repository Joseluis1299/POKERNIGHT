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
  participants: string;
  yourName: string;
}

const CUSTOM_HOST_VALUE = '__custom_host__';

function parseParticipantNames(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(/[\n,;]+/)
    .map((name) => name.trim())
    .filter((name) => {
      if (name.length < 2) {
        return false;
      }

      const normalized = name.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function excludeHostName(names: string[], hostName: string): string[] {
  const normalizedHostName = hostName.trim().toLowerCase();

  if (!normalizedHostName) {
    return names;
  }

  return names.filter((name) => name.toLowerCase() !== normalizedHostName);
}

function buildParticipantNames(
  selectedFixedPlayers: string[],
  extraParticipants: string,
  hostName: string
): string[] {
  const selectedNames = [...selectedFixedPlayers, ...parseParticipantNames(extraParticipants)];

  return excludeHostName(
    parseParticipantNames(selectedNames.join('\n')),
    hostName
  );
}

export default function CreateGame(): JSX.Element {
  const navigate = useNavigate();
  const { deviceId, saveIdentity } = useLocalPlayer();
  const fixedPlayerOptions = useMemo<string[]>(() => [...REGULAR_PLAYER_NAMES], []);
  const [selectedFixedPlayers, setSelectedFixedPlayers] = useState<string[]>(fixedPlayerOptions);
  const [form, setForm] = useState<CreateGameFormState>({
    gameName: 'Poker del viernes',
    yourName: fixedPlayerOptions[0] ?? '',
    buyIn: '5',
    currency: '€',
    participants: ''
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

  const participantPreview = useMemo(
    () => buildParticipantNames(selectedFixedPlayers, form.participants, form.yourName),
    [form.participants, form.yourName, selectedFixedPlayers]
  );
  const hostSelectValue = fixedPlayerOptions.includes(
    form.yourName
  )
    ? form.yourName
    : CUSTOM_HOST_VALUE;

  function handleToggleFixedPlayer(playerName: string): void {
    setSelectedFixedPlayers((current) => {
      if (current.includes(playerName)) {
        return current.filter((name) => name !== playerName);
      }

      return [...current, playerName];
    });
    setError(null);
  }

  function handleSelectAllFixedPlayers(): void {
    setSelectedFixedPlayers(fixedPlayerOptions);
    setError(null);
  }

  function handleClearFixedPlayers(): void {
    setSelectedFixedPlayers([]);
    setError(null);
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
    const yourName = form.yourName.trim();
    const buyIn = Number(form.buyIn.replace(',', '.'));
    const currency = form.currency.trim() || '€';
    const participantNames = buildParticipantNames(selectedFixedPlayers, form.participants, yourName);

    if (!gameName || !yourName || !Number.isFinite(buyIn) || buyIn <= 0) {
      setError('Introduce un nombre de partida, elige quien eres y revisa que la compra inicial sea valida.');
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
          default_buy_in: buyIn,
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
            name: yourName,
            initial_buy_in: buyIn,
            is_host: true,
            claimed_at: hostClaimedAt,
            claimed_by_device_id: deviceId
          },
          ...participantNames.map((participantName) => ({
            id: crypto.randomUUID(),
            room_id: roomId,
            name: participantName,
            initial_buy_in: buyIn,
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
          playerName: yourName,
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
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setForm((current) => ({
                      ...current,
                      yourName: nextValue === CUSTOM_HOST_VALUE ? '' : nextValue
                    }));
                  }}
                  value={hostSelectValue}
                >
                  {fixedPlayerOptions.map((playerName) => (
                    <option key={playerName} value={playerName}>
                      {playerName}
                    </option>
                  ))}
                  <option value={CUSTOM_HOST_VALUE}>Otro nombre</option>
                </select>
              </div>
            </label>

            {hostSelectValue === CUSTOM_HOST_VALUE ? (
              <label className="block text-sm font-medium text-slate-300">
                Nombre del anfitrion
                <div className="field-shell mt-2">
                  <input
                    className="input-base"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, yourName: event.target.value }))
                    }
                    placeholder="Juan"
                    value={form.yourName}
                  />
                </div>
              </label>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-300">
                Compra inicial
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
                  <p className="text-sm font-semibold text-white">Jugadores fijos</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Marca los habituales que juegan hoy. Si viene alguien nuevo, anadelo debajo
                    como invitado.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  {selectedFixedPlayers.length} de {fixedPlayerOptions.length} marcados
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {fixedPlayerOptions.map((playerName) => {
                  const checked = selectedFixedPlayers.includes(playerName);

                  return (
                    <label
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                        checked
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-50'
                          : 'border-white/10 bg-slate-950/70 text-slate-300'
                      }`}
                      key={playerName}
                    >
                      <input
                        checked={checked}
                        className="h-5 w-5 accent-emerald-500"
                        onChange={() => handleToggleFixedPlayer(playerName)}
                        type="checkbox"
                      />
                      {playerName}
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button className="secondary-button px-4" onClick={handleSelectAllFixedPlayers} type="button">
                  Marcar todos
                </button>
                <button className="secondary-button px-4" onClick={handleClearFixedPlayers} type="button">
                  Desmarcar todos
                </button>
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-300">
              Invitados o jugadores extra
              <div className="field-shell mt-2">
                <textarea
                  className="input-base min-h-[160px] resize-y py-4"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, participants: event.target.value }))
                  }
                  placeholder={'Maria\nLuis\nCarlos'}
                  value={form.participants}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Puedes dejar esto vacio y crear la partida solo con los fijos marcados. Si escribes
                aqui, usa un nombre por linea o separalos por comas.
              </p>
            </label>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">Vista previa de participantes</p>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  {participantPreview.length + 1} en mesa contando al anfitrion
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
                  {form.yourName.trim() || 'Anfitrion'}
                </span>
                {participantPreview.map((participantName) => (
                  <span
                    className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                    key={participantName}
                  >
                    {participantName}
                  </span>
                ))}
                {participantPreview.length === 0 ? (
                  <span className="rounded-full border border-dashed border-white/10 px-3 py-2 text-sm text-slate-500">
                    Anade aqui al resto de jugadores si quieres dejarlos preparados antes de
                    compartir el enlace.
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
