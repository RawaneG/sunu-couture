import clsx from "clsx";
import { motion } from "framer-motion";
import { ORDER_STEPS, STATUS_LABEL, type OrderStatus } from "../../lib/types";
import { IconInbox, IconSpool, IconHanger, IconCheck } from "../../lib/icons";

const STEP_ICON: Record<OrderStatus, typeof IconInbox> = {
  recu: IconInbox,
  couture: IconSpool,
  pret: IconHanger,
  livre: IconCheck,
};

export default function Stepper({ status, className }: { status: OrderStatus; className?: string }) {
  const currentIdx = ORDER_STEPS.indexOf(status);
  return (
    <div className={clsx("flex items-start", className)}>
      {ORDER_STEPS.map((step, i) => {
        const Icon = STEP_ICON[step];
        const state = i < currentIdx ? "done" : i === currentIdx ? "now" : "next";
        return (
          <div key={step} className="flex items-start flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <motion.span
                initial={false}
                animate={{ scale: state === "now" ? 1.14 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full flex-none",
                  state === "done" && "bg-teal text-white",
                  state === "now" && "bg-amber-tile text-[#2a1c04] shadow-soft ring-4 ring-amber-tint",
                  state === "next" && "bg-surface-2 text-ink-faint"
                )}
              >
                {state === "done" ? <IconCheck size={16} strokeWidth={2} /> : <Icon size={17} strokeWidth={1.8} />}
              </motion.span>
              <span
                className={clsx(
                  "max-w-[64px] text-center text-[10.5px] font-bold leading-tight",
                  state === "now" ? "text-ink" : state === "done" ? "text-teal" : "text-ink-faint"
                )}
              >
                {STATUS_LABEL[step]}
              </span>
            </div>
            {i < ORDER_STEPS.length - 1 && (
              <span
                className={clsx("mt-5 h-0.5 flex-1 mx-0.5 rounded-full", i < currentIdx ? "bg-teal" : "bg-line-strong")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
