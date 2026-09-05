import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useModeles } from "../repositories/hooks";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import ModeleGrid from "../components/ui/ModeleGrid";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { IconPlus, IconScissors } from "../lib/icons";
import { haptic } from "../lib/haptics";

export default function Catalogue() {
  const modeles = useModeles();
  const { modeles: modeleRepository } = useRepositories();
  const navigate = useNavigate();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleAdd() {
    haptic(16);
    navigate("/catalogue/nouveau");
  }

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
    const allSelected = modeles.length > 0 && modeles.every((m) => selectedIds.has(m.id));
    setSelectedIds(allSelected ? new Set() : new Set(modeles.map((m) => m.id)));
  }

  async function handleBulkDelete() {
    haptic(16);
    setConfirmDeleteOpen(false);
    try {
      await modeleRepository.removeMany([...selectedIds]);
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch {
      setDeleteError("La suppression a échoué. Réessaie.");
    }
  }

  const addButton = (
    <button
      type="button"
      onClick={handleAdd}
      aria-label="Nouveau modèle"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo text-white shadow-soft active:scale-90 transition-transform lg:h-10 lg:w-10"
    >
      <IconPlus size={16} strokeWidth={2} />
    </button>
  );

  return (
    <div>
      <PageHeader title="Catalogue" actions={addButton} hideActionsOnMobile />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Supprimer ${selectedIds.size} modèle${selectedIds.size > 1 ? "s" : ""} ?`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleBulkDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      {deleteError && (
        <p role="alert" className="px-4 pt-2 text-[13px] font-semibold text-terracotta lg:px-10">
          {deleteError}
        </p>
      )}

      <div className="px-4 lg:px-10 py-2 lg:py-4 max-w-3xl lg:mx-auto">
        {modeles.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-ink-faint">
            <span className="glass-chip flex h-14 w-14 items-center justify-center rounded-full">
              <IconScissors size={24} />
            </span>
            <p className="text-sm font-semibold">Le catalogue est vide.</p>
            <button
              type="button"
              onClick={handleAdd}
              className="mt-1 rounded-full bg-amber-tile px-4 py-2.5 text-[13px] font-bold text-[#2a1c04] shadow-soft"
            >
              Ajouter un modèle
            </button>
          </div>
        ) : (
          <div className="glass-edge rounded-2xl p-3">
            <ModeleGrid
              modeles={modeles}
              onSelect={(m) => navigate(`/catalogue/${m.id}`)}
              onAddNew={handleAdd}
              fillHeight
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleOne}
              onToggleSelectMode={toggleSelectMode}
              onToggleSelectAll={toggleSelectAll}
              onDeleteSelected={() => setConfirmDeleteOpen(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
