// Mémoire locale du DERNIER numéro utilisé sur CET appareil (corr. Gate Auth
// §6/§47) — permet à un utilisateur déjà inscrit de sauter directement à
// l'écran PIN ("Bon retour") sans retaper son numéro. Stocke UNIQUEMENT le
// numéro normalisé (E.164) — jamais le PIN, jamais un jeton, jamais un mot de
// passe technique (ces valeurs restent entièrement gérées par Supabase Auth /
// l'Edge Function). `localStorage` est un confort par appareil, jamais une
// source de vérité : son absence (navigation privée, appareil partagé,
// stockage vidé) doit toujours retomber proprement sur l'écran numéro.
const STORAGE_KEY = "tayoo:last-phone";

export function getRememberedPhone(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setRememberedPhone(normalizedPhone: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizedPhone);
  } catch {
    // stockage indisponible (navigation privée stricte, quota) — dégrade
    // silencieusement vers "toujours redemander le numéro", jamais une erreur
    // visible pour une simple commodité.
  }
}

export function clearRememberedPhone(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem
  }
}
