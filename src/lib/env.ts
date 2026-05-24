function requiredEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `Missing required env var: ${key}. Copia .env.example para .env.local e preenche os valores.`
    );
  }
  return value as string;
}

export const env = {
  SUPABASE_URL: requiredEnv("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: requiredEnv("VITE_SUPABASE_ANON_KEY"),
} as const;
