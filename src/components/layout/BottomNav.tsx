import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { IconHome, IconHanger, IconUsers } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

const NAV = [
  { to: "/", label: "Accueil", icon: IconHome, end: true },
  { to: "/commandes", label: "Commandes", icon: IconHanger, end: false },
  { to: "/clients", label: "Clients", icon: IconUsers, end: false },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-3 z-30 lg:hidden"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex items-center justify-around rounded-[28px] border border-line-strong/30 bg-surface/70 px-2 py-2 shadow-lift backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => haptic()}
            className="relative flex flex-1 flex-col items-center gap-1 rounded-full py-1.5"
          >
            {({ isActive }) => (
              <>
                <span className="relative flex h-9 w-11 items-center justify-center">
                  {isActive && (
                    <motion.span
                      layoutId="bottomnav-pill"
                      className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-soft to-indigo shadow-soft"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  )}
                  <Icon size={19} className={isActive ? "relative text-white" : "relative text-ink-faint"} />
                </span>
                <span className={`text-[10px] font-bold ${isActive ? "text-indigo" : "text-ink-faint"}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
