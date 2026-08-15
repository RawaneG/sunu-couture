import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import Avatar from "../components/ui/Avatar";
import OrderRow from "../components/ui/OrderRow";
import MeasurementsInput from "../components/ui/MeasurementsInput";
import { IconPhone } from "../lib/icons";

export default function ClientDetail() {
  const { id } = useParams();
  const clients = useStore((s) => s.clients);
  const allOrders = useStore((s) => s.orders);
  const setClientNote = useStore((s) => s.setClientNote);
  const setClientText = useStore((s) => s.setClientText);

  const client = clients.find((c) => c.id === id);
  const orders = useMemo(() => allOrders.filter((o) => o.clientId === id), [allOrders, id]);

  if (!client) return <Navigate to="/clients" replace />;

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

        <div className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Mesures</p>
          <MeasurementsInput
            voiceValue={client.measurementsNote ?? null}
            onVoiceChange={(note) => setClientNote(client.id, note)}
            textValue={client.measurementsText ?? ""}
            onTextChange={(text) => setClientText(client.id, text || null)}
            label="mesures du client"
          />
        </div>

        <div className="mt-7">
          <h2 className="mb-2 font-display italic font-bold text-base">
            {orders.length > 0 ? `${orders.length} commande${orders.length > 1 ? "s" : ""}` : "Aucune commande"}
          </h2>
          {orders.length > 0 && (
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {orders.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
