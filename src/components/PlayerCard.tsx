import { useEffect, useMemo, useState } from 'react';

import PlayerAvatar from './PlayerAvatar';
import type { PlayerSummary, RoomStatus } from '../types';

import { formatCurrency, formatDateTime, formatTime } from '../lib/utils';

interface PlayerCardProps {
  canAddRebuy: boolean;
  canDeleteRebuy: boolean;
  canRemovePlayer: boolean;
  creatorNames: Record<string, string>;
  currency: string;
  onAddRebuy: () => void;
  onDeleteRebuy: (rebuyId: string) => Promise<void>;
  onRemovePlayer: () => Promise<void>;
  player: PlayerSummary;
  roomStatus: RoomStatus;
}

function CrownIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 text-amber-300"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 18h16l-1.8-8-4.2 3-2-5-2 5-4.2-3L4 18Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export default function PlayerCard({
  canAddRebuy,
  canDeleteRebuy,
  canRemovePlayer,
  creatorNames,
  currency,
  onAddRebuy,
  onDeleteRebuy,
  onRemovePlayer,
  player,
  roomStatus
}: PlayerCardProps): JSX.Element {
  const [showHistory, setShowHistory] = useState(false);
  const [flash, setFlash] = useState(false);
  const balanceKey = useMemo(() => `${player.id}:${player.balance ?? 'pendiente'}`, [player.balance, player.id]);
  const isClaimed = Boolean(player.claimed_by_device_id);

  useEffect(() => {
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(timer);
  }, [balanceKey]);

  return (
    <article
      className={`rounded-[1.75rem] border border-white/10 bg-slate-900/90 p-5 shadow-xl shadow-slate-950/40 transition ${flash ? 'balance-flash' : ''}`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex items-start gap-4">
          <PlayerAvatar name={player.name} photoSize="hero" size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-white">{player.name}</h3>
              {player.is_host ? <CrownIcon /> : null}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {isClaimed && player.claimed_at
                ? `Conectado el ${formatDateTime(player.claimed_at)}`
                : 'Pendiente de entrar desde el enlace'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Compra inicial" value={formatCurrency(player.initial_buy_in, currency)} />
          <Stat label="Recompras" value={`${player.rebuyCount} · ${formatCurrency(player.totalRebuyAmount, currency)}`} />
          <Stat label="Aportado" value={formatCurrency(player.totalContributed, currency)} />
          <Stat
            label="Importe final"
            value={
              player.final_amount === null && roomStatus !== 'closed'
                ? 'Pendiente de cierre'
                : formatCurrency(player.final_amount ?? 0, currency)
            }
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Balance</p>
            <p
              className={`mt-2 text-2xl font-bold ${
                player.balance === null
                  ? 'text-slate-300'
                  : player.balance >= 0
                    ? 'text-emerald-300'
                    : 'text-rose-300'
              }`}
            >
              {player.balance === null ? 'Pendiente de cierre' : formatCurrency(player.balance, currency)}
            </p>
          </div>

          {roomStatus !== 'closed' && canAddRebuy ? (
            <button className="primary-button px-4" onClick={onAddRebuy}>
              Anadir recompra
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          className="secondary-button flex-1"
          onClick={() => setShowHistory((current) => !current)}
          type="button"
        >
          {showHistory ? 'Ocultar historial de recompras' : 'Ver historial de recompras'}
        </button>

        {canRemovePlayer ? (
          <button
            className="secondary-button flex-1 border-rose-500/30 text-rose-100 hover:bg-rose-500/10"
            onClick={() => void onRemovePlayer()}
            type="button"
          >
            Eliminar jugador
          </button>
        ) : null}
      </div>

      {showHistory ? (
        <div className="mt-4 space-y-3">
          {player.rebuyHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 p-4 text-sm text-slate-400">
              Todavia no hay recompras.
            </div>
          ) : (
            player.rebuyHistory.map((rebuy) => (
              <div
                className={`rounded-2xl border p-4 text-sm ${
                  rebuy.deleted_at
                    ? 'border-rose-500/20 bg-rose-500/5 text-slate-400'
                    : 'border-white/10 bg-slate-950/70 text-slate-200'
                }`}
                key={rebuy.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {formatCurrency(rebuy.amount, currency)}
                      {rebuy.deleted_at ? ' · eliminada' : ''}
                    </p>
                    <p className="mt-1 text-slate-400">
                      Anadida por {creatorNames[rebuy.created_by_player_id] ?? 'Desconocido'} a las{' '}
                      {formatTime(rebuy.created_at)}
                    </p>
                  </div>
                  {canDeleteRebuy && !rebuy.deleted_at ? (
                    <button
                      className="secondary-button border-rose-500/30 px-4 text-rose-100 hover:bg-rose-500/10"
                      onClick={() => void onDeleteRebuy(rebuy.id)}
                      type="button"
                    >
                      Eliminar recompra
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-100">{value}</p>
    </div>
  );
}
