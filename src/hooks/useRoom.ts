import { useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';
import { getErrorMessage, normalizeRoomCode } from '../lib/utils';
import type { RealtimeState, Room, RoomStatus, RoomUpdate } from '../types';

function mapRealtimeState(status: string): RealtimeState {
  if (status === 'SUBSCRIBED') {
    return 'live';
  }

  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    return 'error';
  }

  if (status === 'CLOSED') {
    return 'offline';
  }

  return 'connecting';
}

export function useRoom(roomCode?: string) {
  const normalizedCode = useMemo(() => normalizeRoomCode(roomCode ?? ''), [roomCode]);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');

  async function fetchRoom(): Promise<Room | null> {
    if (!isSupabaseConfigured) {
      setError(supabaseConfigError);
      setRoom(null);
      setLoading(false);
      setRealtimeState('offline');
      return null;
    }

    if (!normalizedCode) {
      setRoom(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (fetchError) {
      setError(getErrorMessage(fetchError));
      setLoading(false);
      return null;
    }

    setRoom(data);
    setError(null);
    setLoading(false);
    return data;
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(supabaseConfigError);
      setLoading(false);
      setRealtimeState('offline');
      return;
    }

    if (!normalizedCode) {
      setLoading(false);
      return;
    }

    void fetchRoom();

    const channel = supabase
      .channel(`room:${normalizedCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `code=eq.${normalizedCode}`
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setRoom(null);
            return;
          }

          setRoom(payload.new as Room);
        }
      )
      .subscribe((status) => {
        setRealtimeState(mapRealtimeState(status));

        if (status === 'SUBSCRIBED') {
          void fetchRoom();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [normalizedCode]);

  async function updateRoom(update: RoomUpdate): Promise<{ data: Room | null; error: string | null }> {
    if (!isSupabaseConfigured) {
      return {
        data: null,
        error: supabaseConfigError
      };
    }

    if (!room) {
      return {
        data: null,
        error: 'Sala no encontrada.'
      };
    }

    const { data, error: updateError } = await supabase
      .from('rooms')
      .update(update)
      .eq('id', room.id)
      .select('*')
      .single();

    if (updateError) {
      return {
        data: null,
        error: getErrorMessage(updateError)
      };
    }

    setRoom(data);
    return {
      data,
      error: null
    };
  }

  async function setStatus(status: RoomStatus): Promise<{ error: string | null }> {
    const { error: updateError } = await updateRoom({
      status,
      closed_at: status === 'closed' ? new Date().toISOString() : null
    });

    return { error: updateError };
  }

  return {
    error,
    loading,
    realtimeState,
    refetch: fetchRoom,
    room,
    setStatus,
    updateRoom
  };
}
