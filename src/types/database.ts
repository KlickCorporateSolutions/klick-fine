/**
 * Tipos da base de dados Supabase.
 *
 * Este ficheiro é gerado automaticamente após aplicar o schema:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * Por agora é um placeholder. Será substituído quando aplicarmos o schema.
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
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
