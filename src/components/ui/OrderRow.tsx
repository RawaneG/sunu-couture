import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Order } from "../../lib/types";
import { useStore } from "../../lib/store";
import Avatar from "./Avatar";
import StatusPill from "./StatusPill";
import { formatCompactDate, formatCompactRange, formatFCFA } from "../../lib/format";

export default function OrderRow({ order, active }: { order: Order; active?: boolean }) {
  const client = useStore((s) => s.getClient(order.clientId));
  const dateLabel = order.dueDateStart
    ? formatCompactRange(order.dueDateStart, order.dueDate)
    : formatCompactDate(order.dueDate);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      whileTap={{ scale: 0.985 }}
    >
      <Link
        to={`/commandes/${order.id}`}
        className={
          "flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors " +
          (active ? "bg-indigo-tint" : "hover:bg-surface-2")
        }
      >
        <Avatar photo={client?.photo} seed={client?.colorSeed} size={44} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 flex-none rounded-full border border-line-strong" style={{ background: order.fabricColor }} />
            <span className="truncate text-[13.5px] font-bold">{order.garment}</span>
          </span>
          <span className="mt-0.5 block text-[11.5px] text-ink-faint">
            {client?.name ?? "Client"} · {dateLabel}
          </span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1.5">
          <StatusPill order={order} />
          <span className="text-[11px] font-bold text-ink-faint tabular-nums">{formatFCFA(order.price)} F</span>
        </span>
      </Link>
    </motion.div>
  );
}
