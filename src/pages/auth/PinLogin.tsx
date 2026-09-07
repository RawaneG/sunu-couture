import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import PinPad from "../../components/auth/PinPad";
import AuthLoading from "../../components/auth/AuthLoading";
import { IconAlert } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { maskPhoneSenegalDisplay } from "../../lib/phone";
import { useAuth } from "../../lib/auth/AuthProvider";
import { clearRememberedPhone, getRememberedPhone, setRememberedPhone } from "../../lib/auth/rememberedPhone";

interface PinLoginState {
  phoneE164?: string;
  from?: Location;
}

// Écran PIN de connexion (corr. Gate Auth §6/§46) — utilisé dans DEUX cas :
//   - appareil déjà reconnu (numéro mémorisé localement) : « Bon retour »,
//     numéro partiellement masqué, lien « Ce n'est pas mon numéro » ;
//   - numéro fraîchement saisi via /connexion/numero (mode "login") : titre
//     générique, pas de numéro affiché (déjà visible à l'écran précédent).
export default function PinLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const errorId = useId();
  const state = location.state as PinLoginState | null;
  const remembered = !state?.phoneE164 ? getRememberedPhone() : null;
  const phoneE164 = state?.phoneE164 ?? remembered;
  const isRemembered = Boolean(remembered) && !state?.phoneE164;
  const from = state?.from;

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (!phoneE164) navigate("/connexion", { replace: true });
  }, [phoneE164, navigate]);

  if (!phoneE164) return null;

  async function handleComplete(value: string) {
    setError(null);
    // Efface IMMÉDIATEMENT la valeur locale, AVANT de basculer vers l'état de
    // chargement (qui démonte <PinPad>, corr. Gate Auth §54) : sans ce reset,
    // un PinPad remonté plus tard (ex. après une erreur) retrouverait encore
    // "value" à 4 chiffres et redéclencherait aussitôt onComplete — boucle de
    // soumission infinie (son propre `completedRef` interne ne survit pas au
    // démontage/remontage, seule la valeur du PARENT le peut).
    setPin("");
    setSubmitting(true);
    const result = await login(phoneE164!, value);
    setSubmitting(false);
    if (!result.ok) {
      haptic([10, 40, 10]);
      setError(result.message);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setPin("");
      return;
    }
    setRememberedPhone(phoneE164!);
    const destination = from?.pathname && from.pathname !== "/connexion" ? `${from.pathname}${from.search ?? ""}` : "/";
    navigate(destination, { replace: true });
  }

  function handleNotMyNumber() {
    clearRememberedPhone();
    navigate("/connexion/numero", { state: { mode: "login" } });
  }

  if (submitting) return <AuthLoading text="Connexion…" />;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col items-center gap-6 text-center">
        <div>
          <h1 className="text-lg font-bold text-ink">{isRemembered ? "Bon retour" : "Entre ton code"}</h1>
          {isRemembered && <p className="mt-1 text-sm text-ink-soft">{maskPhoneSenegalDisplay(phoneE164)}</p>}
        </div>

        <PinPad value={pin} onChange={setPin} onComplete={handleComplete} length={4} label="Entre ton code" autoFocus shake={shake} />

        {error && (
          <p id={errorId} role="alert" aria-live="assertive" className="flex items-start gap-2 text-sm font-semibold text-terracotta">
            <IconAlert size={16} className="mt-0.5 flex-none" />
            <span>{error}</span>
          </p>
        )}

        <div className="flex flex-col items-center gap-2 text-sm">
          {isRemembered && (
            <button type="button" onClick={handleNotMyNumber} className="min-h-11 font-semibold text-ink-soft underline decoration-dotted underline-offset-4">
              Ce n'est pas mon numéro
            </button>
          )}
          <button
            type="button"
            onClick={() => setForgotOpen((o) => !o)}
            aria-expanded={forgotOpen}
            className="min-h-11 font-semibold text-ink-soft underline decoration-dotted underline-offset-4"
          >
            Code oublié ?
          </button>
          {forgotOpen && (
            <p role="status" className="max-w-xs text-xs text-ink-soft">
              Contacte l'assistance Tayoo pour récupérer ton accès.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
