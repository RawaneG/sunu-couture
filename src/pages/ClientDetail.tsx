import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useClient, useFiches } from "../repositories/hooks";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import Avatar from "../components/ui/Avatar";
import OrderRow from "../components/ui/OrderRow";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { IconPhone, IconPlus, IconTrash } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { FICHE_MESURE_KEYS } from "../lib/types";

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const allFiches = useFiches();
  const { fiches: ficheRepository, clients: clientRepository } = useRepositories();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [ficheError, setFicheError] = useState<string | null>(null);

  // `useClient` (pas `useClients().find(...)`) : seul ce hook distingue
  // "pas encore hydraté" (loading) de "hydraté et absent" (ready + undefined)
  // — voir FicheDetail.tsx pour le même contrat (corr. R, Phase 7A §19/§20).
  const clientState = useClient(id ?? "");
  const fiches = useMemo(
    () => allFiches.filter((f) => f.clientId === id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [allFiches, id]
  );

  if (clientState.status === "loading") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-ink-soft">Chargement du client…</p>
      </div>
    );
  }
  if (clientState.status === "error") {
    return (
      <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-terracotta">
          Le client n'a pas pu être chargé. Vérifie ta connexion et réessaie.
        </p>
      </div>
    );
  }
  // Ici, et seulement ici (status === "ready"), `undefined` signifie
  // réellement "introuvable" — jamais pendant un chargement en cours.
  const client = clientState.data;
  if (!client) return <Navigate to="/clients" replace />;

  // Expressions `const` (pas des déclarations `function`) : nécessaire pour
  // que TypeScript conserve le rétrécissement de `client` (non-`undefined`,
  // vérifié juste au-dessus) à l'intérieur de ces fermetures — voir la même
  // remarque dans FicheDetail.tsx.
  const handleDelete = async () => {
    if (deleting) return;
    haptic(16);
    setDeleting(true);
    setDeleteError(null);
    try {
      await clientRepository.remove(client.id);
      navigate("/clients", { replace: true });
    } catch {
      setDeleteError("La suppression a échoué. Réessaie.");
      setDeleting(false);
    }
  };

  // Sémantique de création inchangée pendant ce hotfix (prefillChamps/
  // clientId/nom/prenom/telephone identiques) — seule la signature devient
  // asynchrone (Promise<string> depuis la Phase 7A). La suppression de la
  // création immédiate d'une fiche vide appartient à la Phase 9A, pas ici.
  const handleNewFiche = async () => {
    haptic(16);
    setFicheError(null);
    const lastFiche = fiches[0];
    const prefillChamps = lastFiche
      ? Object.fromEntries(FICHE_MESURE_KEYS.map((key) => [key, lastFiche.champs[key].valeur]))
      : undefined;
    const [prenom, ...rest] = client.name.trim().split(/\s+/);
    try {
      const newId = await ficheRepository.add({
        clientId: client.id,
        prenom: prenom ?? "",
        nom: rest.join(" "),
        telephone: client.phone,
        prefillChamps,
      });
      navigate(`/carnet/${newId}`);
    } catch {
      setFicheError("La fiche n'a pas pu être créée. Réessaie.");
    }
  };

  const headerActions = (
    <button
      type="button"
      onClick={() => {
        haptic();
        setConfirmDeleteOpen(true);
      }}
      aria-label="Supprimer le client"
      className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-terracotta shadow-soft ring-1 ring-line-strong/40 lg:h-10 lg:w-10"
    >
      <IconTrash size={15} />
    </button>
  );

  return (
    <div>
      <PageHeader title={client.name} backTo="/clients" actions={headerActions} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Supprimer ${client.name} ?`}
        description="Ses fiches ne seront pas supprimées."
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      {deleteError && (
        <p role="alert" className="px-4 pt-2 text-[13px] font-semibold text-terracotta lg:px-10">
          {deleteError}
        </p>
      )}

      <motion.div
        key={client.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-6 max-w-2xl"
      >
        <div className="flex items-center gap-4">
          <Avatar photo={client.photo} seed={client.colorSeed} size={72} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">{client.name}</p>
            <p className="text-[13px] text-ink-faint tabular-nums">{client.phone || "Numéro non renseigné"}</p>
          </div>
          {client.phone && (
            <a
              href={`tel:${client.phone.replace(/\s/g, "")}`}
              className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-teal text-white shadow-soft"
              aria-label={`Appeler ${client.name}`}
            >
              <IconPhone size={19} />
            </a>
          )}
        </div>

        {ficheError && (
          <p role="alert" className="mt-3 text-[13px] font-semibold text-terracotta">
            {ficheError}
          </p>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => void handleNewFiche()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-tile px-4 py-3.5 font-bold text-[#2a1c04] shadow-soft"
        >
          <IconPlus size={17} strokeWidth={2} />
          Nouvelle fiche pour {client.name.split(" ")[0]}
        </motion.button>

        <div className="mt-7">
          <h2 className="mb-2 font-display italic font-bold text-base">
            {fiches.length > 0 ? `${fiches.length} fiche${fiches.length > 1 ? "s" : ""}` : "Aucune fiche"}
          </h2>
          {fiches.length > 0 && (
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {fiches.map((f) => (
                  <OrderRow key={f.id} fiche={f} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
