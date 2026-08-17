import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { Fiche } from "../../lib/types";
import { useStore } from "../../lib/store";
import Avatar from "./Avatar";
import StatusPill from "./StatusPill";
import SwipeRow from "./SwipeRow";
import { formatCompactDate, formatFCFA } from "../../lib/format";

export default function OrderRow({
  fiche,
  active,
  index = 0,
  swipeHint,
}: {
  fiche: Fiche;
  active?: boolean;
  index?: number;
  swipeHint?: boolean;
}) {
  const navigate = useNavigate();
  const client = useStore((s) => (fiche.clientId ? s.getClient(fiche.clientId) : undefined));
  const name = [fiche.prenom, fiche.nom].filter(Boolean).join(" ") || client?.name || "Sans nom";
  const phone = fiche.telephone || client?.phone || "";

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 34, delay: Math.min(index * 0.035, 0.28) }}
    >
      <SwipeRow
        phone={phone}
        callLabel={`Appeler ${name}`}
        active={active}
        hint={swipeHint}
        onTap={() => navigate(`/carnet/${fiche.id}`)}
      >
        <Avatar photo={client?.photo} seed={client?.colorSeed} size={44} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 flex-none rounded-full border border-line-strong" style={{ background: fiche.fabricColor }} />
            <span className="truncate text-[13.5px] font-bold">{fiche.garment || `Fiche n° ${fiche.numero}`}</span>
          </span>
          <span className="mt-0.5 block text-[11.5px] text-ink-faint">
            {name} · {fiche.dueDate ? formatCompactDate(fiche.dueDate) : "Pas de date"}
          </span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1.5">
          <StatusPill fiche={fiche} />
          <span className="text-[11px] font-bold text-ink-faint tabular-nums">{formatFCFA(fiche.price)} F</span>
        </span>
      </SwipeRow>
    </motion.div>
  );
}
