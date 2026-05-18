import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import PlayerAvatar from '../components/PlayerAvatar';
import { REGULAR_PLAYER_NAMES, normalizePlayerNameKey } from '../lib/playerProfiles';
import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';
import { formatCurrency, getErrorMessage, roundCurrency, sum } from '../lib/utils';
import type { Player, RebuyEvent, Room } from '../types';

type ClosedRoom = Pick<Room, 'closed_at' | 'code' | 'created_at' | 'currency' | 'id' | 'name'>;
type PlayerBalanceRecord = Pick<
  Player,
  'final_amount' | 'id' | 'initial_buy_in' | 'name' | 'room_id'
>;
type RebuyBalanceRecord = Pick<RebuyEvent, 'amount' | 'deleted_at' | 'player_id' | 'room_id'>;

interface GamePoint {
  roomCode: string;
  roomName: string;
  date: string;
  value: number;
}

interface PlayerTrend {
  average: number;
  best: number;
  color: string;
  gamesPlayed: number;
  key: string;
  name: string;
  points: GamePoint[];
  total: number;
  worst: number;
}

interface GameBalance {
  balances: Map<string, number>;
  closedAt: string;
  code: string;
  name: string;
}

const CHART_COLORS = [
  '#34d399',
  '#fb7185',
  '#60a5fa',
  '#fbbf24',
  '#a78bfa',
  '#2dd4bf',
  '#f97316',
  '#e879f9',
  '#94a3b8',
  '#22c55e'
];

function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(date));
}

function sortRoomsByCloseDate(rooms: ClosedRoom[]): ClosedRoom[] {
  return rooms.slice().sort((first, second) => {
    const firstDate = first.closed_at ?? first.created_at;
    const secondDate = second.closed_at ?? second.created_at;
    return new Date(firstDate).getTime() - new Date(secondDate).getTime();
  });
}

function buildPlayerTrends(
  rooms: ClosedRoom[],
  players: PlayerBalanceRecord[],
  rebuys: RebuyBalanceRecord[],
  selectedCurrency: string
): { games: GameBalance[]; trends: PlayerTrend[] } {
  const roomsForCurrency = sortRoomsByCloseDate(
    rooms.filter((room) => room.currency === selectedCurrency)
  );
  const roomIds = new Set(roomsForCurrency.map((room) => room.id));
  const playersForRooms = players.filter((player) => roomIds.has(player.room_id));
  const activeRebuys = rebuys.filter((rebuy) => roomIds.has(rebuy.room_id) && !rebuy.deleted_at);
  const rebuysByPlayerId = activeRebuys.reduce<Record<string, number>>((accumulator, rebuy) => {
    accumulator[rebuy.player_id] = roundCurrency((accumulator[rebuy.player_id] ?? 0) + rebuy.amount);
    return accumulator;
  }, {});
  const displayNames = new Map<string, string>();

  REGULAR_PLAYER_NAMES.forEach((playerName) => {
    displayNames.set(normalizePlayerNameKey(playerName), playerName);
  });

  const games = roomsForCurrency.map<GameBalance>((room) => {
    const balances = new Map<string, number>();
    const roomPlayers = playersForRooms.filter((player) => player.room_id === room.id);

    roomPlayers.forEach((player) => {
      if (player.final_amount === null) {
        return;
      }

      const key = normalizePlayerNameKey(player.name);
      if (!displayNames.has(key)) {
        displayNames.set(key, player.name.trim());
      }

      const contributed = roundCurrency(player.initial_buy_in + (rebuysByPlayerId[player.id] ?? 0));
      const balance = roundCurrency(player.final_amount - contributed);
      balances.set(key, roundCurrency((balances.get(key) ?? 0) + balance));
    });

    return {
      balances,
      closedAt: room.closed_at ?? room.created_at,
      code: room.code,
      name: room.name
    };
  });

  const playerKeys = Array.from(
    new Set([
      ...REGULAR_PLAYER_NAMES.map((playerName) => normalizePlayerNameKey(playerName)),
      ...games.flatMap((game) => Array.from(game.balances.keys()))
    ])
  );
  const cumulativeByKey = playerKeys.reduce<Record<string, number>>((accumulator, key) => {
    accumulator[key] = 0;
    return accumulator;
  }, {});
  const perPlayerBalances = playerKeys.reduce<Record<string, number[]>>((accumulator, key) => {
    accumulator[key] = [];
    return accumulator;
  }, {});
  const pointsByKey = playerKeys.reduce<Record<string, GamePoint[]>>((accumulator, key) => {
    accumulator[key] = [];
    return accumulator;
  }, {});

  games.forEach((game) => {
    playerKeys.forEach((key) => {
      const gameBalance = game.balances.get(key);
      if (gameBalance !== undefined) {
        perPlayerBalances[key].push(gameBalance);
        cumulativeByKey[key] = roundCurrency(cumulativeByKey[key] + gameBalance);
      }

      pointsByKey[key].push({
        date: game.closedAt,
        roomCode: game.code,
        roomName: game.name,
        value: cumulativeByKey[key]
      });
    });
  });

  return {
    games,
    trends: playerKeys
      .map((key, index) => {
        const balances = perPlayerBalances[key];
        const total = roundCurrency(cumulativeByKey[key]);

        return {
          average: balances.length > 0 ? roundCurrency(sum(balances) / balances.length) : 0,
          best: balances.length > 0 ? Math.max(...balances) : 0,
          color: CHART_COLORS[index % CHART_COLORS.length],
          gamesPlayed: balances.length,
          key,
          name: displayNames.get(key) ?? key,
          points: pointsByKey[key],
          total,
          worst: balances.length > 0 ? Math.min(...balances) : 0
        };
      })
      .sort((first, second) => {
        if (second.total !== first.total) {
          return second.total - first.total;
        }

        return second.gamesPlayed - first.gamesPlayed;
      })
  };
}

