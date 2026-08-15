import { useState } from "react";
import { Link, useMatch } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import Avatar from "../components/ui/Avatar";
import Fab from "../components/ui/Fab";
import { STATUS_DOT_COLOR } from "../components/ui/StatusPill";
import { IconPlus, IconSearch, IconUsers, IconX } from "../lib/icons";
import { matchesQuery } from "../lib/search";

export default function ClientsList() {
  const clients = useStore((s) => s.clients);
  const orders = useStore((s) => s.orders);
  const activeMatch = useMatch("/clients/:id");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = clients.filter((c) => matchesQuery(query, c.name, c.phone));

  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setSearchOpen((v) => !v)}
        aria-label="Rechercher"
        className={clsx(
          "flex h-8 w-8 flex-none items-center justify-center rounded-full lg:h-10 lg:w-10",
          searchOpen ? "bg-indigo text-white" : "bg-surface-2 text-ink-soft"
        )}
      >
        <IconSearch size={15} />
      </button>
      <Link
        to="/clients/nouveau"
        aria-label="Nouveau client"
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo text-white lg:h-10 lg:w-10"
      >
        <IconPlus size={16} strokeWidth={2} />
      </Link>
    </div>
  );

  return (
    <div className="lg:h-full lg:flex lg:flex-col">
      <PageHeader title="Clients" actions={headerActions} />
      <div className="hidden lg:block px-10 -mt-2 pb-4">
        <p className="text-sm text-ink-soft">{clients.length} clients</p>
      </div>

      {searchOpen && (
        <div className="px-4 lg:px-10 pb-2">
          <label className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5">
            <IconSearch size={15} className="flex-none text-ink-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom ou téléphone…"
              className="w-full min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:text-ink-faint placeholder:font-normal"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Effacer" className="flex-none text-ink-faint">
                <IconX size={14} />
              </button>
            )}
          </label>
        </div>
      )}

      <div className="flex-1 lg:overflow-y-auto px-2.5 lg:px-6 py-2 pb-4">
        {filtered.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-ink-faint">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
              <IconUsers size={22} />
            </span>
            <p className="text-sm font-semibold">Aucun client trouvé.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((c) => {
              const clientOrders = orders.filter((o) => o.clientId === c.id);
              const active = activeMatch?.params.id === c.id;
              return (
                <motion.div key={c.id} whileTap={{ scale: 0.985 }}>
                  <Link
                    to={`/clients/${c.id}`}
                    className={clsx(
                      "flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors",
                      active ? "bg-indigo-tint" : "hover:bg-surface-2"
                    )}
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
                  </Link>
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
