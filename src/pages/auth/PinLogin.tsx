import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import PinPad from "../../components/auth/PinPad";
import PinScreenCard from "../../components/auth/PinScreenCard";
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
      // `session_activation_failed` (corr. Gate Auth handoff §12) : les
      // identifiants ont réellement été vérifiés côté serveur — un simple
      // message + nouvelle saisie suffit ici (contrairement à `register()`,
      // relancer `login()` n'a aucun effet de bord, jamais de risque de
      // doublon/409) — jamais le jargon technique sous-jacent (§16).
      setError(result.code === "session_activation_failed" ? "Connexion en cours de finalisation. Réessaie." : result.message);
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

  // Retour déterministe (corr. Gate Auth navigation §19) — uniquement pour un
  // numéro fraîchement saisi (via /connexion/numero) : le préremplit au
  // retour (§20). Sur un appareil déjà reconnu ("Bon retour"), « Ce n'est pas
  // mon numéro » ci-dessous est déjà la sortie évidente de cet écran (§17) —
  // un second bouton Retour ferait doublon, jamais ajouté ici.
  function handleBack() {
    navigate("/connexion/numero", { state: { mode: "login", phoneE164, from } });
  }

  if (submitting) return <AuthLoading text="Connexion…" />;

  return (
    <PinScreenCard
      title={isRemembered ? "Bon retour" : "Entre ton code"}
      subtitle={isRemembered ? maskPhoneSenegalDisplay(phoneE164) : undefined}
      onBack={isRemembered ? undefined : handleBack}
    >
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
    </PinScreenCard>
  );
}
