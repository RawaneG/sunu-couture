import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import PageHeader from "../components/ui/PageHeader";
import Avatar from "../components/ui/Avatar";
import { IconNotebook, IconPlus, IconMic, IconPhone } from "../lib/icons";
import { haptic } from "../lib/haptics";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function CarnetList() {
  const fiches = useStore((s) => s.fiches);
  const addFiche = useStore((s) => s.addFiche);
  const navigate = useNavigate();

  const pages = chunk(fiches, 4);

  function handleAdd() {
    haptic(16);
    const id = addFiche();
    navigate(`/carnet/${id}`);
  }

  const addButton = (
    <button
      type="button"
      onClick={handleAdd}
      aria-label="Nouvelle fiche"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo text-white shadow-soft active:scale-90 transition-transform lg:h-10 lg:w-10"
    >
      <IconPlus size={16} strokeWidth={2} />
    </button>
  );

  return (
    <div>
      <PageHeader title="Carnet de mesures" backTo="/" actions={addButton} />

      <div className="px-4 lg:px-10 py-4 lg:py-6 max-w-3xl lg:mx-auto">
        {fiches.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-ink-faint">
            <span className="glass-chip flex h-14 w-14 items-center justify-center rounded-full">
              <IconNotebook size={24} />
            </span>
            <p className="text-sm font-semibold">Le carnet est vide.</p>
            <button
              type="button"
              onClick={handleAdd}
              className="mt-1 rounded-full bg-amber-tile px-4 py-2.5 text-[13px] font-bold text-[#2a1c04] shadow-soft"
            >
              Ouvrir une fiche
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {pages.map((page, pageIndex) => (
              <motion.div
                key={pageIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(pageIndex * 0.04, 0.24) }}
                className="glass-card rounded-2xl p-3"
              >
                <p className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                  Page {pageIndex + 1}
                </p>
                <div className="flex flex-col gap-2">
                  {page.map((f) => {
                    const nomComplet = [f.prenom, f.nom].filter(Boolean).join(" ");
                    const fallbackPhoto = f.tissuPhotos[0]?.dataUrl ?? null;
                    const digits = (f.telephone ?? "").replace(/\s/g, "");
                    return (
                      <div
                        key={f.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          haptic();
                          navigate(`/carnet/${f.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            haptic();
                            navigate(`/carnet/${f.id}`);
                          }
                        }}
                        className="glass-chip flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-3 active:scale-[0.98]"
                      >
                        <Avatar photo={fallbackPhoto} seed="grey" size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                            Fiche n° {f.numero}
                            {f.voiceNote && <IconMic size={10} className="flex-none text-indigo" />}
                          </span>
                          <span className="mt-0.5 block truncate text-[13.5px] font-bold">{nomComplet || "Sans nom"}</span>
                        </span>
                        {digits && (
                          <a
                            href={`tel:${digits}`}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label={`Appeler ${nomComplet || "ce client"}`}
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-teal text-white active:scale-90 transition-transform"
                          >
                            <IconPhone size={13} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <motion.button
        type="button"
        onClick={handleAdd}
        aria-label="Nouvelle fiche"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-tile to-[#b87a1f] text-[#2a1c04] shadow-lift shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] ring-1 ring-black/5 lg:hidden"
        style={{ bottom: "calc(112px + env(safe-area-inset-bottom))" }}
        initial={{ opacity: 0, scale: 0.7, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 24, delay: 0.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <IconPlus size={24} strokeWidth={2.2} />
      </motion.button>
    </div>
  );
}
