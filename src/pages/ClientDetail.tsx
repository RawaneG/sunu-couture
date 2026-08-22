import { useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import Avatar from "../components/ui/Avatar";
import OrderRow from "../components/ui/OrderRow";
import { IconPhone, IconPlus } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { FICHE_MESURE_KEYS } from "../lib/types";

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const clients = useStore((s) => s.clients);
  const allFiches = useStore((s) => s.fiches);
  const addFiche = useStore((s) => s.addFiche);

  const client = clients.find((c) => c.id === id);
  const fiches = useMemo(
    () => allFiches.filter((f) => f.clientId === id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [allFiches, id]
  );

  if (!client) return <Navigate to="/clients" replace />;

  function handleNewFiche() {
    haptic(16);
    const lastFiche = fiches[0];
    const prefillChamps = lastFiche
      ? Object.fromEntries(FICHE_MESURE_KEYS.map((key) => [key, lastFiche.champs[key].valeur]))
      : undefined;
    const [prenom, ...rest] = client!.name.trim().split(/\s+/);
    const newId = addFiche({
      clientId: client!.id,
      prenom: prenom ?? "",
      nom: rest.join(" "),
      telephone: client!.phone,
      prefillChamps,
    });
    navigate(`/carnet/${newId}`);
  }

  return (
    <div>
      <PageHeader title={client.name} backTo="/clients" />

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

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleNewFiche}
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
