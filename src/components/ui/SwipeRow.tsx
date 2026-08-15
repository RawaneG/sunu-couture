import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { IconPhone, IconBack } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { hasSeenSwipeHint, markSwipeHintSeen } from "../../lib/onboarding";

const REVEAL = 76;
const PEEK = 42;
const spring = { type: "spring" as const, stiffness: 500, damping: 40 };

export default function SwipeRow({
  phone,
  callLabel,
  active,
  onTap,
  hint,
  children,
}: {
  phone: string | null | undefined;
  callLabel: string;
  active?: boolean;
  onTap: () => void;
  hint?: boolean;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const callOpacity = useTransform(x, [-REVEAL, -REVEAL * 0.4, 0], [1, 0.5, 0]);
  const [revealed, setRevealed] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const draggedRef = useRef(false);
  const canCall = Boolean(phone);

  useEffect(() => {
    if (!hint || !canCall || hasSeenSwipeHint()) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        haptic();
        setShowTip(true);
        animate(x, -PEEK, { type: "spring", stiffness: 300, damping: 26 });
        timers.push(
          window.setTimeout(() => {
            animate(x, 0, spring);
            setShowTip(false);
            markSwipeHintSeen();
          }, 1500)
        );
      }, 700)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Runs once per row mount by design — re-running on prop changes would replay
    // the demo mid-interaction, which is exactly what a one-time hint must avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="relative">
      {createPortal(
        <AnimatePresence>
          {showTip && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center lg:hidden"
              style={{ top: "calc(env(safe-area-inset-top) + 60px)" }}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3.5 py-2 text-[12px] font-bold text-paper shadow-lift">
                <IconBack size={12} strokeWidth={2.4} />
                Glissez une carte vers la gauche pour appeler
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="relative overflow-hidden rounded-2xl">
        {canCall && (
          <motion.div
            style={{ opacity: callOpacity }}
            className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center"
          >
            <a
              href={`tel:${phone!.replace(/\s/g, "")}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => haptic(14)}
              aria-label={callLabel}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-teal text-white shadow-soft"
            >
              <IconPhone size={17} />
            </a>
          </motion.div>
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
            (active ? "bg-indigo-tint" : "glass-card hover:bg-surface-2")
          }
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
