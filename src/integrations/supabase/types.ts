export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_credentials: {
        Row: {
          api_key: string
          api_secret: string
          testnet: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          api_secret: string
          testnet?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          api_secret?: string
          testnet?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          ema_fast: number
          ema_slow: number
          enabled: boolean
          interval: string
          max_daily_loss_usdt: number
          max_trades_per_day: number
          mode: string
          paper_btc: number
          paper_usdt: number
          position_usdt: number
          rsi_overbought: number
          rsi_oversold: number
          rsi_period: number
          stop_loss_pct: number
          symbol: string
          take_profit_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ema_fast?: number
          ema_slow?: number
          enabled?: boolean
          interval?: string
          max_daily_loss_usdt?: number
          max_trades_per_day?: number
          mode?: string
          paper_btc?: number
          paper_usdt?: number
          position_usdt?: number
          rsi_overbought?: number
          rsi_oversold?: number
          rsi_period?: number
          stop_loss_pct?: number
          symbol?: string
          take_profit_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ema_fast?: number
          ema_slow?: number
          enabled?: boolean
          interval?: string
          max_daily_loss_usdt?: number
          max_trades_per_day?: number
          mode?: string
          paper_btc?: number
          paper_usdt?: number
          position_usdt?: number
          rsi_overbought?: number
          rsi_oversold?: number
          rsi_period?: number
          stop_loss_pct?: number
          symbol?: string
          take_profit_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          closed_at: string | null
          entry_price: number
          entry_reason: string | null
          exit_price: number | null
          exit_reason: string | null
          id: string
          mode: string
          opened_at: string
          pnl: number | null
          qty: number
          status: string
          stop_price: number
          symbol: string
          target_price: number
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          entry_price: number
          entry_reason?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          mode?: string
          opened_at?: string
          pnl?: number | null
          qty: number
          status?: string
          stop_price: number
          symbol: string
          target_price: number
          user_id: string
        }
        Update: {
          closed_at?: string | null
          entry_price?: number
          entry_reason?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          mode?: string
          opened_at?: string
          pnl?: number | null
          qty?: number
          status?: string
          stop_price?: number
          symbol?: string
          target_price?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
