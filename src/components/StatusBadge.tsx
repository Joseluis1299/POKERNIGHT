import type { RoomStatus } from '../types';

interface StatusBadgeProps {
  status: RoomStatus;
}

const badgeMap: Record<RoomStatus, string> = {
  lobby: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
  active: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  closed: 'border-slate-400/30 bg-slate-500/10 text-slate-200'
};

const labelMap: Record<RoomStatus, string> = {
  lobby: 'Espera',
  active: 'Activa',
  closed: 'Cerrada'
};

export default function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${badgeMap[status]}`}
    >
      {labelMap[status]}
    </span>
  );
}
