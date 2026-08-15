import { useMemo, useState } from "react";
import { useSearchParams, useMatch } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useStore } from "../lib/store";
import OrderRow from "../components/ui/OrderRow";
import Fab from "../components/ui/Fab";
import PageHeader from "../components/ui/PageHeader";
import { IconHanger } from "../lib/icons";
import { isDueToday } from "../lib/format";
import { matchesQuery } from "../lib/search";
import { haptic } from "../lib/haptics";

const FILTERS = [
  { key: "all", label: "Toutes", dot: "bg-ink-faint" },
  { key: "today", label: "Aujourd'hui", dot: "bg-indigo" },
  { key: "late", label: "Retard", dot: "bg-terracotta" },
  { key: "pret", label: "Prêt", dot: "bg-teal" },
  { key: "encours", label: "En cours", dot: "bg-amber-tile" },
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
    if (filter === "today") result = result.filter((o) => isDueToday(o.dueDate, o.dueDateStart, o.status));
    else if (filter === "late") result = result.filter((o) => o.late);
    else if (filter === "pret") result = result.filter((o) => o.status === "pret");
    else if (filter === "encours") result = result.filter((o) => o.status === "couture");

    if (query.trim()) {
      result = result.filter((o) => {
        const client = clients.find((c) => c.id === o.clientId);
        return matchesQuery(query, o.garment, client?.name, client?.phone);
      });
    }
    return result;
  }, [orders, clients, filter, query]);

  return (
    <div className="lg:h-full lg:flex lg:flex-col">
      <PageHeader title="Commandes" search={{ query, onQueryChange: setQuery, placeholder: "Client ou vêtement…" }} />
      <div className="hidden lg:block px-10 -mt-2 pb-4">
        <p className="text-sm text-ink-soft">{orders.length} commandes au total</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 lg:px-10 pt-3 pb-3">
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
              filter === f.key ? "bg-indigo text-white" : "bg-surface-2 text-ink-soft hover:bg-surface-3"
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
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
              <IconHanger size={22} />
            </span>
            <p className="text-sm font-semibold">Aucune commande trouvée.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filtered.map((o, i) => (
                <OrderRow key={o.id} order={o} active={activeMatch?.params.id === o.id} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Fab to="/commandes/nouvelle" />
    </div>
  );
}
