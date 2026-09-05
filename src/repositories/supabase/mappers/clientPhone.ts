// Normalisation E.164 dédiée aux CLIENTS (D3) — délibérément SÉPARÉE de
// `src/lib/phone.ts#normalizePhoneSenegal` (réservée au parcours OTP
// d'authentification, D5) pour ne jamais changer accidentellement le
// comportement de connexion en modifiant les règles de saisie client (revue
// post-7A, §11).
//
// Règles D3 :
//   - un numéro déjà conforme E.164 (`+` + chiffre non nul + 6 à 14 chiffres,
//     même contrainte que `clients.phone_e164` en base) est conservé TEL
//     QUEL, y compris pour un indicatif non sénégalais (D3 n'exige pas que
//     tous les clients soient sénégalais, seulement que la normalisation
//     LOCALE cible le Sénégal) ;
//   - sinon, un numéro LOCAL sénégalais valide (9 chiffres commençant par 7,
//     avec ou sans préfixe `0` ou `221`) est normalisé en `+221XXXXXXXXX` ;
//   - toute autre saisie → `null` (jamais une valeur inventée) — l'appelant
//     conserve la saisie brute dans `phone_display`.
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const SENEGAL_PREFIX = "+221";
const SENEGAL_LOCAL_DIGITS = 9;
const SENEGAL_MOBILE_LEADING_DIGIT = "7";

export function normalizeClientPhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (E164_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;

  let local = digitsOnly;
  if (local.startsWith("221")) {
    local = local.slice(3);
  } else if (local.startsWith("0")) {
    local = local.slice(1);
  }

  if (local.length !== SENEGAL_LOCAL_DIGITS || !local.startsWith(SENEGAL_MOBILE_LEADING_DIGIT)) {
    return null;
  }

  return `${SENEGAL_PREFIX}${local}`;
}
