import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useModele } from "../repositories/hooks";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import FabricPhotos from "../components/ui/FabricPhotos";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { IconTrash } from "../lib/icons";
import { haptic } from "../lib/haptics";

export default function ModeleDetail() {
  const { id } = useParams();
  const { media: mediaRepository, modeles: modeleRepository } = useRepositories();
  const navigate = useNavigate();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [mediaError, setMediaError] = useState<string | null>(null);

  const modele = useModele(id ?? "");
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
