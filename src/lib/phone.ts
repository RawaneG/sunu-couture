// Normalisation téléphone → E.164, ciblée Sénégal (+221) pour le pilote (D5).
// Même convention que `clients.phone_e164` côté base (décision D3).

const SENEGAL_PREFIX = "+221";
/** Un numéro mobile sénégalais local fait 9 chiffres (ex. 77 000 00 01). */
const LOCAL_DIGITS_LENGTH = 9;

/**
 * Normalise une saisie utilisateur en E.164 sénégalais (+221XXXXXXXXX).
 * Accepte : "77 000 00 01", "0770000001", "221770000001", "+221 77 000 00 01".
 * Renvoie `null` si la saisie ne peut pas être normalisée avec confiance.
 */
export function normalizePhoneSenegal(input: string): string | null {
  const digitsOnly = input.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;

  let local = digitsOnly;
  if (local.startsWith("221")) {
    local = local.slice(3);
  } else if (local.startsWith("0")) {
    local = local.slice(1);
  }

  if (local.length !== LOCAL_DIGITS_LENGTH || !/^\d+$/.test(local)) {
    return null;
  }

  return `${SENEGAL_PREFIX}${local}`;
}

/** Formatage lisible pour affichage (jamais stocké tel quel) : +221 77 000 00 01 */
export function formatPhoneSenegalDisplay(e164: string): string {
  const local = e164.startsWith(SENEGAL_PREFIX) ? e164.slice(SENEGAL_PREFIX.length) : e164;
  const groups = local.match(/.{1,2}/g) ?? [local];
  return `${SENEGAL_PREFIX} ${groups.join(" ")}`;
}
