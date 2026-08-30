import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Location } from "react-router-dom";
import { motion } from "framer-motion";
import { IconAlert, IconCheck, IconHanger } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { useAuth } from "../../lib/auth/AuthProvider";

const MAX_NAME_LENGTH = 120;

// Affiché UNIQUEMENT quand `provisionWorkshop(null)` a répondu
// `WORKSHOP_NAME_REQUIRED` (aucun atelier existant) — jamais pour un
// utilisateur qui a déjà un atelier. Ne demande QUE le nom, rien d'autre.
export default function WorkshopName() {
  const navigate = useNavigate();
  const location = useLocation();
  const { provisionWorkshop } = useAuth();
  const errorId = useId();
  const from = (location.state as { from?: Location } | null)?.from;

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH && !saving;

  async function handleSubmit() {
    if (!trimmed) {
      setError("Le nom de l'atelier est requis.");
      return;
    }
    setError(null);
    setSaving(true);
    haptic(16);
    const result = await provisionWorkshop(trimmed);
    setSaving(false);

    if (result.kind === "workshop") {
      const destination = from?.pathname && from.pathname !== "/connexion" ? `${from.pathname}${from.search ?? ""}` : "/";
      navigate(destination, { replace: true });
      return;
    }
    if (result.kind === "name_required") {
      // Ne devrait pas arriver puisqu'un nom non vide est envoyé — filet de
      // sécurité si jamais la validation serveur diverge de celle du client.
      setError("Le nom de l'atelier est requis.");
      return;
    }
    setError(result.message);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="glass-card rounded-3xl shadow-soft p-6 lg:p-10 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-amber-tile/20 text-amber-tile"
          >
            <IconHanger size={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-ink">Dernière étape</h1>
            <p className="text-sm text-ink-soft">Donne un nom à ton atelier de couture.</p>
          </div>
        </div>

          <div>
            <label htmlFor="workshop-name-input" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Nom de l'atelier
            </label>
            <div className="glass-input flex items-center gap-2 rounded-2xl px-4 py-3.5 focus-within:ring-2 focus-within:ring-indigo">
              <input
                id="workshop-name-input"
                type="text"
                autoFocus
                autoComplete="organization"
                placeholder="Ex. Couture chez Fatou"
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
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
            aria-busy={saving}
            className={
              "flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-4 font-bold shadow-soft transition-colors " +
              (canSubmit ? "bg-amber-tile text-[#2a1c04]" : "bg-surface-3 text-ink-faint")
            }
          >
            <IconCheck size={18} strokeWidth={2} />
            {saving ? "Création…" : "Créer mon atelier"}
          </motion.button>
      </div>
    </motion.div>
  );
}
