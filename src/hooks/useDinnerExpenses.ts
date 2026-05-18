import { useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase';
import { getErrorMessage } from '../lib/utils';
import type { DinnerExpense, RealtimeState } from '../types';

function sortDinnerExpenses(expenses: DinnerExpense[]): DinnerExpense[] {
  return expenses
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

export function useDinnerExpenses(roomId?: string) {
  const [dinnerExpenses, setDinnerExpenses] = useState<DinnerExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');

  async function fetchDinnerExpenses(): Promise<DinnerExpense[]> {
    if (!isSupabaseConfigured) {
      setDinnerExpenses([]);
      setError(supabaseConfigError);
      setLoading(false);
      setRealtimeState('offline');
      return [];
    }

    if (!roomId) {
      setDinnerExpenses([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('dinner_expenses')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(getErrorMessage(fetchError));
      setLoading(false);
      return [];
    }

    const nextExpenses = sortDinnerExpenses(data);
    setDinnerExpenses(nextExpenses);
    setError(null);
    setLoading(false);
    return nextExpenses;
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setDinnerExpenses([]);
      setError(supabaseConfigError);
      setLoading(false);
      setRealtimeState('offline');
      return;
    }

    if (!roomId) {
      setLoading(false);
      return;
    }

    void fetchDinnerExpenses();

    const channel = supabase
      .channel(`dinner-expenses:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dinner_expenses',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as DinnerExpense;
            setDinnerExpenses((current) => current.filter((expense) => expense.id !== deleted.id));
            return;
          }

          const nextExpense = payload.new as DinnerExpense;
          setDinnerExpenses((current) => {
            const exists = current.some((expense) => expense.id === nextExpense.id);
            const merged = exists
              ? current.map((expense) => (expense.id === nextExpense.id ? nextExpense : expense))
              : [nextExpense, ...current];

            return sortDinnerExpenses(merged);
          });
        }
      )
      .subscribe((status) => {
        setRealtimeState(mapRealtimeState(status));

        if (status === 'SUBSCRIBED') {
          void fetchDinnerExpenses();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  async function addDinnerExpense(input: {
    amount: number;
    createdByPlayerId: string;
    description: string;
    paidByPlayerId: string;
  }): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured) {
      return { error: supabaseConfigError };
    }

    if (!roomId) {
      return { error: 'Sala no encontrada.' };
    }

    const { error: insertError } = await supabase.from('dinner_expenses').insert({
      room_id: roomId,
      paid_by_player_id: input.paidByPlayerId,
      amount: input.amount,
      description: input.description,
      created_by_player_id: input.createdByPlayerId
    });

    return {
      error: insertError ? getErrorMessage(insertError) : null
    };
  }

  async function softDeleteDinnerExpense(expenseId: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured) {
      return { error: supabaseConfigError };
    }

    const { error: updateError } = await supabase
      .from('dinner_expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', expenseId);

    return {
      error: updateError ? getErrorMessage(updateError) : null
    };
  }

  return {
    addDinnerExpense,
    dinnerExpenses,
    error,
    loading,
    realtimeState,
    refetch: fetchDinnerExpenses,
    softDeleteDinnerExpense
  };
}
