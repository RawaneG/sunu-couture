import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import clsx from "clsx";
import { haptic } from "../../lib/haptics";

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
  index = 0,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: number;
  variant: keyof typeof VARIANT;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 28, delay: index * 0.055 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      className="hover:[&_a]:shadow-lift"
    >
      <Link
        to={to}
        onClick={() => haptic()}
        className={clsx(
          "relative flex h-28 lg:h-32 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-4 lg:p-5 text-white shadow-soft transition-shadow",
          VARIANT[variant]
        )}
      >
        <span
          className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/15 blur-xl"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]"
          aria-hidden="true"
        />
        {typeof badge === "number" && (
          <motion.span
            key={badge}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="absolute right-3 top-3 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-extrabold tabular-nums"
          >
            {badge}
          </motion.span>
        )}
        <span className="relative opacity-95">{icon}</span>
        <span className="relative text-[13px] lg:text-sm font-bold leading-tight text-balance">{label}</span>
      </Link>
    </motion.div>
  );
}
