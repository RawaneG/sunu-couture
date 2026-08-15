import { useState } from "react";
import { Link, useNavigate, useMatch } from "react-router-dom";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import Avatar from "../components/ui/Avatar";
import Fab from "../components/ui/Fab";
import SwipeRow from "../components/ui/SwipeRow";
import { STATUS_DOT_COLOR } from "../components/ui/StatusPill";
import { IconPlus, IconUsers } from "../lib/icons";
import { matchesQuery } from "../lib/search";
import { haptic } from "../lib/haptics";

export default function ClientsList() {
  const clients = useStore((s) => s.clients);
  const orders = useStore((s) => s.orders);
  const navigate = useNavigate();
  const activeMatch = useMatch("/clients/:id");
  const [query, setQuery] = useState("");

  const filtered = clients.filter((c) => matchesQuery(query, c.name, c.phone));

  const addButton = (
    <Link
      to="/clients/nouveau"
      onClick={() => haptic()}
      aria-label="Nouveau client"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo text-white active:scale-90 transition-transform lg:h-10 lg:w-10"
    >
      <IconPlus size={16} strokeWidth={2} />
    </Link>
  );

  return (
    <div className="lg:h-full lg:flex lg:flex-col">
      <PageHeader title="Clients" actions={addButton} search={{ query, onQueryChange: setQuery, placeholder: "Nom ou téléphone…" }} />
      <div className="hidden lg:block px-10 -mt-2 pb-4">
        <p className="text-sm text-ink-soft">{clients.length} clients</p>
      </div>

      <div className="flex-1 lg:overflow-y-auto px-2.5 lg:px-6 py-2 pb-4 pt-3">
        {filtered.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-ink-faint">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
              <IconUsers size={22} />
            </span>
            <p className="text-sm font-semibold">Aucun client trouvé.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c, i) => {
              const clientOrders = orders.filter((o) => o.clientId === c.id);
              const active = activeMatch?.params.id === c.id;
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 34, delay: Math.min(i * 0.035, 0.28) }}
                >
                  <SwipeRow
                    phone={c.phone}
                    callLabel={`Appeler ${c.name}`}
                    active={active}
                    onTap={() => navigate(`/clients/${c.id}`)}
                  >
                    <Avatar photo={c.photo} seed={c.colorSeed} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{c.name}</span>
                      <span className="mt-0.5 block text-[11.5px] text-ink-faint tabular-nums">
                        {c.phone || "Numéro non renseigné"}
                      </span>
                    </span>
                    {clientOrders.length > 0 && (
                      <span className="flex flex-none items-center gap-1">
                        {clientOrders.slice(0, 4).map((o) => (
                          <span
                            key={o.id}
                            className={`h-2 w-2 rounded-full ${o.late ? "bg-terracotta" : STATUS_DOT_COLOR[o.status]}`}
                          />
                        ))}
                      </span>
                    )}
                  </SwipeRow>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Fab to="/clients/nouveau" label="Nouveau client" />
    </div>
  );
}
