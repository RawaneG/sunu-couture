import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { IconPlus } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

const COLOR_STYLES = {
  amber: "bg-gradient-to-br from-amber-tile to-[#b87a1f] text-[#2a1c04]",
  teal: "bg-gradient-to-br from-teal to-[#0f5a49] text-white",
  indigo: "bg-gradient-to-br from-indigo-soft to-indigo text-white",
} as const;

export default function Fab({
  to,
  label = "Nouvelle commande",
  color = "amber",
}: {
  to: string;
  label?: string;
  color?: keyof typeof COLOR_STYLES;
}) {
  return (
    <motion.div
      className="fixed right-4 z-40 lg:hidden"
      style={{ bottom: "calc(112px + env(safe-area-inset-bottom))" }}
      initial={{ opacity: 0, scale: 0.7, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 24, delay: 0.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <Link
        to={to}
        onClick={() => haptic(12)}
        aria-label={label}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full shadow-lift shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] ring-1 ring-black/5 ${COLOR_STYLES[color]}`}
      >
        <IconPlus size={24} strokeWidth={2.2} />
      </Link>
    </motion.div>
  );
}