export default function Stats(): JSX.Element {
  const [rooms, setRooms] = useState<ClosedRoom[]>([]);
  const [players, setPlayers] = useState<PlayerBalanceRecord[]>([]);
  const [rebuys, setRebuys] = useState<RebuyBalanceRecord[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState('€');
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats(): Promise<void> {
      if (!isSupabaseConfigured) {
        setError(supabaseConfigError);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: closedRooms, error: roomsError } = await supabase
          .from('rooms')
          .select('id, code, name, currency, created_at, closed_at')
          .eq('status', 'closed');

        if (roomsError) {
          throw roomsError;
        }

        const sortedRooms = sortRoomsByCloseDate(closedRooms ?? []);
        const roomIds = sortedRooms.map((room) => room.id);

        if (roomIds.length === 0) {
          setRooms([]);
          setPlayers([]);
          setRebuys([]);
          setCurrencies([]);
          setLoading(false);
          return;
        }

        const [{ data: roomPlayers, error: playersError }, { data: rebuyEvents, error: rebuysError }] =
          await Promise.all([
            supabase
              .from('players')
              .select('id, room_id, name, initial_buy_in, final_amount')
              .in('room_id', roomIds),
            supabase
              .from('rebuy_events')
              .select('room_id, player_id, amount, deleted_at')
              .in('room_id', roomIds)
          ]);

        if (playersError) {
          throw playersError;
        }

        if (rebuysError) {
          throw rebuysError;
        }

        const nextCurrencies = Array.from(new Set(sortedRooms.map((room) => room.currency)));
        setRooms(sortedRooms);
        setPlayers(roomPlayers ?? []);
        setRebuys(rebuyEvents ?? []);
        setCurrencies(nextCurrencies);
        setSelectedCurrency((currentCurrency) =>
          nextCurrencies.includes(currentCurrency) ? currentCurrency : nextCurrencies[0] ?? '€'
        );
      } catch (statsError) {
        setError(getErrorMessage(statsError));
      } finally {
        setLoading(false);
      }
    }

    void loadStats();
  }, []);

  const { games, trends } = useMemo(
    () => buildPlayerTrends(rooms, players, rebuys, selectedCurrency),
    [players, rebuys, rooms, selectedCurrency]
  );

  const leader = trends[0] ?? null;
  const positiveTotal = sum(trends.filter((trend) => trend.total > 0).map((trend) => trend.total));
  const negativeTotal = sum(trends.filter((trend) => trend.total < 0).map((trend) => trend.total));

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link className="secondary-button px-4" to="/">
          Inicio
        </Link>
        {currencies.length > 1 ? (
          <div className="flex gap-2">
            {currencies.map((currency) => (
              <button
                className={currency === selectedCurrency ? 'primary-button px-4' : 'secondary-button px-4'}
                key={currency}
                onClick={() => setSelectedCurrency(currency)}
                type="button"
              >
                {currency}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Estadisticas</p>
            <h1 className="mt-3 text-4xl font-black text-white">Beneficio y perdida historicos</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              Evolucion acumulada por jugador usando las partidas cerradas. Los nombres iguales se
              agrupan automaticamente aunque alguien nuevo aparezca solo en algunas mesas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <Metric label="Partidas" value={String(games.length)} />
            <Metric label="Jugadores" value={String(trends.length)} />
            <Metric
              label="Lider"
              value={leader ? formatCurrency(leader.total, selectedCurrency) : '--'}
            />
            <Metric label="Positivo total" value={formatCurrency(positiveTotal, selectedCurrency)} />
            <Metric label="Negativo total" value={formatCurrency(negativeTotal, selectedCurrency)} />
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-4 text-slate-300">
          Cargando estadisticas...
        </div>
      ) : null}

      {!loading && !error && games.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-slate-950/70 p-6 text-slate-300">
          Todavia no hay partidas cerradas para dibujar la grafica.
        </div>
      ) : null}

      {!loading && games.length > 0 ? (
        <>
          <section className="glass-card mt-6 p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Grafica</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Balance acumulado</h2>
              </div>
              <p className="text-sm text-slate-400">
                {formatShortDate(games[0].closedAt)} - {formatShortDate(games[games.length - 1].closedAt)}
              </p>
            </div>
            <HistoryChart currency={selectedCurrency} games={games} trends={trends} />
          </section>

          <section className="mt-6 grid gap-4">
            {trends.map((trend) => (
              <article
                className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/30"
                key={trend.key}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar name={trend.name} />
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: trend.color }}
                    />
                    <div>
                      <h3 className="text-lg font-semibold text-white">{trend.name}</h3>
                      <p className="text-sm text-slate-400">{trend.gamesPlayed} partidas jugadas</p>
                    </div>
                  </div>
                  <p
                    className={
                      trend.total >= 0
                        ? 'text-2xl font-black text-emerald-300'
                        : 'text-2xl font-black text-rose-300'
                    }
                  >
                    {formatCurrency(trend.total, selectedCurrency)}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Metric label="Media" value={formatCurrency(trend.average, selectedCurrency)} />
                  <Metric label="Mejor noche" value={formatCurrency(trend.best, selectedCurrency)} />
                  <Metric label="Peor noche" value={formatCurrency(trend.worst, selectedCurrency)} />
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

interface HistoryChartProps {
  currency: string;
  games: GameBalance[];
  trends: PlayerTrend[];
}

function HistoryChart({ currency, games, trends }: HistoryChartProps): JSX.Element {
  const width = 760;
  const height = 320;
  const paddingX = 44;
  const paddingY = 34;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const values = trends.flatMap((trend) => trend.points.map((point) => point.value));
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const rangePadding = Math.max(5, (rawMax - rawMin) * 0.12);
  const minValue = rawMin - rangePadding;
  const maxValue = rawMax + rangePadding;
  const valueRange = maxValue - minValue || 1;
  const tickValues = Array.from({ length: 5 }, (_, index) =>
    roundCurrency(maxValue - (valueRange / 4) * index)
  );

  function getX(index: number): number {
    if (games.length <= 1) {
      return paddingX + chartWidth / 2;
    }

    return paddingX + (chartWidth / (games.length - 1)) * index;
  }

  function getY(value: number): number {
    return paddingY + ((maxValue - value) / valueRange) * chartHeight;
  }

  const zeroY = getY(0);

  return (
    <div className="mt-6">
      <svg
        aria-label="Grafica historica de beneficio y perdida"
        className="h-auto w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect fill="rgba(15, 23, 42, 0.55)" height={height} rx="18" width={width} />
        {tickValues.map((tick) => {
          const y = getY(tick);

          return (
            <g key={tick}>
              <line
                stroke="rgba(148, 163, 184, 0.18)"
                strokeDasharray="4 8"
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
              />
              <text fill="#94a3b8" fontSize="11" x="12" y={y + 4}>
                {formatCurrency(tick, currency)}
              </text>
            </g>
          );
        })}
        <line
          stroke="rgba(226, 232, 240, 0.45)"
          strokeWidth="1.5"
          x1={paddingX}
          x2={width - paddingX}
          y1={zeroY}
          y2={zeroY}
        />
        {trends.map((trend) => {
          const points = trend.points.map((point, index) => `${getX(index)},${getY(point.value)}`).join(' ');

          return (
            <polyline
              fill="none"
              key={trend.key}
              points={points}
              stroke={trend.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          );
        })}
        {games.map((game, index) => (
          <g key={game.code}>
            <circle cx={getX(index)} cy={height - paddingY + 2} fill="#94a3b8" r="3" />
            <text
              fill="#94a3b8"
              fontSize="11"
              textAnchor={index === 0 ? 'start' : index === games.length - 1 ? 'end' : 'middle'}
              x={getX(index)}
              y={height - 10}
            >
              {games.length > 6 ? game.code : formatShortDate(game.closedAt)}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-5 flex flex-wrap gap-2">
        {trends.map((trend) => (
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-200"
            key={trend.key}
          >
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: trend.color }} />
            {trend.name}
          </div>
        ))}
      </div>
    </div>
  );
}
