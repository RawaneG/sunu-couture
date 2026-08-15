import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { Order } from "../../lib/types";
import { useStore } from "../../lib/store";
import Avatar from "./Avatar";
import StatusPill from "./StatusPill";
import SwipeRow from "./SwipeRow";
import { formatCompactDate, formatCompactRange, formatFCFA } from "../../lib/format";

export default function OrderRow({
  order,
  active,
  index = 0,
  swipeHint,
}: {
  order: Order;
  active?: boolean;
  index?: number;
  swipeHint?: boolean;
}) {
  const navigate = useNavigate();
  const client = useStore((s) => s.getClient(order.clientId));
  const dateLabel = order.dueDateStart
    ? formatCompactRange(order.dueDateStart, order.dueDate)
    : formatCompactDate(order.dueDate);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 34, delay: Math.min(index * 0.035, 0.28) }}
    >
      <SwipeRow
        phone={client?.phone}
        callLabel={`Appeler ${client?.name ?? ""}`}
        active={active}
        hint={swipeHint}
        onTap={() => navigate(`/commandes/${order.id}`)}
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
      </SwipeRow>
    </motion.div>
  );
}
