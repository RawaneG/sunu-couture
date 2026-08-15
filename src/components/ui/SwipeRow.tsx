import { useRef, useState } from "react";
import { motion, useMotionValue, animate, type PanInfo } from "framer-motion";
import { IconPhone } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

const REVEAL = 76;
const spring = { type: "spring" as const, stiffness: 500, damping: 40 };

export default function SwipeRow({
  phone,
  callLabel,
  active,
  onTap,
  children,
}: {
  phone: string | null | undefined;
  callLabel: string;
  active?: boolean;
  onTap: () => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);
  const draggedRef = useRef(false);
  const canCall = Boolean(phone);

  function close() {
    setRevealed(false);
    animate(x, 0, spring);
  }

  function handleDrag(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > 6) draggedRef.current = true;
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -REVEAL * 0.55) {
      haptic();
      setRevealed(true);
      animate(x, -REVEAL, spring);
    } else {
      close();
    }
  }

  function handleActivate() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (revealed) close();
    else onTap();
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {canCall && (
        <div className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center">
          <a
            href={`tel:${phone!.replace(/\s/g, "")}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => haptic(14)}
            aria-label={callLabel}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-teal text-white shadow-soft"
          >
            <IconPhone size={17} />
          </a>
        </div>
      )}

      <motion.div
        style={{ x }}
        drag={canCall ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.2, right: 0 }}
        dragMomentum={false}
        onDragStart={() => {
          draggedRef.current = false;
        }}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onClick={handleActivate}
        whileTap={{ scale: revealed ? 1 : 0.985 }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (revealed) close();
            else onTap();
          }
        }}
        className={
          "relative flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors " +
          (active ? "bg-indigo-tint" : "bg-surface hover:bg-surface-2")
        }
      >
        {children}
      </motion.div>
    </div>
  );
}
