import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import Stepper from "../components/ui/Stepper";
import StatusPill from "../components/ui/StatusPill";
import VoiceNotePlayer from "../components/ui/VoiceNotePlayer";
import OrderRow from "../components/ui/OrderRow";
import Avatar from "../components/ui/Avatar";
import { IconPhone, IconCheck, IconMic } from "../lib/icons";
import { formatFCFA, formatFullDate, formatFullDateRange } from "../lib/format";
import { ORDER_STEPS, STATUS_ACTION_LABEL, STATUS_DESCRIPTION } from "../lib/types";
import { haptic } from "../lib/haptics";

export default function OrderDetail() {
  const { id } = useParams();
  const orders = useStore((s) => s.orders);
  const clients = useStore((s) => s.clients);
  const advanceOrder = useStore((s) => s.advanceOrder);

  const order = orders.find((o) => o.id === id);
  const client = order ? clients.find((c) => c.id === order.clientId) : undefined;
  const otherOrders = useMemo(
    () => (order ? orders.filter((o) => o.clientId === order.clientId && o.id !== order.id) : []),
    [orders, order]
  );

  if (!order) return <Navigate to="/commandes" replace />;

  const nextStatus = ORDER_STEPS[ORDER_STEPS.indexOf(order.status) + 1];
  const hasMeasurements = order.voiceNote || order.measurementsText;

  return (
    <div>
      <PageHeader title={order.garment} backTo="/commandes" actions={<StatusPill order={order} className="hidden sm:inline-flex" />} />

      <motion.div
        key={order.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="px-4 lg:px-10 py-4 lg:py-6 max-w-2xl"
      >
        <div
          className="relative h-40 lg:h-52 overflow-hidden rounded-2xl bg-cover bg-center"
          style={
            order.photo
              ? { backgroundImage: `url(${order.photo})` }
              : { background: `linear-gradient(135deg, ${order.fabricColor}, var(--indigo))` }
          }
        >
          {client?.phone && (
            <a
              href={`tel:${client.phone.replace(/\s/g, "")}`}
              className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-teal text-white shadow-lift"
              aria-label={`Appeler ${client.name}`}
            >
              <IconPhone size={18} />
            </a>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar photo={client?.photo} seed={client?.colorSeed} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-[15px]">{client?.name ?? "Client"}</p>
            <p className="text-[12.5px] text-ink-faint tabular-nums">{client?.phone || "Numéro non renseigné"}</p>
          </div>
          <StatusPill order={order} className="sm:hidden" />
        </div>

        <div className="glass-card mt-6 rounded-2xl bg-surface-2 px-4 py-4">
          <Stepper status={order.status} />
          <p className="mt-4 text-center text-[13px] font-semibold text-ink-soft">
            {STATUS_DESCRIPTION[order.status]}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="glass-card rounded-2xl bg-surface-2 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">Livraison</p>
            <p className="mt-0.5 text-[14px] font-extrabold leading-snug">
              {order.dueDateStart ? formatFullDateRange(order.dueDateStart, order.dueDate) : formatFullDate(order.dueDate)}
            </p>
          </div>
          <div className="glass-card rounded-2xl bg-surface-2 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">Prix</p>
            <p className="mt-0.5 text-[15px] font-extrabold tabular-nums">{formatFCFA(order.price)} FCFA</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Mesures</p>
          {order.voiceNote && <VoiceNotePlayer note={order.voiceNote} />}
          {order.measurementsText && (
            <p className={clsx("rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] font-semibold leading-relaxed", order.voiceNote && "mt-2")}>
              {order.measurementsText}
            </p>
          )}
          {!hasMeasurements && (
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-ink-faint">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface-3">
                <IconMic size={16} />
              </span>
              <span className="text-sm font-semibold">Aucune mesure enregistrée</span>
            </div>
          )}
        </div>

        <div className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            {order.status === "livre" ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-teal-tint px-4 py-3.5 font-bold text-teal"
              >
                <IconCheck size={17} strokeWidth={2} />
                Commande livrée
              </motion.div>
            ) : (
              <motion.button
                key="cta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  haptic(16);
                  advanceOrder(order.id);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal px-4 py-3.5 font-bold text-white shadow-soft"
              >
                <IconCheck size={17} strokeWidth={2} />
                {nextStatus ? STATUS_ACTION_LABEL[nextStatus] : "Étape suivante"}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {otherOrders.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 font-display italic font-bold text-base">Autres commandes de {client?.name}</h2>
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {otherOrders.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
