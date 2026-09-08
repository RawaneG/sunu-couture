import { motion, useReducedMotion } from "framer-motion";

// État de chargement court après confirmation du PIN (corr. Gate Auth §54) —
// jamais un spinner indéfini sans texte : un message très simple, accessible
// (`role="status"`, annoncé aux lecteurs d'écran), le temps que le serveur
// termine register()/login(). Même contrat que l'état de chargement de
// RequireAuth (cohérence du parcours auth) — habillage un peu plus chaleureux
// ici (trois points animés) puisque c'est un moment bref mais très visible.
export default function AuthLoading({ text }: { text: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex items-center gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-amber-tile"
            animate={reducedMotion ? undefined : { opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
          />
        ))}
      </div>
      <p className="text-base font-semibold text-ink-soft">{text}</p>
    </div>
  );
}
