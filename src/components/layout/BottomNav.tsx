import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { IconHome, IconHanger, IconUsers, IconScissors } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

// "Accueil" is the carnet itself — no separate nav item for it anymore.
const NAV = [
  { to: "/", label: "Accueil", icon: IconHome, end: true },
  { to: "/commandes", label: "Commandes", icon: IconHanger, end: false },
  { to: "/catalogue", label: "Catalogue", icon: IconScissors, end: false },
  { to: "/clients", label: "Clients", icon: IconUsers, end: false },
];

// Corr. Jakob's Law §9/§10/§11 — icône SEULE ne suffit jamais : le libellé
// reste visible en permanence (jamais uniquement au survol/à l'activation),
// renfort essentiel pour un public à alphabétisation variable qui reconnaît
// d'abord la POSITION + l'icône, le texte confirmant ensuite. L'état actif se
// distingue par 3 signaux cumulés (forme + couleur + poids du texte), jamais
// la seule couleur (WCAG) : une pastille pleine derrière l'icône ET le
// libellé qui passe en gras/couleur pleine.
export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-3 z-30 lg:hidden"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex items-center justify-around rounded-[28px] border border-line-strong/30 bg-surface/70 px-1.5 py-1.5 shadow-lift backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => haptic()}
            className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="bottomnav-pill"
                    className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-soft to-indigo shadow-soft"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <Icon size={20} className={isActive ? "relative text-white" : "relative text-ink-faint"} />
                <span
                  className={
                    "relative text-[10px] leading-none " +
                    (isActive ? "font-bold text-white" : "font-semibold text-ink-faint")
                  }
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
