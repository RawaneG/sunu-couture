import { useMemo, useState } from "react";
import { useSearchParams, useMatch } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useStore } from "../lib/store";
import OrderRow from "../components/ui/OrderRow";
import Fab from "../components/ui/Fab";
import PageHeader from "../components/ui/PageHeader";
import { STATUS_DOT_COLOR } from "../components/ui/StatusPill";
import { IconHanger } from "../lib/icons";
import { isDueToday } from "../lib/format";
import { matchesQuery } from "../lib/search";
import { haptic } from "../lib/haptics";

// Each order shows exactly one badge at a time (see StatusPill: "En retard" always
// wins over the step status when late). These filters mirror that — they're mutually
// exclusive buckets matching what's actually printed on each card, not overlapping
// views of the same order under two different labels.
const FILTERS = [
  { key: "all", label: "Toutes", dot: "bg-ink-faint" },
  { key: "late", label: "En retard", dot: "bg-terracotta" },
  { key: "today", label: "Dû aujourd'hui", dot: "bg-indigo-soft" },
  { key: "recu", label: "Reçues", dot: STATUS_DOT_COLOR.recu },
  { key: "couture", label: "En couture", dot: STATUS_DOT_COLOR.couture },
  { key: "pret", label: "Prêtes", dot: STATUS_DOT_COLOR.pret },
  { key: "livre", label: "Livrées", dot: STATUS_DOT_COLOR.livre },
] as const;

export default function OrdersList() {
  const orders = useStore((s) => s.orders);
  const clients = useStore((s) => s.clients);
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "all";
  const activeMatch = useMatch("/commandes/:id");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const sorted = [...orders].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
    let result = sorted;
    if (filter === "late") result = result.filter((o) => o.late);
    else if (filter === "today")
      result = result.filter((o) => !o.late && isDueToday(o.dueDate, o.dueDateStart, o.status));
    else if (filter === "recu") result = result.filter((o) => !o.late && o.status === "recu");
    else if (filter === "couture") result = result.filter((o) => !o.late && o.status === "couture");
    else if (filter === "pret") result = result.filter((o) => !o.late && o.status === "pret");
    else if (filter === "livre") result = result.filter((o) => o.status === "livre");

    if (query.trim()) {
      result = result.filter((o) => {
        const client = clients.find((c) => c.id === o.clientId);
        return matchesQuery(query, o.garment, client?.name, client?.phone);
      });
    }
    return result;
  }, [orders, clients, filter, query]);

  const firstCallableIndex = useMemo(
    () => filtered.findIndex((o) => Boolean(clients.find((c) => c.id === o.clientId)?.phone)),
    [filtered, clients]
  );

  return (
    <div className="lg:h-full lg:flex lg:flex-col">
      <PageHeader title="Commandes" search={{ query, onQueryChange: setQuery, placeholder: "Client ou vêtement…" }} />
      <div className="hidden lg:block px-6 -mt-2 py-3">
        <p className="text-sm text-ink-soft">{orders.length} commandes au total</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 lg:px-6 pt-3 lg:pt-0 pb-4">
        {FILTERS.map((f) => (
          <motion.button
            key={f.key}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              haptic();
              setParams(f.key === "all" ? {} : { filter: f.key });
            }}
            className={clsx(
              "flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
              filter === f.key ? "bg-indigo text-white" : "glass-chip text-ink-soft hover:bg-surface-3"
            )}
          >
            <span className={clsx("h-1.5 w-1.5 rounded-full", filter === f.key ? "bg-white" : f.dot)} />
            {f.label}
          </motion.button>
        ))}
      </div>

      <div className="flex-1 lg:overflow-y-auto px-2.5 lg:px-6 pb-4">
        {filtered.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-ink-faint">
            <span className="glass-chip flex h-12 w-12 items-center justify-center rounded-full">
              <IconHanger size={22} />
            </span>
            <p className="text-sm font-semibold">Aucune commande trouvée.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filtered.map((o, i) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  active={activeMatch?.params.id === o.id}
                  index={i}
                  swipeHint={i === firstCallableIndex}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Fab to="/commandes/nouvelle" />
    </div>
  );
}
