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

  const modele = useModele(id ?? "");
  if (!modele) return <Navigate to="/catalogue" replace />;

  function handleDelete() {
    haptic(16);
    modeleRepository.remove(modele!.id);
    navigate("/catalogue", { replace: true });
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
            <FabricPhotos
              photos={modele.photos}
              onAdd={(dataUrl) => mediaRepository.addModelePhoto(modele.id, dataUrl)}
              onRemove={(photoId) => mediaRepository.removeModelePhoto(modele.id, photoId)}
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[13px] font-bold text-ink-soft">Patron de coupe</p>
            <FabricPhotos
              photos={modele.patronPhotos}
              onAdd={(dataUrl) => mediaRepository.addModelePatronPhoto(modele.id, dataUrl)}
              onRemove={(photoId) => mediaRepository.removeModelePatronPhoto(modele.id, photoId)}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
