import { useState } from 'react';

import { getPlayerProfile } from '../lib/playerProfiles';

interface PlayerAvatarProps {
  className?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl'
};

export default function PlayerAvatar({
  className = '',
  name,
  size = 'md'
}: PlayerAvatarProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const profile = getPlayerProfile(name);
  const sizeClass = SIZE_CLASSES[size];

  if (profile.photoUrl && !imageFailed) {
    return (
      <img
        alt={`Foto de ${name}`}
        className={`${sizeClass} rounded-2xl border border-white/10 object-cover shadow-lg shadow-slate-950/30 ${className}`}
        onError={() => setImageFailed(true)}
        src={profile.photoUrl}
      />
    );
  }

  return (
    <span
      aria-label={`Avatar de ${name}`}
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${profile.colorClass} font-black text-white shadow-lg shadow-slate-950/30 ${className}`}
      title={name}
    >
      {profile.initials}
    </span>
  );
}
