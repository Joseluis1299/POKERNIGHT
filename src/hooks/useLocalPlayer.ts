import { useEffect, useState } from 'react';

import type { LocalPlayerIdentity } from '../types';

import { APP_STORAGE_KEYS, normalizeRoomCode } from '../lib/utils';

const IDENTITY_STORAGE_KEYS = [
  APP_STORAGE_KEYS.playerId,
  APP_STORAGE_KEYS.playerName,
  APP_STORAGE_KEYS.roomCode,
  APP_STORAGE_KEYS.roomHost
] as const;

function readIdentity(): LocalPlayerIdentity | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const playerId = window.localStorage.getItem(APP_STORAGE_KEYS.playerId);
  const roomCode = window.localStorage.getItem(APP_STORAGE_KEYS.roomCode);
  const playerName = window.localStorage.getItem(APP_STORAGE_KEYS.playerName);
  const isHost = window.localStorage.getItem(APP_STORAGE_KEYS.roomHost) === 'true';

  if (!playerId || !roomCode || !playerName) {
    return null;
  }

  return {
    playerId,
    roomCode,
    playerName,
    isHost
  };
}

function ensureDeviceId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const existingDeviceId = window.localStorage.getItem(APP_STORAGE_KEYS.deviceId);
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const nextDeviceId = crypto.randomUUID();
  window.localStorage.setItem(APP_STORAGE_KEYS.deviceId, nextDeviceId);
  return nextDeviceId;
}

export function useLocalPlayer() {
  const [identity, setIdentity] = useState<LocalPlayerIdentity | null>(() => readIdentity());
  const [deviceId, setDeviceId] = useState<string | null>(() => ensureDeviceId());

  useEffect(() => {
    const syncIdentity = (): void => {
      setIdentity(readIdentity());
      setDeviceId(ensureDeviceId());
    };

    setDeviceId(ensureDeviceId());
    window.addEventListener('storage', syncIdentity);
    return () => window.removeEventListener('storage', syncIdentity);
  }, []);

  function saveIdentity(nextIdentity: LocalPlayerIdentity): void {
    window.localStorage.setItem(APP_STORAGE_KEYS.playerId, nextIdentity.playerId);
    window.localStorage.setItem(APP_STORAGE_KEYS.roomCode, normalizeRoomCode(nextIdentity.roomCode));
    window.localStorage.setItem(APP_STORAGE_KEYS.playerName, nextIdentity.playerName);
    window.localStorage.setItem(APP_STORAGE_KEYS.roomHost, String(nextIdentity.isHost));
    setIdentity({
      ...nextIdentity,
      roomCode: normalizeRoomCode(nextIdentity.roomCode)
    });
  }

  function clearIdentity(): void {
    IDENTITY_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });
    setIdentity(null);
  }

  return {
    identity,
    clearIdentity,
    deviceId,
    isCurrentPlayer: (playerId: string): boolean => identity?.playerId === playerId,
    isInRoom: (roomCode: string): boolean =>
      normalizeRoomCode(identity?.roomCode ?? '') === normalizeRoomCode(roomCode),
    playerId: identity?.playerId ?? null,
    playerName: identity?.playerName ?? null,
    roomCode: identity?.roomCode ?? null,
    saveIdentity
  };
}
