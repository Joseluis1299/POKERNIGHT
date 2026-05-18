import type { DinnerExpense, PlayerSummary, SettlementResult } from '../types';

export const APP_STORAGE_KEYS = {
  deviceId: 'pokernight.deviceId',
  installBannerDismissed: 'pokernight.installBannerDismissed',
  playerId: 'pokernight.playerId',
  playerName: 'pokernight.playerName',
  regularPlayers: 'pokernight.regularPlayers',
  roomCode: 'pokernight.roomCode',
  roomHost: 'pokernight.isHost'
} as const;

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function generateCode(length = 5): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));

  return Array.from(bytes, (byte) => ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]).join('');
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isNearlyZero(value: number, epsilon = 0.01): boolean {
  return Math.abs(value) < epsilon;
}

export function formatCurrency(amount: number | null | undefined, currency = '€'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '--';
  }

  const rounded = roundCurrency(amount);

  if (/^[A-Z]{3}$/i.test(currency)) {
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(rounded);
    } catch {
      return `${currency.toUpperCase()} ${rounded.toFixed(2)}`;
    }
  }

  return `${currency}${rounded.toFixed(2)}`;
}

export function formatSignedCurrency(amount: number, currency = '€'): string {
  const rounded = roundCurrency(amount);

  if (isNearlyZero(rounded)) {
    return formatCurrency(0, currency);
  }

  return `${rounded > 0 ? '+' : '-'}${formatCurrency(Math.abs(rounded), currency)}`;
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
}

export function formatTime(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

export function toNumber(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sum(values: number[]): number {
  return roundCurrency(values.reduce((accumulator, value) => accumulator + value, 0));
}

export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function buildRoomShareUrl(code: string): string {
  if (typeof window === 'undefined') {
    return `/#/join?code=${normalizeRoomCode(code)}`;
  }

  const url = new URL(window.location.pathname, window.location.origin);
  url.hash = `/join?code=${normalizeRoomCode(code)}`;
  return url.toString();
}

export function buildWhatsappShareUrl(text: string): string {
  const url = new URL('https://wa.me/');
  url.searchParams.set('text', text);
  return url.toString();
}

interface ErrorLike {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
  status?: number;
}

function isErrorLike(error: unknown): error is ErrorLike {
  return typeof error === 'object' && error !== null;
}

function normalizeErrorField(value: string | number | undefined): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '';
}

function getSupabaseFriendlyMessage(error: ErrorLike): string | null {
  const code = normalizeErrorField(error.code).toUpperCase();
  const message = normalizeErrorField(error.message);
  const details = normalizeErrorField(error.details);
  const hint = normalizeErrorField(error.hint);
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  if (
    code === 'PGRST205' ||
    combined.includes("could not find the table 'public.rooms'") ||
    combined.includes("could not find the table 'public.players'") ||
    combined.includes("could not find the table 'public.rebuy_events'") ||
    combined.includes("could not find the table 'public.dinner_expenses'") ||
    combined.includes("could not find the table 'public.settlements'") ||
    combined.includes('schema cache')
  ) {
    return 'Tu proyecto de Supabase aun no tiene las tablas de PokerNight. Abre el SQL Editor, ejecuta schema.sql y vuelve a intentarlo.';
  }

  if (
    combined.includes('fetch failed') ||
    combined.includes('failed to fetch') ||
    combined.includes('network') ||
    combined.includes('getaddrinfo')
  ) {
    return 'No se ha podido conectar con Supabase. Revisa tu conexion y la configuracion del proyecto.';
  }

  if (message) {
    return [message, details, hint].filter(Boolean).join(' ');
  }

  return null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return getSupabaseFriendlyMessage({ message: error.message }) ?? error.message;
  }

  if (isErrorLike(error)) {
    const message = getSupabaseFriendlyMessage(error);

    if (message) {
      return message;
    }
  }

  return 'Ha ocurrido un error. Intentalo de nuevo.';
}

export function buildSummaryText(
  roomName: string,
  currency: string,
  players: PlayerSummary[],
  settlements: SettlementResult[],
  options: {
    dinnerExpenses?: DinnerExpense[];
    dinnerSettlements?: SettlementResult[];
    globalRows?: Array<{
      dinnerBalance: number;
      globalBalance: number;
      name: string;
      pokerBalance: number;
    }>;
    globalSettlements?: SettlementResult[];
    playerNames?: Record<string, string>;
  } = {}
): string {
  const rankingLines = players
    .slice()
    .sort((first, second) => (second.balance ?? 0) - (first.balance ?? 0))
    .map((player, index) => {
      const balance = player.balance ?? 0;
      return `${index + 1}. ${player.name} | Aportado ${formatCurrency(
        player.totalContributed,
        currency
      )} | Final ${formatCurrency(player.final_amount ?? 0, currency)} | Balance ${formatCurrency(
        balance,
        currency
      )}`;
    });

  const formatSettlementLines = (
    nextSettlements: SettlementResult[],
    emptyText: string
  ): string[] =>
    nextSettlements.length > 0
      ? nextSettlements.map(
          (settlement) =>
            `${settlement.from} paga ${formatCurrency(settlement.amount, currency)} a ${settlement.to}`
        )
      : [emptyText];

  const activeDinnerExpenses = (options.dinnerExpenses ?? []).filter((expense) => !expense.deleted_at);
  const playerNames = options.playerNames ?? {};
  const dinnerExpenseLines =
    activeDinnerExpenses.length > 0
      ? activeDinnerExpenses.map((expense) => {
          const paidBy = playerNames[expense.paid_by_player_id] ?? 'Jugador desconocido';
          return `${expense.description}: ${paidBy} adelanto ${formatCurrency(expense.amount, currency)}`;
        })
      : ['Sin gastos de cena.'];
  const globalRows = options.globalRows ?? [];
  const globalDetailLines =
    globalRows.length > 0
      ? globalRows.map(
          (row) =>
            `${row.name} | Poker ${formatSignedCurrency(
              row.pokerBalance,
              currency
            )} | Cena ${formatSignedCurrency(row.dinnerBalance, currency)} | Total ${formatSignedCurrency(
              row.globalBalance,
              currency
            )}`
        )
      : ['Sin detalle global.'];

  return [
    `${roomName} - PokerNight`,
    '',
    'CUENTAS POKER',
    ...formatSettlementLines(settlements, 'No hace falta ningun pago de poker.'),
    '',
    'GASTOS CENA',
    ...dinnerExpenseLines,
    '',
    'CUENTAS CENA',
    ...formatSettlementLines(options.dinnerSettlements ?? [], 'No hace falta ningun pago de cena.'),
    '',
    'CUENTA GLOBAL',
    ...formatSettlementLines(options.globalSettlements ?? [], 'No hace falta ningun pago global.'),
    '',
    'DETALLE GLOBAL',
    ...globalDetailLines,
    '',
    'Clasificacion final',
    ...rankingLines
  ].join('\n');
}
