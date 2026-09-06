import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useCatalogueModele } from "../repositories/hooks";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import FabricPhotos from "../components/ui/FabricPhotos";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { IconTrash } from "../lib/icons";
import { haptic } from "../lib/haptics";
import type { Modele } from "../lib/types";
import type { ModeleRepository } from "../repositories/ModeleRepository";

/** Aligné sur la contrainte SQL réelle (voir `ModeleNew.tsx`). */
function isValidNom(nom: string): boolean {
  const trimmed = nom.trim();
  return trimmed.length >= 1 && trimmed.length <= 200;
}

/** Buffer local, commit au blur/Entrée (§58) — jamais une écriture réseau à
 * chaque frappe. Règles : nom vide → jamais envoyé (reverti silencieusement) ;
 * nom inchangé → aucun appel `setNom()` ; échec réseau → ancien nom serveur
 * conservé (revert) + erreur affichée. */
function ModeleNomEditor({ modele, modeleRepository }: { modele: Modele; modeleRepository: ModeleRepository }) {
  const [draft, setDraft] = useState(modele.nom);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (!isValidNom(draft)) {
      setDraft(modele.nom); // nom vide/invalide → jamais envoyé
      return;
    }
    if (draft === modele.nom) return; // inchangé → aucun UPDATE
    setSaving(true);
    setError(null);
    try {
      await modeleRepository.setNom(modele.id, draft);
    } catch {
      setDraft(modele.nom); // échec → ancien nom serveur conservé
      setError("Le nom n'a pas pu être enregistré. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4">
      <label htmlFor="modele-nom-edit" className="sr-only">
        Nom du modèle
      </label>
      <input
        id="modele-nom-edit"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        disabled={saving}
        className="w-full rounded-2xl border border-transparent bg-transparent px-1 py-1 text-[19px] font-bold text-ink outline-none focus:border-line-strong/40 focus:bg-surface focus:px-4 focus:py-3"
      />
      {error && (
        <p role="alert" className="mt-1 text-[12.5px] font-semibold text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

export default function ModeleDetail() {
  const { id } = useParams();
  const { media: mediaRepository, modeles: modeleRepository } = useRepositories();
  const navigate = useNavigate();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [mediaError, setMediaError] = useState<string | null>(null);

  const modeleState = useCatalogueModele(id ?? "");

  if (modeleState.status === "loading") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-ink-soft">Chargement du modèle…</p>
      </div>
    );
  }
  if (modeleState.status === "error") {
    return (
      <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-terracotta">Le modèle n'a pas pu être chargé. Vérifie ta connexion et réessaie.</p>
      </div>
    );
  }
  // Ici, et seulement ici (status === "ready"), `undefined` signifie
  // réellement "introuvable" — jamais pendant un chargement en cours (§68).
  const modele = modeleState.data;
  if (!modele) return <Navigate to="/catalogue" replace />;

  async function handleDelete() {
    haptic(16);
    try {
      await modeleRepository.remove(modele!.id);
      navigate("/catalogue", { replace: true });
    } catch {
      setMediaError("La suppression a échoué. Réessaie.");
    }
  }

  async function handleAddPhoto(dataUrl: string) {
    try {
      await mediaRepository.addModelePhoto(modele!.id, dataUrl);
    } catch {
      setMediaError("La photo n'a pas pu être ajoutée. Réessaie.");
    }
  }

  async function handleRemovePhoto(photoId: string) {
    try {
      await mediaRepository.removeModelePhoto(modele!.id, photoId);
    } catch {
      setMediaError("La suppression de la photo a échoué. Réessaie.");
    }
  }

  async function handleAddPatronPhoto(dataUrl: string) {
    try {
      await mediaRepository.addModelePatronPhoto(modele!.id, dataUrl);
    } catch {
      setMediaError("La photo n'a pas pu être ajoutée. Réessaie.");
    }
  }

  async function handleRemovePatronPhoto(photoId: string) {
    try {
      await mediaRepository.removeModelePatronPhoto(modele!.id, photoId);
    } catch {
      setMediaError("La suppression de la photo a échoué. Réessaie.");
    }
  }

  const headerActions = (
    <button
      type="button"
      onClick={() => {
        haptic();
        setConfirmDeleteOpen(true);
      }}
      aria-label="Supprimer le modèle"
      className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-terracotta shadow-soft ring-1 ring-line-strong/40 lg:h-10 lg:w-10"
    >
      <IconTrash size={15} />
    </button>
  );

  return (
    <div>
      <PageHeader title="Modèle" backTo="/catalogue" actions={headerActions} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Supprimer ce modèle ?"
        description="Les photos déjà ajoutées à des fiches ne seront pas touchées."
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      {mediaError && (
        <p role="alert" className="px-4 pt-2 text-[13px] font-semibold text-terracotta lg:px-10">
          {mediaError}
        </p>
      )}

      <motion.div
        key={modele.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-8 max-w-2xl lg:mx-auto"
      >
        <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:shadow-soft lg:p-8">
          <ModeleNomEditor key={modele.id} modele={modele} modeleRepository={modeleRepository} />

          <div>
            <p className="mb-2 text-[13px] font-bold text-ink-soft">Photos du modèle</p>
            <FabricPhotos photos={modele.photos} onAdd={handleAddPhoto} onRemove={handleRemovePhoto} />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[13px] font-bold text-ink-soft">Patron de coupe</p>
            <FabricPhotos photos={modele.patronPhotos} onAdd={handleAddPatronPhoto} onRemove={handleRemovePatronPhoto} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
