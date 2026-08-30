export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      carnets: {
        Row: {
          archived_at: string | null
          created_at: string
          fiches_par_carnet: number
          id: string
          next_number: number
          number: number
          status: Database["public"]["Enums"]["carnet_status"]
          updated_at: string
          workshop_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          fiches_par_carnet?: number
          id?: string
          next_number?: number
          number: number
          status?: Database["public"]["Enums"]["carnet_status"]
          updated_at?: string
          workshop_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          fiches_par_carnet?: number
          id?: string
          next_number?: number
          number?: number
          status?: Database["public"]["Enums"]["carnet_status"]
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carnets_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          created_at: string
          fiche_id: string
          id: string
          metadata: Json
          method: Database["public"]["Enums"]["payment_method"] | null
          note: string | null
          paid_at: string | null
          recorded_at: string
          workshop_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fiche_id: string
          id?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string | null
          paid_at?: string | null
          recorded_at?: string
          workshop_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fiche_id?: string
          id?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string | null
          paid_at?: string | null
          recorded_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiche_balances"
            referencedColumns: ["workshop_id", "fiche_id"]
          },
          {
            foreignKeyName: "client_payments_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "client_payments_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches_view"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "client_payments_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string
          first_name: string | null
          id: string
          last_name: string | null
          metadata: Json
          nickname: string | null
          phone_display: string | null
          phone_e164: string | null
          updated_at: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          nickname?: string | null
          phone_display?: string | null
          phone_e164?: string | null
          updated_at?: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          nickname?: string | null
          phone_display?: string | null
          phone_e164?: string | null
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      fiches: {
        Row: {
          carnet_id: string
          client_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          fabric_notes: string | null
          garment: string
          id: string
          measurements: Json
          metadata: Json
          number: number
          page_number: number
          quantity: number
          settled_at: string | null
          slot_number: number
          state: Database["public"]["Enums"]["fiche_state"]
          status: Database["public"]["Enums"]["fiche_status"]
          total_price: number
          updated_at: string
          version: number
          workshop_id: string
        }
        Insert: {
          carnet_id: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          fabric_notes?: string | null
          garment?: string
          id?: string
          measurements?: Json
          metadata?: Json
          number: number
          page_number: number
          quantity?: number
          settled_at?: string | null
          slot_number: number
          state?: Database["public"]["Enums"]["fiche_state"]
          status?: Database["public"]["Enums"]["fiche_status"]
          total_price?: number
          updated_at?: string
          version?: number
          workshop_id: string
        }
        Update: {
          carnet_id?: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          fabric_notes?: string | null
          garment?: string
          id?: string
          measurements?: Json
          metadata?: Json
          number?: number
          page_number?: number
          quantity?: number
          settled_at?: string | null
          slot_number?: number
          state?: Database["public"]["Enums"]["fiche_state"]
          status?: Database["public"]["Enums"]["fiche_status"]
          total_price?: number
          updated_at?: string
          version?: number
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiches_carnet_same_workshop_fk"
            columns: ["workshop_id", "carnet_id"]
            isOneToOne: false
            referencedRelation: "carnets"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "fiches_client_same_workshop_fk"
            columns: ["workshop_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "fiches_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          created_at: string
          deleted_at: string | null
          fiche_id: string
          id: string
          metadata: Json
          mime_type: string
          size_bytes: number
          storage_path: string
          type: Database["public"]["Enums"]["media_type"]
          workshop_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          fiche_id: string
          id?: string
          metadata?: Json
          mime_type: string
          size_bytes: number
          storage_path: string
          type: Database["public"]["Enums"]["media_type"]
          workshop_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          fiche_id?: string
          id?: string
          metadata?: Json
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          type?: Database["public"]["Enums"]["media_type"]
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiche_balances"
            referencedColumns: ["workshop_id", "fiche_id"]
          },
          {
            foreignKeyName: "media_assets_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "media_assets_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches_view"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "media_assets_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      modele_medias: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          kind: string
          metadata: Json
          mime_type: string
          modele_id: string
          position: number
          size_bytes: number
          storage_path: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: string
          metadata?: Json
          mime_type: string
          modele_id: string
          position?: number
          size_bytes: number
          storage_path: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string
          modele_id?: string
          position?: number
          size_bytes?: number
          storage_path?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modele_medias_modele_same_workshop_fk"
            columns: ["workshop_id", "modele_id"]
            isOneToOne: false
            referencedRelation: "modeles"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "modele_medias_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      modeles: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nom: string
          updated_at: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nom: string
          updated_at?: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nom?: string
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modeles_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          max_redemptions: number | null
          plan_code: string
          redeemed_count: number
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          max_redemptions?: number | null
          plan_code: string
          redeemed_count?: number
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          max_redemptions?: number | null
          plan_code?: string
          redeemed_count?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      reminders: {
        Row: {
          at_time: string
          created_at: string
          enabled: boolean
          id: string
          sound: boolean
          type: string
          updated_at: string
          workshop_id: string
        }
        Insert: {
          at_time?: string
          created_at?: string
          enabled?: boolean
          id?: string
          sound?: boolean
          type: string
          updated_at?: string
          workshop_id: string
        }
        Update: {
          at_time?: string
          created_at?: string
          enabled?: boolean
          id?: string
          sound?: boolean
          type?: string
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          label: string
          period: Database["public"]["Enums"]["subscription_plan_period"]
          price_fcfa: number
          sort_order: number
          trial_fiche_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          label: string
          period: Database["public"]["Enums"]["subscription_plan_period"]
          price_fcfa: number
          sort_order?: number
          trial_fiche_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          label?: string
          period?: Database["public"]["Enums"]["subscription_plan_period"]
          price_fcfa?: number
          sort_order?: number
          trial_fiche_limit?: number | null
        }
        Relationships: []
      }
      subscription_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          paid_at: string | null
          provider: string
          provider_reference: string | null
          raw_metadata: Json
          status: Database["public"]["Enums"]["subscription_txn_status"]
          validated_by: string | null
          workshop_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key: string
          paid_at?: string | null
          provider: string
          provider_reference?: string | null
          raw_metadata?: Json
          status?: Database["public"]["Enums"]["subscription_txn_status"]
          validated_by?: string | null
          workshop_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          paid_at?: string | null
          provider?: string
          provider_reference?: string | null
          raw_metadata?: Json
          status?: Database["public"]["Enums"]["subscription_txn_status"]
          validated_by?: string | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_transactions_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          grace_period_end: string | null
          id: string
          plan_code: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_fiche_limit: number | null
          updated_at: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_end?: string | null
          id?: string
          plan_code: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_fiche_limit?: number | null
          updated_at?: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_end?: string | null
          id?: string
          plan_code?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_fiche_limit?: number | null
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscriptions_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: true
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          conflicting_fields: Json
          detected_at: string
          fiche_id: string
          id: string
          local_payload: Json
          local_version: number
          remote_payload: Json
          remote_version: number
          resolution_state: Database["public"]["Enums"]["sync_conflict_state"]
          resolved_at: string | null
          resolved_by: string | null
          workshop_id: string
        }
        Insert: {
          conflicting_fields?: Json
          detected_at?: string
          fiche_id: string
          id?: string
          local_payload?: Json
          local_version: number
          remote_payload?: Json
          remote_version: number
          resolution_state?: Database["public"]["Enums"]["sync_conflict_state"]
          resolved_at?: string | null
          resolved_by?: string | null
          workshop_id: string
        }
        Update: {
          conflicting_fields?: Json
          detected_at?: string
          fiche_id?: string
          id?: string
          local_payload?: Json
          local_version?: number
          remote_payload?: Json
          remote_version?: number
          resolution_state?: Database["public"]["Enums"]["sync_conflict_state"]
          resolved_at?: string | null
          resolved_by?: string | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiche_balances"
            referencedColumns: ["workshop_id", "fiche_id"]
          },
          {
            foreignKeyName: "sync_conflicts_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "sync_conflicts_fiche_same_workshop_fk"
            columns: ["workshop_id", "fiche_id"]
            isOneToOne: false
            referencedRelation: "fiches_view"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "sync_conflicts_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workshop_role"]
          user_id: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["workshop_role"]
          user_id: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workshop_role"]
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_members_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      fiche_balances: {
        Row: {
          fiche_id: string | null
          is_settled: boolean | null
          reste: number | null
          total_paid: number | null
          total_price: number | null
          workshop_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiches_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      fiches_view: {
        Row: {
          carnet_id: string | null
          client_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          fabric_notes: string | null
          garment: string | null
          id: string | null
          is_late: boolean | null
          measurements: Json | null
          metadata: Json | null
          number: number | null
          page_number: number | null
          quantity: number | null
          settled_at: string | null
          slot_number: number | null
          state: Database["public"]["Enums"]["fiche_state"] | null
          status: Database["public"]["Enums"]["fiche_status"] | null
          total_price: number | null
          updated_at: string | null
          version: number | null
          workshop_id: string | null
        }
        Insert: {
          carnet_id?: string | null
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          fabric_notes?: string | null
          garment?: string | null
          id?: string | null
          is_late?: never
          measurements?: Json | null
          metadata?: Json | null
          number?: number | null
          page_number?: number | null
          quantity?: number | null
          settled_at?: string | null
          slot_number?: number | null
          state?: Database["public"]["Enums"]["fiche_state"] | null
          status?: Database["public"]["Enums"]["fiche_status"] | null
          total_price?: number | null
          updated_at?: string | null
          version?: number | null
          workshop_id?: string | null
        }
        Update: {
          carnet_id?: string | null
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          fabric_notes?: string | null
          garment?: string | null
          id?: string | null
          is_late?: never
          measurements?: Json | null
          metadata?: Json | null
          number?: number | null
          page_number?: number | null
          quantity?: number | null
          settled_at?: string | null
          slot_number?: number | null
          state?: Database["public"]["Enums"]["fiche_state"] | null
          status?: Database["public"]["Enums"]["fiche_status"] | null
          total_price?: number | null
          updated_at?: string | null
          version?: number | null
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiches_carnet_same_workshop_fk"
            columns: ["workshop_id", "carnet_id"]
            isOneToOne: false
            referencedRelation: "carnets"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "fiches_client_same_workshop_fk"
            columns: ["workshop_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workshop_id", "id"]
          },
          {
            foreignKeyName: "fiches_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      provision_workshop_api: {
        Args: { p_name: string; p_owner: string }
        Returns: {
          created_at: string
          id: string
          is_demo: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workshops"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      carnet_status: "active" | "full" | "archived"
      fiche_state: "active" | "cancelled" | "archived"
      fiche_status: "received" | "sewing" | "ready" | "delivered"
      media_type: "fabric_photo" | "model_photo" | "voice_note" | "signature"
      payment_method:
        | "cash"
        | "wave"
        | "orange_money"
        | "free_money"
        | "bank"
        | "other"
      subscription_plan_period: "trial" | "monthly" | "quarterly" | "yearly"
      subscription_status:
        | "trialing"
        | "active"
        | "grace"
        | "expired"
        | "cancelled"
      subscription_txn_status: "pending" | "validated" | "rejected" | "refunded"
      sync_conflict_state: "open" | "resolved" | "discarded"
      workshop_role: "owner" | "assistant"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      carnet_status: ["active", "full", "archived"],
      fiche_state: ["active", "cancelled", "archived"],
      fiche_status: ["received", "sewing", "ready", "delivered"],
      media_type: ["fabric_photo", "model_photo", "voice_note", "signature"],
      payment_method: [
        "cash",
        "wave",
        "orange_money",
        "free_money",
        "bank",
        "other",
      ],
      subscription_plan_period: ["trial", "monthly", "quarterly", "yearly"],
      subscription_status: [
        "trialing",
        "active",
        "grace",
        "expired",
        "cancelled",
      ],
      subscription_txn_status: ["pending", "validated", "rejected", "refunded"],
      sync_conflict_state: ["open", "resolved", "discarded"],
      workshop_role: ["owner", "assistant"],
    },
  },
} as const
