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
      mt5_commands: {
        Row: {
          action: string
          comment: string | null
          created_at: string
          expires_at: string
          id: string
          lease_until: string | null
          lot: number | null
          reported_at: string | null
          result: Json | null
          sl: number | null
          status: string
          symbol: string
          ticket: number | null
          tp: number | null
          updated_at: string
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          lease_until?: string | null
          lot?: number | null
          reported_at?: string | null
          result?: Json | null
          sl?: number | null
          status?: string
          symbol?: string
          ticket?: number | null
          tp?: number | null
          updated_at?: string
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          lease_until?: string | null
          lot?: number | null
          reported_at?: string | null
          result?: Json | null
          sl?: number | null
          status?: string
          symbol?: string
          ticket?: number | null
          tp?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      mt5_control: {
        Row: {
          allowed_symbols: string[]
          emergency_stop: boolean
          id: number
          max_lot: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_symbols?: string[]
          emergency_stop?: boolean
          id?: number
          max_lot?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_symbols?: string[]
          emergency_stop?: boolean
          id?: number
          max_lot?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mt5_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      mt5_status: {
        Row: {
          id: number
          payload: Json
          updated_at: string
        }
        Insert: {
          id?: number
          payload?: Json
          updated_at?: string
        }
        Update: {
          id?: number
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      paper_services: {
        Row: {
          enabled: boolean
          last_message: string
          last_tick_at: string | null
          lease_token: string | null
          lease_until: string | null
          state: Json
          user_id: string
        }
        Insert: {
          enabled?: boolean
          last_message?: string
          last_tick_at?: string | null
          lease_token?: string | null
          lease_until?: string | null
          state?: Json
          user_id: string
        }
        Update: {
          enabled?: boolean
          last_message?: string
          last_tick_at?: string | null
          lease_token?: string | null
          lease_until?: string | null
          state?: Json
          user_id?: string
        }
        Relationships: []
      }
      telegram_admins: {
        Row: {
          chat_id: number
          created_at: string
          panel_message_id: number | null
          user_id: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          panel_message_id?: number | null
          user_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          panel_message_id?: number | null
          user_id?: string
        }
        Relationships: []
      }
      tg_license_keys: {
        Row: {
          code: string
          created_at: string
          days: number
          used_at: string | null
          used_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          days: number
          used_at?: string | null
          used_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          days?: number
          used_at?: string | null
          used_by?: number | null
        }
        Relationships: []
      }
      tg_subscribers: {
        Row: {
          chat_id: number
          created_at: string
          expires_at: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          expires_at: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          expires_at?: string
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
          side: string
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
          side?: string
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
          side?: string
          status?: string
          stop_price?: number
          symbol?: string
          target_price?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_paper_service: {
        Args: { p_token: string; p_user: string }
        Returns: boolean
      }
      commit_paper_service: {
        Args: {
          p_message: string
          p_state: Json
          p_tick: boolean
          p_token: string
          p_user: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mt5_expire_commands: { Args: never; Returns: undefined }
      mt5_lease_commands: {
        Args: { p_lease_sec?: number; p_limit?: number }
        Returns: {
          action: string
          comment: string
          id: string
          lot: number
          sl: number
          symbol: string
          ticket: number
          tp: number
          ttl: number
        }[]
      }
      mt5_rate_hit: {
        Args: { p_bucket: string; p_max: number; p_window_sec: number }
        Returns: boolean
      }
      mt5_report_command: {
        Args: { p_id: string; p_result: Json; p_success: boolean }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
