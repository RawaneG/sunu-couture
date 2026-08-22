import { useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import clsx from "clsx";
import { IconHome, IconHanger, IconUsers, IconScissors, IconPlus, IconSun, IconMoon } from "../../lib/icons";
import { useTheme } from "../../lib/theme";
import BrandMark from "../ui/BrandMark";

// "Accueil" is the carnet itself — no separate nav item for it anymore.
const NAV = [
  { to: "/", label: "Accueil", icon: IconHome, end: true },
  { to: "/commandes", label: "Commandes", icon: IconHanger, end: false },
  { to: "/catalogue", label: "Catalogue", icon: IconScissors, end: false },
  { to: "/clients", label: "Clients", icon: IconUsers, end: false },
];

export default function Sidebar() {
  const { dark, toggle } = useTheme();
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-none lg:flex-col lg:border-r lg:border-line/70 lg:bg-surface/65 lg:backdrop-blur-2xl lg:backdrop-saturate-150">
      <div className="bg-weave px-6 pt-8 pb-7">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glass-brand flex h-9 w-9 flex-none items-center justify-center rounded-xl">
            <BrandMark size={24} />
          </span>
          <span className="font-display italic font-bold text-xl leading-none text-ink text-balance">
            Tayoo
          </span>
        </Link>
      </div>

      <div className="px-4">
        <Link
          to="/carnet/nouvelle"
          className="flex items-center justify-center gap-2 rounded-xl bg-amber-tile px-4 py-3 text-sm font-bold text-[#2a1c04] shadow-soft hover:brightness-105 transition"
        >
          <IconPlus size={16} strokeWidth={2} />
          Nouvelle fiche
        </Link>
      </div>

      <nav className="flex-1 px-3 pt-6">
        <ul className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-colors",
                    isActive ? "bg-indigo-tint text-indigo" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line px-4 py-4">
        <button
          ref={themeBtnRef}
          type="button"
          onClick={() => {
            const rect = themeBtnRef.current?.getBoundingClientRect();
            toggle(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
        >
          {dark ? <IconSun size={17} /> : <IconMoon size={17} />}
          {dark ? "Thème clair" : "Thème sombre"}
        </button>
      </div>
    </aside>
  );
}
