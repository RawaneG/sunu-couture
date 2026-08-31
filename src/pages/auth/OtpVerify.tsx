import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import { IconAlert, IconCheck } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { formatPhoneSenegalDisplay } from "../../lib/phone";
import { SupabasePhoneOtpAuthRepository } from "../../lib/auth/SupabasePhoneOtpAuthRepository";
import { useAuth } from "../../lib/auth/AuthProvider";

const authRepository = new SupabasePhoneOtpAuthRepository();
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

interface OtpVerifyState {
  phoneE164?: string;
  /** Route demandée avant la redirection vers /connexion (RequireAuth) — à
   * restaurer une fois la connexion (et l'atelier) résolus. */
  from?: Location;
}

export default function OtpVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { provisionWorkshop } = useAuth();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const state = location.state as OtpVerifyState | null;
  const phoneE164 = state?.phoneE164 ?? null;
  const from = state?.from;

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const busy = verifying || provisioning;

  // Pas de numéro connu (accès direct / rechargement de page) : impossible de
  // vérifier un code sans savoir pour quel numéro — retour à l'écran 1.
  useEffect(() => {
    if (!phoneE164) navigate("/connexion", { replace: true });
  }, [phoneE164, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (!phoneE164) return null;

  const canSubmit = code.length === CODE_LENGTH && !busy;

  async function handleVerify() {
    if (!phoneE164 || code.length !== CODE_LENGTH) {
      setError("Entre les 6 chiffres du code reçu par SMS.");
      return;
    }
    setError(null);
    setVerifying(true);
    const { session, error: verifyError } = await authRepository.verifyPhoneOtp(phoneE164, code);
    setVerifying(false);
    if (verifyError || !session) {
      haptic([10, 40, 10]);
      setError(verifyError?.message ?? "Le code est incorrect. Vérifie et réessaie.");
      setCode("");
      inputRef.current?.focus();
      return;
    }
    haptic(16);

    // Sonde immédiate : atelier déjà existant → connexion terminée, sinon
    // écran 3 pour demander (une seule fois) le nom de l'atelier. Jamais de
    // nom inventé automatiquement.
    setProvisioning(true);
    const result = await provisionWorkshop(null);
    setProvisioning(false);

    const destination = from?.pathname && from.pathname !== "/connexion" ? `${from.pathname}${from.search ?? ""}` : "/";
    if (result.kind === "workshop") {
      navigate(destination, { replace: true });
      return;
    }
    if (result.kind === "name_required") {
      navigate("/connexion/atelier", { replace: true, state: { from } });
      return;
    }
    // Connexion réussie mais résolution de l'atelier indisponible (hors ligne,
    // erreur serveur) — ne bloque pas la connexion, l'atelier sera résolu au
    // prochain chargement (AuthProvider) ; on informe simplement l'utilisateur.
    setError(result.message);
  }

  async function handleResend() {
    if (!phoneE164 || cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    const { error: sendError } = await authRepository.sendPhoneOtp(phoneE164);
    setResending(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setCode("");
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-bold text-ink">Entre le code reçu</h1>
          <p className="text-sm text-ink-soft">
            Un SMS avec un code à {CODE_LENGTH} chiffres a été envoyé au {formatPhoneSenegalDisplay(phoneE164)}.
          </p>
        </div>

          <div>
            <label htmlFor="otp-input" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Code à {CODE_LENGTH} chiffres
            </label>
            {/* Un seul champ accessible (plutôt que 6 champs séparés, plus difficiles
                à annoncer correctement aux lecteurs d'écran) ; l'espacement des
                lettres donne visuellement l'effet "6 cases". autoComplete
                "one-time-code" permet le remplissage automatique depuis le SMS. */}
            <input
              ref={inputRef}
              id="otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, CODE_LENGTH))}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              className="glass-input w-full rounded-2xl px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] outline-none placeholder:text-ink-soft focus:ring-2 focus:ring-indigo"
              placeholder="……··"
            />
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
            onClick={handleVerify}
            aria-busy={busy}
            className={
              "flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-4 font-bold shadow-soft transition-colors " +
              (canSubmit ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
            }
          >
            <IconCheck size={18} strokeWidth={2} />
            {verifying ? "Vérification…" : provisioning ? "Connexion…" : "Vérifier le code"}
          </motion.button>

          <div className="flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={() => navigate("/connexion")}
              className="min-h-[48px] font-semibold text-ink-soft underline decoration-dotted underline-offset-4"
            >
              Modifier le numéro
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              aria-live="polite"
              className={
                "min-h-[48px] font-semibold underline decoration-dotted underline-offset-4 " +
                (cooldown > 0 || resending ? "text-ink-faint" : "text-amber-tile")
              }
            >
              {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : resending ? "Envoi…" : "Renvoyer le code"}
            </button>
          </div>
        </div>
      </motion.div>
  );
}
