import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import PinPad from "../../components/auth/PinPad";

interface PinCreateState {
  phoneE164?: string;
  from?: Location;
}

// Écran 3 (corr. Gate Auth §5/§44) — choix du PIN, premier des deux passages
// (confirmation à l'écran suivant). Refresh-safe : sans numéro en state
// (rechargement direct de l'URL), retour à l'étape numéro plutôt qu'un écran
// mort.
export default function PinCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as PinCreateState | null;
  const phoneE164 = state?.phoneE164 ?? null;
  const from = state?.from;

  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!phoneE164) navigate("/connexion/numero", { replace: true, state: { mode: "register" } });
  }, [phoneE164, navigate]);

  if (!phoneE164) return null;

  function handleComplete(value: string) {
    // Micro-pause : laisse le 4e point se remplir visuellement avant de
    // changer d'écran (corr. Gate Auth §44) — jamais un bouton supplémentaire
    // requis ici.
    setTimeout(() => {
      navigate("/connexion/confirmer-code", { state: { phoneE164, pin: value, from } });
    }, 220);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col items-center gap-6 text-center">
        <div>
          <h1 className="text-lg font-bold text-ink">Choisis ton code</h1>
          <p className="mt-1 text-sm text-ink-soft">4 chiffres que tu retiens facilement</p>
        </div>
        <PinPad value={pin} onChange={setPin} onComplete={handleComplete} length={4} label="Choisis ton code" autoFocus />
      </div>
    </motion.div>
  );
}
