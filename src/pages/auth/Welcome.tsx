import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import { IconSpool } from "../../lib/icons";

// Écran d'entrée (corr. Gate Auth §5/§42) — une seule promesse courte, deux
// actions, rien d'autre. Monté UNIQUEMENT quand aucun numéro n'est mémorisé
// sur cet appareil (voir ConnexionEntry) : sinon l'appareil reconnu saute
// directement à l'écran PIN ("Bon retour").
export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  // Route protégée demandée avant la redirection vers /connexion
  // (RequireAuth) — propagée à travers TOUT le parcours (numéro -> PIN) pour
  // y revenir une fois connecté, jamais perdue en route.
  const from = (location.state as { from?: Location } | null)?.from;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col items-center gap-6 text-center">
        <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-tile/20 text-amber-tile">
          <IconSpool size={30} />
        </span>

        <div>
          <h1 className="text-xl font-bold text-ink">Bienvenue sur Tayoo</h1>
          <p className="mt-1 text-sm text-ink-soft">Ton carnet, toujours avec toi.</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/connexion/numero", { state: { mode: "register", from } })}
            className="flex min-h-13 items-center justify-center rounded-2xl bg-amber-tile px-4 py-4 font-bold text-[#2a1c04] shadow-soft"
          >
            Commencer
          </motion.button>

          <button
            type="button"
            onClick={() => navigate("/connexion/numero", { state: { mode: "login", from } })}
            className="min-h-13 font-semibold text-ink-soft underline decoration-dotted underline-offset-4"
          >
            J'ai déjà un code
          </button>
        </div>
      </div>
    </motion.div>
  );
}
