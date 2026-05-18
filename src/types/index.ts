import type { Database } from './database';

export type Room = Database['public']['Tables']['rooms']['Row'];
export type RoomInsert = Database['public']['Tables']['rooms']['Insert'];
export type RoomUpdate = Database['public']['Tables']['rooms']['Update'];

export type Player = Database['public']['Tables']['players']['Row'];
export type PlayerInsert = Database['public']['Tables']['players']['Insert'];
export type PlayerUpdate = Database['public']['Tables']['players']['Update'];

export type RebuyEvent = Database['public']['Tables']['rebuy_events']['Row'];
export type RebuyInsert = Database['public']['Tables']['rebuy_events']['Insert'];
export type RebuyUpdate = Database['public']['Tables']['rebuy_events']['Update'];

export type Settlement = Database['public']['Tables']['settlements']['Row'];
export type SettlementInsert = Database['public']['Tables']['settlements']['Insert'];

export type DinnerExpense = Database['public']['Tables']['dinner_expenses']['Row'];
export type DinnerExpenseInsert = Database['public']['Tables']['dinner_expenses']['Insert'];

export type RoomStatus = Database['public']['Enums']['room_status'];

export interface LocalPlayerIdentity {
  isHost: boolean;
  playerId: string;
  playerName: string;
  roomCode: string;
}

export interface PlayerSummary extends Player {
  balance: number | null;
  rebuyCount: number;
  rebuyHistory: RebuyEvent[];
  totalContributed: number;
  totalRebuyAmount: number;
}

export interface SettlementResult {
  amount: number;
  from: string;
  fromPlayerId: string;
  to: string;
  toPlayerId: string;
}

export interface SettlementComputationInput {
  finalAmount: number;
  id: string;
  name: string;
  totalContributed: number;
}

export interface SettlementBalanceInput {
  balance: number;
  id: string;
  name: string;
}

export interface CloseGamePlayerInput {
  finalAmount: number;
  playerId: string;
}

export type RealtimeState = 'connecting' | 'error' | 'live' | 'offline';
