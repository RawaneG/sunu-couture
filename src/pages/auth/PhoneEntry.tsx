import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import { IconAlert, IconPhone } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { normalizePhoneSenegal } from "../../lib/phone";
import AuthBackButton from "../../components/auth/AuthBackButton";

interface PhoneEntryState {
  /** "register" (défaut, depuis Welcome -> Commencer) ou "login" (depuis
   * Welcome -> J'ai déjà un code, sans numéro mémorisé sur cet appareil). */
  mode?: "register" | "login";
  from?: Location;
  /** Numéro déjà saisi lors d'un passage précédent (corr. Gate Auth
   * navigation §20) — préremplit le champ au retour depuis l'étape suivante,
   * l'utilisateur n'a qu'à le corriger, jamais tout retaper. Toujours l'E.164
   * normalisé (jamais le PIN — celui-ci ne transite JAMAIS par location.state,
   * corr. §21). */
  phoneE164?: string;
}

/** E.164 -> saisie locale affichable dans le champ (ex. "+221770000001" ->
 * "77 000 00 01"), inverse de `normalizePhoneSenegal` — uniquement pour
 * préremplir l'input, jamais envoyé tel quel au serveur. */
function localDigitsForInput(e164: string): string {
  const local = e164.startsWith("+221") ? e164.slice(4) : e164;
  return (local.match(/.{1,2}/g) ?? [local]).join(" ");
}

// Étape PURE numéro — ne parle plus jamais directement à Supabase (pivot
// Gate Auth) : juste une saisie + normalisation, puis navigation vers la
// création du PIN (inscription) ou l'écran PIN de connexion. Aucun SMS,
// aucun OTP.
export default function PhoneEntry() {
  const navigate = useNavigate();
  const location = useLocation();
  const errorId = useId();
  const state = location.state as PhoneEntryState | null;
  const mode = state?.mode ?? "register";
  const from = state?.from;

  const [rawPhone, setRawPhone] = useState(() => (state?.phoneE164 ? localDigitsForInput(state.phoneE164) : ""));
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizePhoneSenegal(rawPhone);
  const canSubmit = normalized !== null;

  function handleSubmit() {
    if (!normalized) {
      setError("Vérifie le numéro.");
      return;
    }
    setError(null);
    haptic(16);
    const destination = mode === "login" ? "/connexion/code" : "/connexion/creer-code";
    navigate(destination, { state: { phoneE164: normalized, from } });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
      <div className="glass-card rounded-4xl shadow-lift p-8 lg:p-11 flex flex-col gap-7">
        <AuthBackButton onClick={() => navigate("/connexion")} />
        <div className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full text-amber-tile"
            style={{ background: "radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--color-amber-tile) 30%, transparent), color-mix(in oklab, var(--color-amber-tile) 12%, transparent))" }}
          >
            <IconPhone size={28} />
          </span>
          <h1 className="font-display text-2xl font-bold text-ink">Ton numéro</h1>
        </div>

        <div>
          <label htmlFor="phone-input" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Numéro de téléphone
          </label>
          <div className="glass-input flex items-center gap-3 rounded-2xl px-5 py-4 focus-within:ring-2 focus-within:ring-indigo">
            <span className="flex-none text-lg font-bold text-ink" aria-hidden="true">
              +221
            </span>
            <input
              id="phone-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              autoFocus
              placeholder="77 000 00 01"
              value={rawPhone}
              onChange={(e) => setRawPhone(e.target.value)}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              className="w-full min-w-0 bg-transparent py-1 text-lg outline-none placeholder:text-ink-faint"
            />
          </div>
        </div>

        {error && (
          <p id={errorId} role="alert" aria-live="assertive" className="flex items-start gap-2 text-sm font-semibold text-terracotta">
            <IconAlert size={16} className="mt-0.5 flex-none" />
            <span>{error}</span>
          </p>
        )}

        <motion.button
          type="button"
          whileTap={canSubmit ? { scale: 0.97 } : undefined}
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={
            "flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-bold shadow-soft transition-colors " +
            (canSubmit ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
          }
        >
          Continuer
        </motion.button>
      </div>
    </motion.div>
  );
}
