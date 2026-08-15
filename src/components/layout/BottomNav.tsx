import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { IconHome, IconHanger, IconUsers } from "../../lib/icons";

const NAV = [
  { to: "/", label: "Accueil", icon: IconHome, end: true },
  { to: "/commandes", label: "Commandes", icon: IconHanger, end: false },
  { to: "/clients", label: "Clients", icon: IconUsers, end: false },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="flex flex-col items-center gap-1 px-5 py-2.5">
          {({ isActive }) => (
            <>
              <span className="relative flex h-9 w-11 items-center justify-center">
                {isActive && (
                  <motion.span
                    layoutId="bottomnav-pill"
                    className="absolute inset-0 rounded-xl bg-indigo-tint"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon size={19} className={isActive ? "relative text-indigo" : "relative text-ink-faint"} />
              </span>
              <span className={`text-[10px] font-bold ${isActive ? "text-indigo" : "text-ink-faint"}`}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
