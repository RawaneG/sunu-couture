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

export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-3 z-30 lg:hidden"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex items-center justify-around rounded-full border border-line-strong/30 bg-surface/70 px-2 py-2 shadow-lift backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => haptic()}
            aria-label={label}
            className="relative flex h-12 w-12 flex-none items-center justify-center rounded-full"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="bottomnav-pill"
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-soft to-indigo shadow-soft"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <Icon size={20} className={isActive ? "relative text-white" : "relative text-ink-faint"} />
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
