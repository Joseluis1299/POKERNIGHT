import { useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';
import { getErrorMessage } from '../lib/utils';
import type { Player, PlayerUpdate, RealtimeState } from '../types';

function sortPlayers(players: Player[]): Player[] {
  return players.slice().sort((first, second) => {
    if (first.is_host !== second.is_host) {
      return first.is_host ? -1 : 1;
    }

    const firstClaimed = Boolean(first.claimed_by_device_id);
    const secondClaimed = Boolean(second.claimed_by_device_id);
    if (firstClaimed !== secondClaimed) {
      return firstClaimed ? -1 : 1;
    }

    const firstTimestamp = first.claimed_at ?? first.joined_at;
    const secondTimestamp = second.claimed_at ?? second.joined_at;
    const timeDifference =
      new Date(firstTimestamp).getTime() - new Date(secondTimestamp).getTime();

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return first.name.localeCompare(second.name, 'es', { sensitivity: 'base' });
  });
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

export function usePlayers(roomId?: string) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');

  async function fetchPlayers(): Promise<Player[]> {
    if (!isSupabaseConfigured) {
      setPlayers([]);
      setError(supabaseConfigError);
      setLoading(false);
      setRealtimeState('offline');
      return [];
    }

    if (!roomId) {
      setPlayers([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (fetchError) {
      setError(getErrorMessage(fetchError));
      setLoading(false);
      return [];
    }

    const nextPlayers = sortPlayers(data);
    setPlayers(nextPlayers);
    setError(null);
    setLoading(false);
    return nextPlayers;
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setPlayers([]);
      setError(supabaseConfigError);
      setLoading(false);
      setRealtimeState('offline');
      return;
    }

    if (!roomId) {
      setLoading(false);
      return;
    }

    void fetchPlayers();

    const channel = supabase
      .channel(`players:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Player;
            setPlayers((current) => current.filter((player) => player.id !== deleted.id));
            return;
          }

          const nextPlayer = payload.new as Player;
          setPlayers((current) => {
            const exists = current.some((player) => player.id === nextPlayer.id);
            const merged = exists
              ? current.map((player) => (player.id === nextPlayer.id ? nextPlayer : player))
              : [...current, nextPlayer];

            return sortPlayers(merged);
          });
        }
      )
      .subscribe((status) => {
        setRealtimeState(mapRealtimeState(status));

        if (status === 'SUBSCRIBED') {
          void fetchPlayers();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  async function updatePlayer(
    playerId: string,
    update: PlayerUpdate
  ): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured) {
      return { error: supabaseConfigError };
    }

    const { error: updateError } = await supabase
      .from('players')
      .update(update)
      .eq('id', playerId);

    return {
      error: updateError ? getErrorMessage(updateError) : null
    };
  }

  async function bulkUpdateFinalAmounts(
    updates: Array<{ playerId: string; finalAmount: number | null }>
  ): Promise<{ error: string | null }> {
    for (const update of updates) {
      const { error: updateError } = await updatePlayer(update.playerId, {
        final_amount: update.finalAmount
      });

      if (updateError) {
        return { error: updateError };
      }
    }

    return { error: null };
  }

  async function clearFinalAmounts(): Promise<{ error: string | null }> {
    for (const player of players) {
      const { error: updateError } = await updatePlayer(player.id, {
        final_amount: null
      });

      if (updateError) {
        return { error: updateError };
      }
    }

    return { error: null };
  }

  async function removePlayer(playerId: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured) {
      return { error: supabaseConfigError };
    }

    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('id', playerId);

    return {
      error: deleteError ? getErrorMessage(deleteError) : null
    };
  }

  return {
    bulkUpdateFinalAmounts,
    clearFinalAmounts,
    error,
    loading,
    players,
    realtimeState,
    refetch: fetchPlayers,
    removePlayer,
    updatePlayer
  };
}
