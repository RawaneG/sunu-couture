import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import clsx from "clsx";

const VARIANT: Record<string, string> = {
  amber: "from-amber-tile to-[#a8691a]",
  indigo: "from-indigo-soft to-indigo",
  teal: "from-[#3ba189] to-teal",
  terracotta: "from-[#c96a44] to-terracotta",
};

export default function Tile({
  to,
  icon,
  label,
  badge,
  variant,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: number;
  variant: keyof typeof VARIANT;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 350, damping: 22 }}
      className="hover:[&_a]:shadow-lift"
    >
      <Link
        to={to}
        className={clsx(
          "relative flex h-28 lg:h-32 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-4 lg:p-5 text-white shadow-soft transition-shadow",
          VARIANT[variant]
        )}
      >
        <span
          className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/15 blur-xl"
          aria-hidden="true"
        />
        {typeof badge === "number" && (
          <span className="absolute right-3 top-3 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-extrabold tabular-nums">
            {badge}
          </span>
        )}
        <span className="relative opacity-95">{icon}</span>
        <span className="relative text-[13px] lg:text-sm font-bold leading-tight text-balance">{label}</span>
      </Link>
    </motion.div>
  );
}
