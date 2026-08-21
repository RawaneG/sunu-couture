import { useRef } from "react";
import { motion } from "framer-motion";
import { IconMoon, IconSun } from "../../lib/icons";
import { useTheme } from "../../lib/theme";
import { haptic } from "../../lib/haptics";
import BrandMark from "../ui/BrandMark";

export default function MobileBrandBar() {
  const { dark, toggle } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="flex items-center gap-2.5 px-4 pt-5 pb-3 lg:hidden"
    >
      <span className="glass-brand flex h-8 w-8 flex-none items-center justify-center rounded-lg">
        <BrandMark size={21} />
      </span>
      <span className="flex-1 font-display italic font-bold text-lg leading-none">Tayoo</span>
      <motion.button
        ref={btnRef}
        type="button"
        whileTap={{ scale: 0.88, rotate: -12 }}
        onClick={() => {
          haptic();
          const rect = btnRef.current?.getBoundingClientRect();
          toggle(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
        }}
        aria-label="Changer de thème"
        className="glass-chip flex h-9 w-9 items-center justify-center rounded-full text-ink-soft"
      >
        {dark ? <IconSun size={16} /> : <IconMoon size={16} />}
      </motion.button>
    </motion.div>
  );
}
