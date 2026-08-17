import { useMemo, useState } from "react";
import { useSearchParams, useMatch } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useStore, resteFor } from "../lib/store";
import OrderRow from "../components/ui/OrderRow";
import Fab from "../components/ui/Fab";
import PageHeader from "../components/ui/PageHeader";
import { STATUS_DOT_COLOR } from "../components/ui/StatusPill";
import { IconHanger } from "../lib/icons";
import { isDueToday } from "../lib/format";
import { matchesQuery } from "../lib/search";
import { haptic } from "../lib/haptics";

// Each fiche shows exactly one badge at a time (see StatusPill: "En retard" always
// wins over the step status when late). These filters mirror that — they're mutually
// exclusive buckets matching what's actually printed on each card, not overlapping
// views of the same fiche under two different labels. "reste" is the one exception:
// it's a payment-based cut across statuses, not a step in the same badge.
const FILTERS = [
  { key: "all", label: "Toutes", dot: "bg-ink-faint" },
  { key: "late", label: "En retard", dot: "bg-terracotta" },
  { key: "today", label: "Dû aujourd'hui", dot: "bg-indigo-soft" },
  { key: "reste", label: "Reste à encaisser", dot: "bg-amber-tile" },
  { key: "recu", label: "Reçues", dot: STATUS_DOT_COLOR.recu },
  { key: "couture", label: "En couture", dot: STATUS_DOT_COLOR.couture },
  { key: "pret", label: "Prêtes", dot: STATUS_DOT_COLOR.pret },
  { key: "livre", label: "Livrées", dot: STATUS_DOT_COLOR.livre },
] as const;

export default function OrdersList() {
  const fiches = useStore((s) => s.fiches);
  const clients = useStore((s) => s.clients);
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "all";
  const activeMatch = useMatch("/commandes/:id");
  const [query, setQuery] = useState("");

  const active = useMemo(() => fiches.filter((f) => !f.cancelledAt), [fiches]);

  const filtered = useMemo(() => {
    const sorted = [...active].sort(
      (a, b) => (a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity)
    );
    let result = sorted;
    if (filter === "late") result = result.filter((f) => f.late);
    else if (filter === "today")
      result = result.filter((f) => !f.late && isDueToday(f.dueDate, null, f.status));
    else if (filter === "reste") result = result.filter((f) => resteFor(f) > 0);
    else if (filter === "recu") result = result.filter((f) => !f.late && f.status === "recu");
    else if (filter === "couture") result = result.filter((f) => !f.late && f.status === "couture");
    else if (filter === "pret") result = result.filter((f) => !f.late && f.status === "pret");
    else if (filter === "livre") result = result.filter((f) => f.status === "livre");

    if (query.trim()) {
      result = result.filter((f) => {
        const client = clients.find((c) => c.id === f.clientId);
        return matchesQuery(query, f.garment, f.numero, f.nom, f.prenom, f.telephone, client?.name, client?.phone);
      });
    }
    return result;
  }, [active, clients, filter, query]);

  const firstCallableIndex = useMemo(
    () => filtered.findIndex((f) => Boolean(f.telephone || clients.find((c) => c.id === f.clientId)?.phone)),
    [filtered, clients]
  );

  return (
    <div className="lg:h-full lg:flex lg:flex-col">
      <PageHeader title="Commandes" search={{ query, onQueryChange: setQuery, placeholder: "Client, vêtement ou n° de fiche…" }} />
      <div className="hidden lg:block px-6 -mt-2 py-3">
        <p className="text-sm text-ink-soft">{active.length} commandes au total</p>
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
              {filtered.map((f, i) => (
                <OrderRow
                  key={f.id}
                  fiche={f}
                  active={activeMatch?.params.id === f.id}
                  index={i}
                  swipeHint={i === firstCallableIndex}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Fab to="/commandes/nouvelle" label="Nouvelle fiche" />
    </div>
  );
}
