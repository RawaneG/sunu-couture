import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { IconPlus } from "../../lib/icons";

export default function Fab({ to, label = "Nouvelle commande" }: { to: string; label?: string }) {
  return (
    <motion.div
      className="fixed right-5 z-30 lg:hidden"
      style={{ bottom: "calc(78px + env(safe-area-inset-bottom))" }}
      whileTap={{ scale: 0.92 }}
    >
      <Link
        to={to}
        aria-label={label}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-tile text-[#2a1c04] shadow-lift"
      >
        <IconPlus size={24} strokeWidth={2} />
      </Link>
    </motion.div>
  );
}
