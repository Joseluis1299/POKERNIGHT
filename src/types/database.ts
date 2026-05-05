export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      players: {
        Row: {
          claimed_at: string | null;
          claimed_by_device_id: string | null;
          final_amount: number | null;
          id: string;
          initial_buy_in: number;
          is_host: boolean;
          joined_at: string;
          name: string;
          room_id: string;
        };
        Insert: {
          claimed_at?: string | null;
          claimed_by_device_id?: string | null;
          final_amount?: number | null;
          id?: string;
          initial_buy_in: number;
          is_host?: boolean;
          joined_at?: string;
          name: string;
          room_id: string;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by_device_id?: string | null;
          final_amount?: number | null;
          id?: string;
          initial_buy_in?: number;
          is_host?: boolean;
          joined_at?: string;
          name?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'players_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          }
        ];
      };
      rebuy_events: {
        Row: {
          amount: number;
          created_at: string;
          created_by_player_id: string;
          deleted_at: string | null;
          id: string;
          player_id: string;
          room_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by_player_id: string;
          deleted_at?: string | null;
          id?: string;
          player_id: string;
          room_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by_player_id?: string;
          deleted_at?: string | null;
          id?: string;
          player_id?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rebuy_events_created_by_player_id_fkey';
            columns: ['created_by_player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rebuy_events_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rebuy_events_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          }
        ];
      };
      rooms: {
        Row: {
          closed_at: string | null;
          code: string;
          created_at: string;
          currency: string;
          default_buy_in: number;
          host_player_id: string;
          id: string;
          name: string;
          status: Database['public']['Enums']['room_status'];
        };
        Insert: {
          closed_at?: string | null;
          code: string;
          created_at?: string;
          currency?: string;
          default_buy_in: number;
          host_player_id: string;
          id?: string;
          name: string;
          status?: Database['public']['Enums']['room_status'];
        };
        Update: {
          closed_at?: string | null;
          code?: string;
          created_at?: string;
          currency?: string;
          default_buy_in?: number;
          host_player_id?: string;
          id?: string;
          name?: string;
          status?: Database['public']['Enums']['room_status'];
        };
        Relationships: [];
      };
      settlements: {
        Row: {
          amount: number;
          created_at: string;
          from_player_id: string;
          id: string;
          room_id: string;
          to_player_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          from_player_id: string;
          id?: string;
          room_id: string;
          to_player_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          from_player_id?: string;
          id?: string;
          room_id?: string;
          to_player_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'settlements_from_player_id_fkey';
            columns: ['from_player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_to_player_id_fkey';
            columns: ['to_player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      room_status: 'active' | 'closed' | 'lobby';
    };
    CompositeTypes: Record<string, never>;
  };
}

export type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type Inserts<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type Updates<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
