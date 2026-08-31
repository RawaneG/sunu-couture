// Client Supabase centralisé — unique point de création dans le front.
//
// Variables autorisées ICI, et uniquement ici : VITE_SUPABASE_URL et
// VITE_SUPABASE_PUBLISHABLE_KEY (clé publique, remplace l'ancienne anon key).
// Aucune clé secrète / service_role ne doit jamais apparaître dans une
// variable VITE_* : Vite les inline en clair dans le bundle livré au
// navigateur. La clé secrète (sb_secret_…) vit uniquement côté Edge Function
// (supabase/functions/), jamais ici.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Configuration Supabase manquante : VITE_SUPABASE_URL et " +
      "VITE_SUPABASE_PUBLISHABLE_KEY doivent être définies dans .env.local " +
      "(voir .env.example).",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey);
