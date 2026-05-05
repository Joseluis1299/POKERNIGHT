import { useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';
import { getErrorMessage } from '../lib/utils';
import type { RealtimeState, RebuyEvent } from '../types';

function sortRebuys(rebuys: RebuyEvent[]): RebuyEvent[] {
  return rebuys
    .slice()
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());
}

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

export function useRebuys(roomId?: string) {
  const [rebuys, setRebuys] = useState<RebuyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');

  async function fetchRebuys(): Promise<RebuyEvent[]> {
    if (!isSupabaseConfigured) {
      setRebuys([]);
      setError(supabaseConfigError);
      setLoading(false);
      setRealtimeState('offline');
      return [];
    }

    if (!roomId) {
      setRebuys([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('rebuy_events')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(getErrorMessage(fetchError));
      setLoading(false);
      return [];
    }

    const nextRebuys = sortRebuys(data);
    setRebuys(nextRebuys);
    setError(null);
    setLoading(false);
    return nextRebuys;
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setRebuys([]);
      setError(supabaseConfigError);
      setLoading(false);
      setRealtimeState('offline');
      return;
    }

    if (!roomId) {
      setLoading(false);
      return;
    }

    void fetchRebuys();

    const channel = supabase
      .channel(`rebuys:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rebuy_events',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as RebuyEvent;
            setRebuys((current) => current.filter((rebuy) => rebuy.id !== deleted.id));
            return;
          }

          const nextRebuy = payload.new as RebuyEvent;
          setRebuys((current) => {
            const exists = current.some((rebuy) => rebuy.id === nextRebuy.id);
            const merged = exists
              ? current.map((rebuy) => (rebuy.id === nextRebuy.id ? nextRebuy : rebuy))
              : [nextRebuy, ...current];

            return sortRebuys(merged);
          });
        }
      )
      .subscribe((status) => {
        setRealtimeState(mapRealtimeState(status));

        if (status === 'SUBSCRIBED') {
          void fetchRebuys();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  async function addRebuy(input: {
    amount: number;
    createdByPlayerId: string;
    playerId: string;
  }): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured) {
      return { error: supabaseConfigError };
    }

    if (!roomId) {
      return { error: 'Sala no encontrada.' };
    }

    const { error: insertError } = await supabase.from('rebuy_events').insert({
      room_id: roomId,
      player_id: input.playerId,
      amount: input.amount,
      created_by_player_id: input.createdByPlayerId
    });

    return {
      error: insertError ? getErrorMessage(insertError) : null
    };
  }

  async function softDeleteRebuy(rebuyId: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured) {
      return { error: supabaseConfigError };
    }

    const { error: updateError } = await supabase
      .from('rebuy_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', rebuyId);

    return {
      error: updateError ? getErrorMessage(updateError) : null
    };
  }

  return {
    addRebuy,
    error,
    loading,
    realtimeState,
    rebuys,
    refetch: fetchRebuys,
    softDeleteRebuy
  };
}
