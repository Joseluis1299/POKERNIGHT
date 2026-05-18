export interface PlayerProfile {
  colorClass: string;
  initials: string;
  name: string;
  photoUrl: string | null;
}

export const REGULAR_PLAYER_NAMES = [
  'Jose Luis',
  'Mario Moral',
  'Franchoje',
  'Carlos Ruiz',
  'Pablo Cabañas',
  'Thiago',
  'Costin',
  'Fortu'
] as const;

const PLAYER_PHOTOS: Record<string, string> = {
  'jose luis': 'players/jose-luis.jpg',
  'mario moral': 'players/mario-moral.jpg',
  franchoje: 'players/franchoje.jpg',
  'carlos ruiz': 'players/carlos-ruiz.jpg',
  'pablo cabanas': 'players/pablo-cabanas.jpg',
  thiago: 'players/thiago.jpg',
  costin: 'players/costin.jpg',
  fortu: 'players/fortu.jpg'
};

const AVATAR_COLORS = [
  'from-emerald-400 to-teal-700',
  'from-amber-300 to-orange-700',
  'from-sky-400 to-blue-800',
  'from-rose-400 to-red-800',
  'from-fuchsia-400 to-pink-800',
  'from-lime-300 to-green-800',
  'from-cyan-300 to-slate-700',
  'from-violet-400 to-indigo-800'
];

export function normalizePlayerNameKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getStableColorClass(name: string): string {
  const key = normalizePlayerNameKey(name);
  const hash = Array.from(key).reduce((accumulator, character) => {
    return accumulator + character.charCodeAt(0);
  }, 0);

  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getPlayerProfile(name: string): PlayerProfile {
  const normalizedName = normalizePlayerNameKey(name);
  const knownName =
    REGULAR_PLAYER_NAMES.find((playerName) => normalizePlayerNameKey(playerName) === normalizedName) ??
    name;
  const photoPath = PLAYER_PHOTOS[normalizedName] ?? null;

  return {
    colorClass: getStableColorClass(knownName),
    initials: getInitials(knownName),
    name: knownName,
    photoUrl: photoPath
  };
}
