/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** "local" (défaut si absent) | "supabase" (reconnu, pas encore implémenté — Phase 7+). */
  readonly VITE_BACKEND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
