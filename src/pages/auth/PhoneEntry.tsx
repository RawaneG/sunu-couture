import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import { IconAlert, IconPhone } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { normalizePhoneSenegal } from "../../lib/phone";

interface PhoneEntryState {
  /** "register" (défaut, depuis Welcome -> Commencer) ou "login" (depuis
   * Welcome -> J'ai déjà un code, sans numéro mémorisé sur cet appareil). */
  mode?: "register" | "login";
  from?: Location;
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

  const [rawPhone, setRawPhone] = useState("");
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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-amber-tile/20 text-amber-tile">
            <IconPhone size={22} />
          </span>
          <h1 className="text-lg font-bold text-ink">Ton numéro</h1>
        </div>

        <div>
          <label htmlFor="phone-input" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Numéro de téléphone
          </label>
          <div className="glass-input flex items-center gap-2 rounded-2xl px-4 py-3.5 focus-within:ring-2 focus-within:ring-indigo">
            <span className="flex-none text-base font-bold text-ink" aria-hidden="true">
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
              className="w-full min-w-0 bg-transparent py-3 text-base outline-none placeholder:text-ink-soft"
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
            "mt-2 flex min-h-13 items-center justify-center gap-2 rounded-2xl px-4 py-4 font-bold shadow-soft transition-colors " +
            (canSubmit ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
          }
        >
          Continuer
        </motion.button>
      </div>
    </motion.div>
  );
}
