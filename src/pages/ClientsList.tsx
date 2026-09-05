import { useState } from "react";
import { Link, useNavigate, useMatch } from "react-router-dom";
import { motion } from "framer-motion";
import { useClients, useFiches } from "../repositories/hooks";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import Avatar from "../components/ui/Avatar";
import Fab from "../components/ui/Fab";
import SwipeRow from "../components/ui/SwipeRow";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { STATUS_DOT_COLOR } from "../components/ui/StatusPill";
import { IconCheckSquare, IconPlus, IconSquare, IconTrash, IconUsers, IconX } from "../lib/icons";
import { matchesQuery } from "../lib/search";
import { haptic } from "../lib/haptics";

export default function ClientsList() {
  const clients = useClients();
  const fiches = useFiches();
  const { clients: clientRepository } = useRepositories();
  const navigate = useNavigate();
  const activeMatch = useMatch("/clients/:id");
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = clients.filter((c) => matchesQuery(query, c.name, c.phone));
  const firstCallableIndex = filtered.findIndex((c) => Boolean(c.phone));
  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  function toggleSelectMode() {
    haptic();
    setSelectMode((on) => !on);
    setSelectedIds(new Set());
  }

  function toggleOne(id: string) {
    haptic();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    haptic();
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  }

  async function handleBulkDelete() {
    haptic(16);
    setConfirmDeleteOpen(false);
    try {
      await clientRepository.removeMany([...selectedIds]);
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch {
      setDeleteError("La suppression a échoué. Réessaie.");
    }
  }

  const addButton = (
    <Link
      to="/clients/nouveau"
      onClick={() => haptic()}
      aria-label="Nouveau client"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo text-white shadow-soft active:scale-90 transition-transform lg:h-10 lg:w-10"
    >
      <IconPlus size={16} strokeWidth={2} />
    </Link>
  );

  return (
    <div className="lg:h-full lg:flex lg:flex-col">
      <PageHeader
        title="Clients"
        actions={addButton}
        hideActionsOnMobile
        search={{ query, onQueryChange: setQuery, placeholder: "Nom ou téléphone…" }}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Supprimer ${selectedIds.size} client${selectedIds.size > 1 ? "s" : ""} ?`}
        description="Leurs fiches ne seront pas supprimées."
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleBulkDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      {deleteError && (
        <p role="alert" className="px-4 pt-2 text-[13px] font-semibold text-terracotta lg:px-6">
          {deleteError}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 px-4 lg:px-6 pt-2 lg:-mt-2">
        {selectMode ? (
          <>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="glass-chip flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-ink-soft shadow-soft ring-1 ring-line-strong/40 active:scale-95 transition-transform"
            >
              {allSelected ? <IconCheckSquare size={14} className="text-indigo" /> : <IconSquare size={14} />}
              Tout
            </button>
            <p className="flex-1 truncate text-center text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={selectedIds.size === 0}
                aria-label="Supprimer la sélection"
                className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-terracotta shadow-soft ring-1 ring-line-strong/40 disabled:opacity-30 active:scale-90 transition-transform"
              >
                <IconTrash size={13} />
              </button>
              <button
                type="button"
                onClick={toggleSelectMode}
                aria-label="Fermer la sélection"
                className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-ink-soft shadow-soft ring-1 ring-line-strong/40 active:scale-90 transition-transform"
              >
                <IconX size={13} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-soft">{clients.length} clients</p>
            <button
              type="button"
              onClick={toggleSelectMode}
              aria-label="Sélectionner plusieurs clients"
              className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-ink-soft shadow-soft ring-1 ring-line-strong/40 active:scale-90 transition-transform"
            >
              <IconSquare size={13} />
            </button>
          </>
        )}
      </div>

      <div className="flex-1 lg:overflow-y-auto px-2.5 lg:px-6 py-2 pb-4 pt-3">
        {filtered.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-ink-faint">
            <span className="glass-chip flex h-12 w-12 items-center justify-center rounded-full">
              <IconUsers size={22} />
            </span>
            <p className="text-sm font-semibold">Aucun client trouvé.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c, i) => {
              const clientFiches = fiches.filter((f) => f.clientId === c.id);
              const active = activeMatch?.params.id === c.id;
              const selected = selectedIds.has(c.id);
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
                    hint={i === firstCallableIndex}
                    disableSwipe={selectMode}
                    onTap={() => (selectMode ? toggleOne(c.id) : navigate(`/clients/${c.id}`))}
                  >
                    {selectMode && (
                      <span className={selected ? "flex-none text-indigo" : "flex-none text-ink-faint"}>
                        {selected ? <IconCheckSquare size={20} /> : <IconSquare size={20} />}
                      </span>
                    )}
                    <Avatar photo={c.photo} seed={c.colorSeed} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{c.name}</span>
                      <span className="mt-0.5 block text-[11.5px] text-ink-faint tabular-nums">
                        {c.phone || "Numéro non renseigné"}
                      </span>
                    </span>
                    {!selectMode && clientFiches.length > 0 && (
                      <span className="flex flex-none items-center gap-1">
                        {clientFiches.slice(0, 4).map((f) => (
                          <span
                            key={f.id}
                            className={`h-2 w-2 rounded-full ${f.late ? "bg-terracotta" : STATUS_DOT_COLOR[f.status]}`}
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

      {!selectMode && <Fab to="/clients/nouveau" label="Nouveau client" color="teal" />}
    </div>
  );
}
