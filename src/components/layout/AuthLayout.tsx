import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import BrandMark from "../ui/BrandMark";

// Layout dédié aux écrans d'authentification — INDÉPENDANT de AppShell : aucune
// barre de navigation basse métier, aucune barre latérale métier, aucune icône
// de navigation sans libellé. Une seule carte centrée, largeur maximale ~440px.
// Ne modifie et ne réutilise AUCUN composant d'écran métier existant
// (Sidebar/BottomNav restent intacts, simplement absents de cette arborescence).
//
// Habillage volontairement plus riche que le reste de l'app (corr. design
// review post-implémentation pivot PIN) : sur un grand écran, une carte seule
// dans un aplat uni se lit comme un prototype inachevé. Deux lueurs
// d'ambiance douces (ambre + indigo, mêmes teintes que la marque) + une trame
// discrète comblent l'espace autour de la carte sans jamais distraire de
// l'action — respecte `prefers-reduced-motion` (pas d'animation, lueurs figées).
export default function AuthLayout({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden text-ink font-sans">
      <div className="bg-weave pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full"
        style={{ background: "radial-gradient(closest-side, var(--glow-2), transparent)", filter: "blur(10px)" }}
        animate={reducedMotion ? undefined : { opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-16 h-[560px] w-[560px] rounded-full"
        style={{ background: "radial-gradient(closest-side, var(--glow-1), transparent)", filter: "blur(10px)" }}
        animate={reducedMotion ? undefined : { opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
      />

      <main className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full flex-col items-center gap-8" style={{ maxWidth: 440 }}>
          {/* Repère de marque — statique, jamais un lien de navigation vers l'app métier. */}
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="glass-brand flex h-11 w-11 flex-none items-center justify-center rounded-2xl">
              <BrandMark size={26} />
            </span>
            <span className="font-display italic font-bold text-xl leading-none text-ink">Tayoo</span>
          </div>

          <div className="w-full">{children}</div>
        </div>
      </main>
    </div>
  );
}
