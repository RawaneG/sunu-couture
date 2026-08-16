import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../lib/store";
import Tile from "../components/ui/Tile";
import OrderRow from "../components/ui/OrderRow";
import Fab from "../components/ui/Fab";
import MobileBrandBar from "../components/layout/MobileBrandBar";
import { IconPlus, IconHanger, IconUsers, IconCheck, IconAlert, IconNotebook } from "../lib/icons";

export default function Dashboard() {
  const orders = useStore((s) => s.orders);
  const clients = useStore((s) => s.clients);
  const fiches = useStore((s) => s.fiches);

  const { late, ready } = useMemo(() => {
    return {
      late: orders.filter((o) => o.late),
      ready: orders.filter((o) => o.status === "pret"),
    };
  }, [orders]);

  return (
    <div>
      <MobileBrandBar />
      <div className="hidden lg:block px-10 pt-9 pb-2">
        <h1 className="font-display italic font-bold text-3xl text-balance">Tayo</h1>
      </div>

      <div className="px-4 lg:px-10 pt-2 lg:pt-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Tile index={0} to="/commandes/nouvelle" variant="amber" icon={<IconPlus size={24} />} label="Nouvelle commande" />
          <Tile index={1} to="/commandes" variant="indigo" icon={<IconHanger size={24} />} label="Commandes" badge={orders.length} />
          <Tile index={2} to="/clients" variant="teal" icon={<IconUsers size={24} />} label="Clients" badge={clients.length} />
          <Tile index={3} to="/carnet" variant="plum" icon={<IconNotebook size={24} />} label="Carnet de mesures" badge={fiches.length} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:mt-10">
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <header className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-terracotta-tint text-terracotta">
                <IconAlert size={14} />
              </span>
              <h2 className="font-display italic font-bold text-lg">En retard</h2>
            </header>
            {late.length === 0 ? (
              <p className="glass-card rounded-2xl px-4 py-6 text-center text-sm text-ink-faint">
                Aucune commande en retard.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {late.map((o) => (
                    <OrderRow key={o.id} order={o} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <header className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-tint text-teal">
                <IconCheck size={14} />
              </span>
              <h2 className="font-display italic font-bold text-lg">Prêt à livrer</h2>
            </header>
            {ready.length === 0 ? (
              <p className="glass-card rounded-2xl px-4 py-6 text-center text-sm text-ink-faint">
                Rien de prêt pour le moment.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {ready.map((o) => (
                    <OrderRow key={o.id} order={o} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.section>
        </div>
      </div>

      <Fab to="/commandes/nouvelle" />
    </div>
  );
}
