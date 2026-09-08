import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import PinPad from "../../components/auth/PinPad";
import PinScreenCard from "../../components/auth/PinScreenCard";
import AuthLoading from "../../components/auth/AuthLoading";
import { IconAlert } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { useAuth } from "../../lib/auth/AuthProvider";
import { setRememberedPhone } from "../../lib/auth/rememberedPhone";
import type { AuthErrorCode } from "../../lib/auth/AuthContext";

interface CreatePinFlowState {
  phoneE164?: string;
  from?: Location;
}

type Step =
  | "create"
  | "confirm"
  | "submitting"
  /** register() a réellement réussi côté serveur mais l'activation locale de
   * la session a échoué (corr. Gate Auth handoff §12/§13) — jamais reproposer
   * l'inscription (échouerait en phone_in_use), orienter vers la connexion. */
  | "created-needs-login"
  /** register() -> phone_in_use (corr. §14/§30) — état d'action, pas un
   * paragraphe rouge sous le pavé. */
  | "phone-in-use";

// Écrans 3+4 FUSIONNÉS (corr. Gate Auth handoff §21/§22) — choix du PIN puis
// confirmation, UNE SEULE route/instance de composant. Le premier PIN
// (`firstPin`) ne vit QU'EN mémoire React de ce composant : il ne traverse
// JAMAIS `navigate()`, donc jamais `location.state`/`history.state`/URL/
// storage. Un refresh pendant "confirm" perd cet état — c'est le comportement
// VOULU (§23) : retour propre à "create", jamais un écran mort.
export default function CreatePinFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();
  const errorId = useId();
  const state = location.state as CreatePinFlowState | null;
  const phoneE164 = state?.phoneE164 ?? null;
  const from = state?.from;

  const [step, setStep] = useState<Step>("create");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Refresh-safe : sans numéro en state (rechargement direct de l'URL, ou
  // perte du state après un refresh pendant "confirm"), retour à l'étape
  // numéro plutôt qu'un écran mort — jamais le numéro à retaper de zéro
  // puisqu'on ne l'a de toute façon plus ici.
  useEffect(() => {
    if (!phoneE164) navigate("/connexion/numero", { replace: true, state: { mode: "register", from } });
  }, [phoneE164, from, navigate]);

  if (!phoneE164) return null;

  function handleCreateComplete(value: string) {
    haptic(16);
    setFirstPin(value);
    setPin("");
    // Micro-pause : laisse le 4e point se remplir visuellement avant de
    // changer d'étape (corr. Gate Auth §44) — jamais un bouton supplémentaire
    // requis ici.
    setTimeout(() => setStep("confirm"), 220);
  }

  async function handleConfirmComplete(value: string) {
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
    // soumission infinie.
    setPin("");
    setStep("submitting");
    const result = await register(phoneE164!, value);
    setFirstPin(""); // le premier PIN n'a plus besoin d'exister en mémoire, quel que soit le résultat.

    if (result.ok) {
      setRememberedPhone(phoneE164!);
      const destination = from?.pathname && from.pathname !== "/connexion" ? `${from.pathname}${from.search ?? ""}` : "/";
      navigate(destination, { replace: true });
      return;
    }

    handleRegisterError(result.code, result.message);
  }

  function handleRegisterError(code: AuthErrorCode, message: string) {
    if (code === "phone_in_use") {
      setStep("phone-in-use");
      return;
    }
    if (code === "session_activation_failed") {
      // Le compte existe réellement côté serveur (corr. §12) — jamais
      // reproposer l'inscription ici, jamais de jargon technique (§16).
      setStep("created-needs-login");
      return;
    }
    // Cas génériques (invalid_phone, locked, offline, service_unreachable,
    // unknown) : message simple inline, on reste sur "confirm", jamais un
    // retour forcé à l'étape numéro.
    setStep("confirm");
    setError(message);
    setPin("");
  }

  function goToLoginWithKnownNumber() {
    navigate("/connexion/code", { replace: true, state: { phoneE164, from } });
  }

  function handleBackFromCreate() {
    navigate("/connexion/numero", { state: { mode: "register", phoneE164, from } });
  }

  function handleBackFromConfirm() {
    // Retour interne à l'étape "création" du MÊME flux fusionné (§19/§22) —
    // jamais un aller-retour d'URL ni un second passage du PIN par
    // location.state : le composant reste monté, `firstPin` reste en mémoire
    // le temps de laisser l'utilisateur ressaisir un nouveau premier code.
    setError(null);
    setPin("");
    setFirstPin("");
    setStep("create");
  }

  if (step === "submitting") return <AuthLoading text="On prépare ton carnet…" />;

  if (step === "created-needs-login") {
    return (
      <PinScreenCard title="Ton code a bien été créé">
        <p className="text-sm text-ink-soft">Entre ton code pour continuer.</p>
        <button
          type="button"
          onClick={goToLoginWithKnownNumber}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-amber-tile px-4 py-4 text-base font-bold text-[#2a1c04] shadow-soft"
        >
          Entrer mon code
        </button>
      </PinScreenCard>
    );
  }

  if (step === "phone-in-use") {
    return (
      <PinScreenCard title="Ce numéro a déjà un code" onBack={() => setStep("confirm")}>
        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={goToLoginWithKnownNumber}
            className="flex min-h-14 items-center justify-center rounded-2xl bg-amber-tile px-4 py-4 text-base font-bold text-[#2a1c04] shadow-soft"
          >
            Entrer mon code
          </button>
          <button
            type="button"
            onClick={() => navigate("/connexion/numero", { state: { mode: "register", phoneE164, from } })}
            className="min-h-11 font-semibold text-ink-soft underline decoration-dotted underline-offset-4"
          >
            Changer de numéro
          </button>
        </div>
      </PinScreenCard>
    );
  }

  if (step === "create") {
    return (
      <PinScreenCard title="Choisis ton code" subtitle="4 chiffres que tu retiens facilement" onBack={handleBackFromCreate}>
        <PinPad value={pin} onChange={setPin} onComplete={handleCreateComplete} length={4} label="Choisis ton code" autoFocus />
      </PinScreenCard>
    );
  }

  return (
    <PinScreenCard title="Encore une fois" onBack={handleBackFromConfirm}>
      <PinPad value={pin} onChange={setPin} onComplete={handleConfirmComplete} length={4} label="Confirme ton code" autoFocus shake={shake} />
      {error && (
        <p id={errorId} role="alert" aria-live="assertive" className="flex items-start gap-2 text-sm font-semibold text-terracotta">
          <IconAlert size={16} className="mt-0.5 flex-none" />
          <span>{error}</span>
        </p>
      )}
    </PinScreenCard>
  );
}
