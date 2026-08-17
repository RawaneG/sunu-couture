import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import clsx from "clsx";
import { useStore } from "../lib/store";
import Avatar from "../components/ui/Avatar";
import PageHeader from "../components/ui/PageHeader";
import MobileBrandBar from "../components/layout/MobileBrandBar";
import { IconBack, IconChevronRight, IconMic, IconNotebook, IconPhone, IconPlus, IconSwipe } from "../lib/icons";
import { matchesQuery } from "../lib/search";
import { haptic } from "../lib/haptics";
import { hasSeenCarnetPageHint, markCarnetPageHintSeen } from "../lib/onboarding";
import type { Fiche } from "../lib/types";

const ROW_HEIGHT = 64;
const ROW_GAP = 8;
const CARD_CHROME = 92; // header row + card padding + page-dots row, reserved inside the card
const MOBILE_BOTTOM_RESERVE = 128; // bottom tab bar + FAB clearance + safe margin
const DESKTOP_BOTTOM_RESERVE = 32;
const MIN_PAGE_SIZE = 3;
const SWIPE_THRESHOLD = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 36 : -36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -36 : 36, opacity: 0 }),
};

export default function CarnetList() {
  const fiches = useStore((s) => s.fiches);
  const clients = useStore((s) => s.clients);
  const addFiche = useStore((s) => s.addFiche);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [pageSize, setPageSize] = useState(8);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const activeCarnet = useMemo(() => fiches.reduce((max, f) => Math.max(max, f.carnetNumero), 0) || 1, [fiches]);
  const carnetCount = activeCarnet;
  const searching = query.trim().length > 0;

  const clientFieldsFor = (f: Fiche) => {
    const client = f.clientId ? clients.find((c) => c.id === f.clientId) : undefined;
    return {
      name: [f.prenom, f.nom].filter(Boolean).join(" ") || client?.name || "",
      phone: f.telephone || client?.phone || "",
    };
  };

  const filtered = fiches.filter((f) => {
    if (!searching && f.carnetNumero !== activeCarnet) return false;
    const { name, phone } = clientFieldsFor(f);
    return matchesQuery(query, name, phone, f.numero, f.garment);
  });
  const pages = chunk(filtered, pageSize);
  const pageCount = pages.length;
  const paginated = pageCount > 1;
  const currentPage = pageCount === 0 ? 0 : Math.min(pageIndex, pageCount - 1);

  useLayoutEffect(() => {
    function recomputePageSize() {
      const top = cardRef.current?.getBoundingClientRect().top ?? 0;
      const bottomReserve = window.innerWidth < 1024 ? MOBILE_BOTTOM_RESERVE : DESKTOP_BOTTOM_RESERVE;
      const usable = window.innerHeight - top - bottomReserve - CARD_CHROME;
      const rows = Math.floor((usable + ROW_GAP) / (ROW_HEIGHT + ROW_GAP));
      setPageSize(Math.max(MIN_PAGE_SIZE, rows));
    }
    recomputePageSize();
    window.addEventListener("resize", recomputePageSize);
    return () => window.removeEventListener("resize", recomputePageSize);
  }, []);

  useEffect(() => {
    setDirection(0);
    setPageIndex(0);
  }, [query]);

  useEffect(() => {
    if (!paginated || hasSeenCarnetPageHint()) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        haptic();
        setShowSwipeHint(true);
        timers.push(
          window.setTimeout(() => {
            setShowSwipeHint(false);
            markCarnetPageHintSeen();
          }, 2200)
        );
      }, 600)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Runs once when pagination first becomes active — re-running on every page
    // change would replay the coach mark mid-navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginated]);

  function goTo(target: number) {
    const clamped = Math.max(0, Math.min(target, pageCount - 1));
    if (clamped === currentPage) return;
    haptic();
    setDirection(clamped > currentPage ? 1 : -1);
    setPageIndex(clamped);
  }

  function handleAdd() {
    haptic(16);
    const id = addFiche();
    navigate(`/carnet/${id}`);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_THRESHOLD) goTo(currentPage + 1);
    else if (info.offset.x > SWIPE_THRESHOLD) goTo(currentPage - 1);
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
      <MobileBrandBar />
      <PageHeader
        title={searching ? "Carnet de mesures" : `Carnet n° ${activeCarnet}`}
        actions={addButton}
        hideActionsOnMobile
        search={{ query, onQueryChange: setQuery, placeholder: "Nom, téléphone ou n° de fiche…" }}
      />

      <div className="px-4 lg:px-10 py-2 lg:py-4 max-w-3xl lg:mx-auto">
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
        ) : filtered.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-ink-faint">
            <span className="glass-chip flex h-14 w-14 items-center justify-center rounded-full">
              <IconNotebook size={24} />
            </span>
            <p className="text-sm font-semibold">Aucune fiche trouvée.</p>
          </div>
        ) : (
          <div ref={cardRef} className="glass-edge relative overflow-hidden rounded-2xl p-3">
            {(paginated || (!searching && carnetCount > 1)) && (
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                  {searching ? `${filtered.length} résultat${filtered.length > 1 ? "s" : ""}` : `Page ${currentPage + 1} / ${pageCount}`}
                </p>
                {paginated && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => goTo(currentPage - 1)}
                      disabled={currentPage === 0}
                      aria-label="Page précédente"
                      className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-ink-soft shadow-soft ring-1 ring-line-strong/40 disabled:opacity-30 active:scale-90 transition-transform"
                    >
                      <IconBack size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(currentPage + 1)}
                      disabled={currentPage === pageCount - 1}
                      aria-label="Page suivante"
                      className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-ink-soft shadow-soft ring-1 ring-line-strong/40 disabled:opacity-30 active:scale-90 transition-transform"
                    >
                      <IconChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={currentPage}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                  drag={paginated ? "x" : false}
                  dragDirectionLock
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.35}
                  dragMomentum={false}
                  onDragEnd={handleDragEnd}
                  className="flex flex-col gap-2"
                >
                  {pages[currentPage]?.map((f) => (
                    <FicheRow key={f.id} fiche={f} clientName={clientFieldsFor(f).name} onOpen={() => navigate(`/carnet/${f.id}`)} />
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>

            {paginated && pageCount <= 12 && (
              <div className="mt-3 flex items-center justify-center">
                <div className="glass-chip flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-soft ring-1 ring-line-strong/40">
                  {pages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={`Aller à la page ${i + 1}`}
                      aria-current={i === currentPage}
                      className={clsx(
                        "h-1.5 rounded-full transition-all",
                        i === currentPage ? "w-4 bg-indigo" : "w-1.5 bg-line-strong"
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence>
              {showSwipeHint && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center"
                >
                  <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-3.5 py-2 text-[12px] font-bold text-paper shadow-lift">
                    <motion.span
                      animate={{ x: [0, 7, 0] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                      className="flex items-center"
                    >
                      <IconSwipe size={16} strokeWidth={2.2} />
                    </motion.span>
                    Glissez pour changer de page
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <motion.button
        type="button"
        onClick={handleAdd}
        aria-label="Nouvelle fiche"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-soft to-indigo text-white shadow-lift shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] ring-1 ring-black/5 lg:hidden"
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

function FicheRow({ fiche, clientName, onOpen }: { fiche: Fiche; clientName: string; onOpen: () => void }) {
  const client = useStore((s) => (fiche.clientId ? s.getClient(fiche.clientId) : undefined));
  const digits = (fiche.telephone || client?.phone || "").replace(/\s/g, "");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        haptic();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          haptic();
          onOpen();
        }
      }}
      className={clsx(
        "glass-chip flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-3 active:scale-[0.98]",
        fiche.cancelledAt && "opacity-50"
      )}
    >
      <Avatar photo={client?.photo ?? fiche.tissuPhotos[0]?.dataUrl ?? null} seed={client?.colorSeed ?? "grey"} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
          Fiche n° {fiche.numero}
          {fiche.voiceNote && <IconMic size={10} className="flex-none text-indigo" />}
          {fiche.cancelledAt && "· Annulée"}
        </span>
        <span className="mt-0.5 block truncate text-[13.5px] font-bold">{clientName || "Sans nom"}</span>
      </span>
      {digits && (
        <a
          href={`tel:${digits}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Appeler ${clientName || "ce client"}`}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-teal text-white active:scale-90 transition-transform"
        >
          <IconPhone size={13} />
        </a>
      )}
    </div>
  );
}
