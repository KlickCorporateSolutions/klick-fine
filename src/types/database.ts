/**
 * Tipos da base de dados Supabase (Klick FINE).
 *
 * Manualmente sincronizado com supabase/migrations/0001_initial_schema.sql.
 * Para regenerar a partir da BD aplicada:
 *   npx supabase gen types typescript --project-id nsnqctnmnogykjhagxgv > src/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          bdp_registry_number: string | null;
          branding_logo_url: string | null;
          branding_primary_color: string;
          branding_secondary_color: string;
          branding_app_name: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          bdp_registry_number?: string | null;
          branding_logo_url?: string | null;
          branding_primary_color?: string;
          branding_secondary_color?: string;
          branding_app_name?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          bdp_registry_number?: string | null;
          branding_logo_url?: string | null;
          branding_primary_color?: string;
          branding_secondary_color?: string;
          branding_app_name?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          invited_by: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          invited_by?: string | null;
          joined_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          invited_by?: string | null;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      super_admins: {
        Row: {
          user_id: string;
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          user_id: string;
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: {
          user_id?: string;
          granted_at?: string;
          granted_by?: string | null;
        };
        Relationships: [];
      };
      credit_clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          nif: string | null;
          email: string | null;
          phone: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          nif?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          nif?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_clients_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      processes: {
        Row: {
          id: string;
          organization_id: string;
          credit_client_id: string;
          reference: string | null;
          finalidade: string | null;
          montante_pretendido: number | null;
          status: Database["public"]["Enums"]["process_status"];
          closed_with_bank: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          credit_client_id: string;
          reference?: string | null;
          finalidade?: string | null;
          montante_pretendido?: number | null;
          status?: Database["public"]["Enums"]["process_status"];
          closed_with_bank?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          credit_client_id?: string;
          reference?: string | null;
          finalidade?: string | null;
          montante_pretendido?: number | null;
          status?: Database["public"]["Enums"]["process_status"];
          closed_with_bank?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          id: string;
          process_id: string;
          pdf_filename: string;
          pdf_storage_path: string | null;
          banco: string | null;
          extraction_mode: "text" | "vision" | "vision_thinking" | null;
          extracted_data: Json;
          extraction_warnings: string[];
          manual_overrides: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          process_id: string;
          pdf_filename: string;
          pdf_storage_path?: string | null;
          banco?: string | null;
          extraction_mode?: "text" | "vision" | "vision_thinking" | null;
          extracted_data: Json;
          extraction_warnings?: string[];
          manual_overrides?: Json;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          process_id?: string;
          pdf_filename?: string;
          pdf_storage_path?: string | null;
          banco?: string | null;
          extraction_mode?: "text" | "vision" | "vision_thinking" | null;
          extracted_data?: Json;
          extraction_warnings?: string[];
          manual_overrides?: Json;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          organization_id: string | null;
          user_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      support_access_log: {
        Row: {
          id: string;
          super_admin_id: string;
          organization_id: string;
          reason: string | null;
          accessed_at: string;
        };
        Insert: {
          id?: string;
          super_admin_id: string;
          organization_id: string;
          reason?: string | null;
          accessed_at?: string;
        };
        Update: {
          id?: string;
          super_admin_id?: string;
          organization_id?: string;
          reason?: string | null;
          accessed_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { org_id: string };
        Returns: boolean;
      };
      is_org_owner: {
        Args: { org_id: string };
        Returns: boolean;
      };
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      org_role: "owner" | "member";
      process_status: "active" | "won" | "lost" | "archived";
    };
    CompositeTypes: Record<string, never>;
  };
};

// ---------- Helpers de tipo ----------

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
