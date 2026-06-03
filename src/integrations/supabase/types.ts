export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string;
          created_at: string;
          description: string | null;
          household_id: string;
          id: string;
          item_id: string | null;
          list_id: string | null;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          description?: string | null;
          household_id: string;
          id?: string;
          item_id?: string | null;
          list_id?: string | null;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          description?: string | null;
          household_id?: string;
          id?: string;
          item_id?: string | null;
          list_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_log_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "shopping_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_log_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "shopping_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: {
          created_at: string;
          created_by: string | null;
          household_id: string;
          id: string;
          label: string | null;
          role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["member_status"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          household_id: string;
          id?: string;
          label?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["member_status"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          household_id?: string;
          id?: string;
          label?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["member_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_photos: {
        Row: {
          created_at: string;
          created_by: string;
          height: number | null;
          household_id: string;
          id: string;
          item_id: string;
          mime_type: string | null;
          preview_url: string | null;
          storage_path: string;
          thumbnail_url: string | null;
          width: number | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          height?: number | null;
          household_id: string;
          id?: string;
          item_id: string;
          mime_type?: string | null;
          preview_url?: string | null;
          storage_path: string;
          thumbnail_url?: string | null;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          height?: number | null;
          household_id?: string;
          id?: string;
          item_id?: string;
          mime_type?: string | null;
          preview_url?: string | null;
          storage_path?: string;
          thumbnail_url?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "item_photos_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_photos_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "shopping_items";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          first_name: string | null;
          id: string;
          last_name: string | null;
          must_change_password: boolean;
          must_complete_profile: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          must_change_password?: boolean;
          must_complete_profile?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          must_change_password?: boolean;
          must_complete_profile?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      pending_registrations: {
        Row: {
          code_id: string | null;
          consumed_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          first_name: string | null;
          household_created_at: string | null;
          id: string;
          pending_household_name: string | null;
          registration_source: string;
          token_hash: string;
        };
        Insert: {
          code_id?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          first_name?: string | null;
          household_created_at?: string | null;
          id?: string;
          pending_household_name?: string | null;
          registration_source: string;
          token_hash: string;
        };
        Update: {
          code_id?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          first_name?: string | null;
          household_created_at?: string | null;
          id?: string;
          pending_household_name?: string | null;
          registration_source?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pending_registrations_code_id_fkey";
            columns: ["code_id"];
            isOneToOne: false;
            referencedRelation: "registration_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      registration_codes: {
        Row: {
          active: boolean;
          code_hash: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          label: string | null;
          max_uses: number | null;
          used_count: number;
        };
        Insert: {
          active?: boolean;
          code_hash: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          max_uses?: number | null;
          used_count?: number;
        };
        Update: {
          active?: boolean;
          code_hash?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          max_uses?: number | null;
          used_count?: number;
        };
        Relationships: [];
      };
      stores: {
        Row: {
          created_at: string;
          created_by: string;
          household_id: string;
          id: string;
          name: string;
          normalized_name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          household_id: string;
          id?: string;
          name: string;
          normalized_name?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          household_id?: string;
          id?: string;
          name?: string;
          normalized_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stores_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      product_price_history: {
        Row: {
          category: string | null;
          created_at: string;
          created_by: string;
          household_id: string;
          id: string;
          normalized_product_name: string;
          observed_at: string;
          price: number;
          product_name: string;
          source_receipt_item_id: string | null;
          store_id: string;
          unit: string | null;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          created_by: string;
          household_id: string;
          id?: string;
          normalized_product_name?: string;
          observed_at?: string;
          price: number;
          product_name: string;
          source_receipt_item_id?: string | null;
          store_id: string;
          unit?: string | null;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          created_by?: string;
          household_id?: string;
          id?: string;
          normalized_product_name?: string;
          observed_at?: string;
          price?: number;
          product_name?: string;
          source_receipt_item_id?: string | null;
          store_id?: string;
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_price_history_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_price_history_source_receipt_item_id_fkey";
            columns: ["source_receipt_item_id"];
            isOneToOne: false;
            referencedRelation: "receipt_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_price_history_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      receipts: {
        Row: {
          created_at: string;
          created_by: string;
          household_id: string;
          id: string;
          image_url: string | null;
          ocr_error: string | null;
          ocr_status: string;
          receipt_date: string | null;
          store_id: string | null;
          total_amount: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          household_id: string;
          id?: string;
          image_url?: string | null;
          ocr_error?: string | null;
          ocr_status?: string;
          receipt_date?: string | null;
          store_id?: string | null;
          total_amount?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          household_id?: string;
          id?: string;
          image_url?: string | null;
          ocr_error?: string | null;
          ocr_status?: string;
          receipt_date?: string | null;
          store_id?: string | null;
          total_amount?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      receipt_items: {
        Row: {
          category: string | null;
          confidence: number | null;
          confirmed_by_user: boolean;
          created_at: string;
          household_id: string;
          id: string;
          matched_product_name: string | null;
          normalized_name: string | null;
          quantity: number | null;
          raw_name: string;
          receipt_id: string;
          store_id: string | null;
          total_price: number | null;
          unit: string | null;
          unit_price: number | null;
        };
        Insert: {
          category?: string | null;
          confidence?: number | null;
          confirmed_by_user?: boolean;
          created_at?: string;
          household_id: string;
          id?: string;
          matched_product_name?: string | null;
          normalized_name?: string | null;
          quantity?: number | null;
          raw_name: string;
          receipt_id: string;
          store_id?: string | null;
          total_price?: number | null;
          unit?: string | null;
          unit_price?: number | null;
        };
        Update: {
          category?: string | null;
          confidence?: number | null;
          confirmed_by_user?: boolean;
          created_at?: string;
          household_id?: string;
          id?: string;
          matched_product_name?: string | null;
          normalized_name?: string | null;
          quantity?: number | null;
          raw_name?: string;
          receipt_id?: string;
          store_id?: string | null;
          total_price?: number | null;
          unit?: string | null;
          unit_price?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "receipt_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_items_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_items_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_items: {
        Row: {
          added_by: string;
          category: string | null;
          checked_at: string | null;
          checked_by: string | null;
          created_at: string;
          estimated_unit_price: number | null;
          exact_match_required: boolean;
          household_id: string;
          id: string;
          list_id: string;
          name: string;
          note: string | null;
          price_observed_at: string | null;
          quantity: number | null;
          status: Database["public"]["Enums"]["item_status"];
          store_id: string | null;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          added_by: string;
          category?: string | null;
          checked_at?: string | null;
          checked_by?: string | null;
          created_at?: string;
          estimated_unit_price?: number | null;
          exact_match_required?: boolean;
          household_id: string;
          id?: string;
          list_id: string;
          name: string;
          note?: string | null;
          price_observed_at?: string | null;
          quantity?: number | null;
          status?: Database["public"]["Enums"]["item_status"];
          store_id?: string | null;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          added_by?: string;
          category?: string | null;
          checked_at?: string | null;
          checked_by?: string | null;
          created_at?: string;
          estimated_unit_price?: number | null;
          exact_match_required?: boolean;
          household_id?: string;
          id?: string;
          list_id?: string;
          name?: string;
          note?: string | null;
          price_observed_at?: string | null;
          quantity?: number | null;
          status?: Database["public"]["Enums"]["item_status"];
          store_id?: string | null;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "shopping_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_items_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      household_product_dictionary: {
        Row: {
          barcode: string | null;
          category: string | null;
          created_at: string;
          created_by: string;
          default_store_id: string | null;
          default_unit: string | null;
          household_id: string;
          id: string;
          normalized_phrase: string;
          phrase: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          barcode?: string | null;
          category?: string | null;
          created_at?: string;
          created_by: string;
          default_store_id?: string | null;
          default_unit?: string | null;
          household_id: string;
          id?: string;
          normalized_phrase?: string;
          phrase: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          barcode?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string;
          default_store_id?: string | null;
          default_unit?: string | null;
          household_id?: string;
          id?: string;
          normalized_phrase?: string;
          phrase?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "household_product_dictionary_default_store_id_fkey";
            columns: ["default_store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_product_dictionary_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          enabled: boolean;
          preferences: Record<string, boolean>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          enabled?: boolean;
          preferences?: Record<string, boolean>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          enabled?: boolean;
          preferences?: Record<string, boolean>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      push_notification_log: {
        Row: {
          id: string;
          household_id: string;
          user_id: string | null;
          notification_type: string;
          title: string;
          body: string;
          payload: Record<string, unknown>;
          status: string;
          error: string | null;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id?: string | null;
          notification_type: string;
          title: string;
          body: string;
          payload?: Record<string, unknown>;
          status?: string;
          error?: string | null;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string | null;
          notification_type?: string;
          title?: string;
          body?: string;
          payload?: Record<string, unknown>;
          status?: string;
          error?: string | null;
          created_at?: string;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "push_notification_log_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_lists: {
        Row: {
          actual_total: number | null;
          budget_amount: number | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          default_store_id: string | null;
          estimated_total: number | null;
          household_id: string;
          id: string;
          name: string;
          status: Database["public"]["Enums"]["list_status"];
          updated_at: string;
        };
        Insert: {
          actual_total?: number | null;
          budget_amount?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          default_store_id?: string | null;
          estimated_total?: number | null;
          household_id: string;
          id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["list_status"];
          updated_at?: string;
        };
        Update: {
          actual_total?: number | null;
          budget_amount?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          default_store_id?: string | null;
          estimated_total?: number | null;
          household_id?: string;
          id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["list_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_lists_default_store_id_fkey";
            columns: ["default_store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_lists_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_household_admin: {
        Args: { _household_id: string; _user_id: string };
        Returns: boolean;
      };
      can_add_household_items: {
        Args: { _household_id: string; _user_id: string };
        Returns: boolean;
      };
      finalize_self_registration: {
        Args: { _token_hash: string; _user_id: string };
        Returns: {
          household_id: string;
          household_name: string;
        }[];
      };
      is_household_member: {
        Args: { _household_id: string; _user_id: string };
        Returns: boolean;
      };
      is_email_confirmed: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      user_household_ids: { Args: { _user_id: string }; Returns: string[] };
    };
    Enums: {
      app_role: "owner" | "admin" | "member" | "viewer";
      item_status: "active" | "bought" | "unavailable" | "deleted";
      list_status: "active" | "shopping" | "done" | "partially_done" | "archived";
      member_status: "active" | "invited" | "removed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "member", "viewer"],
      item_status: ["active", "bought", "unavailable", "deleted"],
      list_status: ["active", "shopping", "done", "partially_done", "archived"],
      member_status: ["active", "invited", "removed"],
    },
  },
} as const;
