import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import PinPad from "../../components/auth/PinPad";
import AuthLoading from "../../components/auth/AuthLoading";
import { IconAlert } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { useAuth } from "../../lib/auth/AuthProvider";
import { setRememberedPhone } from "../../lib/auth/rememberedPhone";

interface PinConfirmState {
  phoneE164?: string;
  pin?: string;
  from?: Location;
}

// Écran 4 (corr. Gate Auth §5/§45) — second passage du PIN. Si différent :
// message simple, on efface, ON RESTE ICI (jamais un retour à l'écran
// numéro). Si identique : inscription réelle côté serveur
// (`register()` -> Edge Function `tayoo-pin-auth` -> session + atelier
// automatique), jamais un nom d'atelier demandé.
export default function PinConfirm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();
  const errorId = useId();
  const state = location.state as PinConfirmState | null;
  const phoneE164 = state?.phoneE164 ?? null;
  const firstPin = state?.pin ?? null;
  const from = state?.from;

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!phoneE164 || !firstPin) navigate("/connexion/numero", { replace: true, state: { mode: "register" } });
  }, [phoneE164, firstPin, navigate]);

  if (!phoneE164 || !firstPin) return null;

  async function handleComplete(value: string) {
    if (value !== firstPin) {
      haptic([10, 40, 10]);
      setError("Les codes ne sont pas les mêmes. Recommence.");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setPin("");
      return;
    }
    setError(null);
    // Efface IMMÉDIATEMENT la valeur locale, AVANT de basculer vers l'état de
    // chargement (qui démonte <PinPad>, corr. Gate Auth §54) : sans ce reset,
    // un PinPad remonté plus tard (ex. après une erreur) retrouverait encore
    // "value" à 4 chiffres et redéclencherait aussitôt onComplete — boucle de
    // soumission infinie (son propre `completedRef` interne ne survit pas au
    // démontage/remontage, seule la valeur du PARENT le peut).
    setPin("");
    setSubmitting(true);
    const result = await register(phoneE164!, value);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      setPin("");
      return;
    }
    setRememberedPhone(phoneE164!);
    const destination = from?.pathname && from.pathname !== "/connexion" ? `${from.pathname}${from.search ?? ""}` : "/";
    navigate(destination, { replace: true });
  }

  if (submitting) return <AuthLoading text="On prépare ton carnet…" />;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col items-center gap-6 text-center">
        <h1 className="text-lg font-bold text-ink">Encore une fois</h1>
        <PinPad value={pin} onChange={setPin} onComplete={handleComplete} length={4} label="Confirme ton code" autoFocus shake={shake} />
        {error && (
          <p id={errorId} role="alert" aria-live="assertive" className="flex items-start gap-2 text-sm font-semibold text-terracotta">
            <IconAlert size={16} className="mt-0.5 flex-none" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </motion.div>
  );
}
