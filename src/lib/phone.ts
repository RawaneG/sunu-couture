// Normalisation téléphone → E.164, ciblée Sénégal (+221) pour le pilote (D5).
// Même convention que `clients.phone_e164` côté base (décision D3).

const SENEGAL_PREFIX = "+221";
/** Un numéro mobile sénégalais local fait 9 chiffres (ex. 77 000 00 01). */
const LOCAL_DIGITS_LENGTH = 9;
/** Regroupement canonique d'affichage — "XX XXX XX XX" (2-3-2-2), utilisé
 * PARTOUT dans l'app (saisie réactive et affichage), jamais un autre
 * découpage : cohérence interne avant tout (corr. Jakob's Law §50). */
const GROUP_SIZES = [2, 3, 2, 2] as const;

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

/** Ne garde que les chiffres locaux (0 à 9), en retirant un éventuel préfixe
 * pays/trunk (+221/221/0) — même logique que `normalizePhoneSenegal`, mais
 * tolérante à une saisie PARTIELLE (en cours de frappe) plutôt que de
 * rejeter tout ce qui n'est pas exactement 9 chiffres. */
function localDigitsFrom(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("221")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, LOCAL_DIGITS_LENGTH);
}

function groupDigits(digits: string): string[] {
  const groups: string[] = [];
  let i = 0;
  for (const size of GROUP_SIZES) {
    if (i >= digits.length) break;
    groups.push(digits.slice(i, i + size));
    i += size;
  }
  return groups;
}

/**
 * Formatage réactif "XX XXX XX XX" (2-3-2-2, corr. Jakob's Law) — UNIQUE
 * fonction utilisée à la fois :
 *   - pour la saisie en direct (reformatte à chaque frappe, y compris une
 *     saisie encore incomplète, ex. "77 123" pendant que le tailleur tape) ;
 *   - pour l'affichage d'un numéro déjà enregistré, quel que soit son format
 *     brut d'origine (ancien regroupement, avec/sans préfixe, etc.).
 * Ne valide RIEN (jamais de `null`) — un texte vide ou incomplet donne
 * simplement un résultat partiel ou vide, jamais une erreur.
 */
export function formatSenegalLocalNumber(raw: string): string {
  return groupDigits(localDigitsFrom(raw)).join(" ");
}

/** Formatage lisible pour affichage (jamais stocké tel quel) : +221 77 123 45 67 */
export function formatPhoneSenegalDisplay(e164: string): string {
  const local = e164.startsWith(SENEGAL_PREFIX) ? e164.slice(SENEGAL_PREFIX.length) : e164;
  return `${SENEGAL_PREFIX} ${formatSenegalLocalNumber(local)}`;
}

/** Affichage PARTIELLEMENT masqué — écran "Bon retour" (corr. Gate Auth §46) :
 * seuls le premier et le dernier groupe restent visibles, ex.
 * +221 77 ••• •• 67. Jamais utilisé comme donnée envoyée au serveur —
 * uniquement pour rassurer visuellement sur l'appareil déjà reconnu. */
export function maskPhoneSenegalDisplay(e164: string): string {
  const local = e164.startsWith(SENEGAL_PREFIX) ? e164.slice(SENEGAL_PREFIX.length) : e164;
  const groups = groupDigits(localDigitsFrom(local));
  const masked = groups.map((g, i) => (i === 0 || i === groups.length - 1 ? g : "•".repeat(g.length)));
  return `${SENEGAL_PREFIX} ${masked.join(" ")}`;
}
