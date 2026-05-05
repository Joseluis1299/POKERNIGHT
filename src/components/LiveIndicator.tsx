import type { RealtimeState } from '../types';

const stateStyles: Record<RealtimeState, string> = {
  live: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]',
  connecting: 'bg-sky-400',
  error: 'bg-rose-400',
  offline: 'bg-slate-500'
};

const stateLabel: Record<RealtimeState, string> = {
  live: 'En vivo',
  connecting: 'Conectando',
  error: 'Reconectando',
  offline: 'Sin conexion'
};

interface LiveIndicatorProps {
  state: RealtimeState;
}

export default function LiveIndicator({ state }: LiveIndicatorProps): JSX.Element {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200">
      <span className={`h-2.5 w-2.5 rounded-full ${stateStyles[state]}`} />
      <span>{stateLabel[state]}</span>
    </div>
  );
}
