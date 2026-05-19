import { useState } from 'react';

import { getPlayerProfile } from '../lib/playerProfiles';

interface PlayerAvatarProps {
  className?: string;
  name: string;
  photoSize?: AvatarSize;
  size?: AvatarSize;
}

type AvatarSize = 'sm' | 'md' | 'lg' | 'hero';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
  hero: 'h-36 w-36 text-2xl sm:h-44 sm:w-44 lg:h-48 lg:w-48'
};

export default function PlayerAvatar({
  className = '',
  name,
  photoSize,
  size = 'md'
}: PlayerAvatarProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const profile = getPlayerProfile(name);
  const hasPhoto = Boolean(profile.photoUrl) && !imageFailed;
  const sizeClass = SIZE_CLASSES[hasPhoto ? photoSize ?? size : size];

  if (hasPhoto && profile.photoUrl) {
    return (
      <img
        alt={`Foto de ${name}`}
        className={`${sizeClass} shrink-0 rounded-3xl border border-white/10 object-cover shadow-lg shadow-slate-950/30 ${className}`}
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
