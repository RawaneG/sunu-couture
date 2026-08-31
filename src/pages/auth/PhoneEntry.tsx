import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import { IconAlert, IconPhone } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { normalizePhoneSenegal } from "../../lib/phone";
import { SupabasePhoneOtpAuthRepository } from "../../lib/auth/SupabasePhoneOtpAuthRepository";

// Une seule implémentation ici (téléphone + OTP, décision D5). L'interface
// AuthRepository permet d'en ajouter une autre (ex. Magic Link) plus tard
// sans reconstruire cet écran.
const authRepository = new SupabasePhoneOtpAuthRepository();

export default function PhoneEntry() {
  const navigate = useNavigate();
  const location = useLocation();
  const errorId = useId();
  // Route demandée avant la redirection vers /connexion (RequireAuth) — à
  // transmettre à l'écran OTP puis restaurer après connexion.
  const from = (location.state as { from?: Location } | null)?.from;

  const [rawPhone, setRawPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const normalized = normalizePhoneSenegal(rawPhone);
  const canSubmit = normalized !== null && !sending;

  async function handleSubmit() {
    if (!normalized) {
      setError("Numéro invalide. Entre un numéro sénégalais à 9 chiffres, par exemple 77 000 00 01.");
      return;
    }
    setError(null);
    setSending(true);
    haptic(16);
    const { error: sendError } = await authRepository.sendPhoneOtp(normalized);
    setSending(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    navigate("/connexion/code", { state: { phoneE164: normalized, from } });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-amber-tile/20 text-amber-tile"
          >
            <IconPhone size={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-ink">Ton numéro de téléphone</h1>
            <p className="text-sm text-ink-soft">On t'envoie un code par SMS pour te connecter.</p>
          </div>
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
                placeholder="77 000 00 01"
                value={rawPhone}
                onChange={(e) => setRawPhone(e.target.value)}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                className="w-full min-w-0 bg-transparent py-3 text-base outline-none placeholder:text-ink-soft"
              />
            </div>
          </div>

          <p className="text-sm text-ink-soft">
            Une connexion Internet est nécessaire pour recevoir le code par SMS.
          </p>

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
            aria-busy={sending}
            className={
              "mt-2 flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-4 font-bold shadow-soft transition-colors " +
              (canSubmit ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
            }
          >
            <IconPhone size={18} strokeWidth={2} />
            {sending ? "Envoi du code…" : "Recevoir mon code"}
          </motion.button>
      </div>
    </motion.div>
  );
}
