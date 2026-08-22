import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import clsx from "clsx";
import {
  IconBack,
  IconCheckSquare,
  IconChevronRight,
  IconPlus,
  IconScissors,
  IconSquare,
  IconTrash,
  IconX,
} from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import type { Modele } from "../../lib/types";

const COLUMNS_MOBILE = 3;
const COLUMNS_DESKTOP = 4;
const FIXED_ROWS_PER_PAGE = 2;
const GRID_GAP = 8; // px — matches the grid's gap-2
const GRID_CHROME = 76; // px reserved for the page-indicator row + dots row, when fillHeight measures from the grid's own top
const MOBILE_BOTTOM_RESERVE = 116; // bottom tab bar clearance
const DESKTOP_BOTTOM_RESERVE = 32;
const MIN_ROWS = 2;
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

/**
 * Photo-only grid of modèles, paged and swiped exactly like the carnet's fiche
 * list — once a page of tiles is full, the tailor slides to see more.
 */
type Cell = { kind: "modele"; modele: Modele } | { kind: "add" };

export default function ModeleGrid({
  modeles,
  onSelect,
  onAddNew,
  fillHeight = false,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectMode,
  onToggleSelectAll,
  onDeleteSelected,
}: {
  modeles: Modele[];
  onSelect: (modele: Modele) => void;
  onAddNew?: () => void;
  /** Grow each page to reach the bottom of the viewport instead of stopping after a fixed row count. */
  fillHeight?: boolean;
  /** Bulk-select mode — tapping a tile toggles selection instead of opening it. Omit all of these to keep the grid a plain picker (e.g. inside ModelePickerSheet). */
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectMode?: () => void;
  onToggleSelectAll?: () => void;
  onDeleteSelected?: () => void;
}) {
  const [columns, setColumns] = useState(COLUMNS_MOBILE);
  const [rowsPerPage, setRowsPerPage] = useState(FIXED_ROWS_PER_PAGE);
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function recomputeColumns() {
      setColumns(window.innerWidth >= 1024 ? COLUMNS_DESKTOP : COLUMNS_MOBILE);
    }
    recomputeColumns();
    window.addEventListener("resize", recomputeColumns);
    return () => window.removeEventListener("resize", recomputeColumns);
  }, []);

  useLayoutEffect(() => {
    if (!fillHeight) return;
    function recomputeRows() {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const tileWidth = (rect.width - GRID_GAP * (columns - 1)) / columns;
      const bottomReserve = window.innerWidth < 1024 ? MOBILE_BOTTOM_RESERVE : DESKTOP_BOTTOM_RESERVE;
      const usable = window.innerHeight - rect.top - GRID_CHROME - bottomReserve;
      const rows = Math.floor((usable + GRID_GAP) / (tileWidth + GRID_GAP));
      setRowsPerPage(Math.max(MIN_ROWS, rows));
    }
    recomputeRows();
    window.addEventListener("resize", recomputeRows);
    return () => window.removeEventListener("resize", recomputeRows);
  }, [fillHeight, columns]);

  // The "add" tile is appended last so it always lands at the very end of the
  // very last page, never in the middle of the grid. Hidden while selecting —
  // adding and bulk-deleting don't mix.
  const cells: Cell[] = [
    ...modeles.map((modele): Cell => ({ kind: "modele", modele })),
    ...(onAddNew && !selectMode ? [{ kind: "add" } as const] : []),
  ];

  const allSelected = modeles.length > 0 && modeles.every((m) => selectedIds?.has(m.id));

  const pageSize = columns * rowsPerPage;
  const pages = chunk(cells, pageSize);
  const pageCount = pages.length;
  const paginated = pageCount > 1;
  const currentPage = pageCount === 0 ? 0 : Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    setDirection(0);
    setPageIndex(0);
    // Runs when the catalogue's size changes (a modèle added/removed) — jumping
    // back to page 1 avoids landing on a now out-of-range page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeles.length]);

  function goTo(target: number) {
    const clamped = Math.max(0, Math.min(target, pageCount - 1));
    if (clamped === currentPage) return;
    haptic();
    setDirection(clamped > currentPage ? 1 : -1);
    setPageIndex(clamped);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_THRESHOLD) goTo(currentPage + 1);
    else if (info.offset.x > SWIPE_THRESHOLD) goTo(currentPage - 1);
  }

  return (
    <div ref={gridRef}>
      {(paginated || onToggleSelectMode) && (
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          {selectMode ? (
            <>
              <button
                type="button"
                onClick={onToggleSelectAll}
                className="glass-chip flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-ink-soft shadow-soft ring-1 ring-line-strong/40 active:scale-95 transition-transform"
              >
                {allSelected ? <IconCheckSquare size={14} className="text-indigo" /> : <IconSquare size={14} />}
                Tout
              </button>
              <p className="flex-1 truncate text-center text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                {selectedIds?.size ?? 0} sélectionné{(selectedIds?.size ?? 0) > 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onDeleteSelected}
                  disabled={!selectedIds?.size}
                  aria-label="Supprimer la sélection"
                  className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-terracotta shadow-soft ring-1 ring-line-strong/40 disabled:opacity-30 active:scale-90 transition-transform"
                >
                  <IconTrash size={13} />
                </button>
                <button
                  type="button"
                  onClick={onToggleSelectMode}
                  aria-label="Fermer la sélection"
                  className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-ink-soft shadow-soft ring-1 ring-line-strong/40 active:scale-90 transition-transform"
                >
                  <IconX size={13} />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                {paginated ? `Page ${currentPage + 1} / ${pageCount}` : ""}
              </p>
              <div className="flex items-center gap-1.5">
                {paginated && (
                  <>
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
                  </>
                )}
                {onToggleSelectMode && (
                  <button
                    type="button"
                    onClick={onToggleSelectMode}
                    aria-label="Sélectionner plusieurs modèles"
                    className="glass-chip flex h-7 w-7 items-center justify-center rounded-full text-ink-soft shadow-soft ring-1 ring-line-strong/40 active:scale-90 transition-transform"
                  >
                    <IconSquare size={13} />
                  </button>
                )}
              </div>
            </>
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
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {pages[currentPage]?.map((cell, i) =>
              cell.kind === "modele" ? (
                <ModeleCard
                  key={cell.modele.id}
                  modele={cell.modele}
                  selectMode={selectMode}
                  selected={selectedIds?.has(cell.modele.id) ?? false}
                  onClick={() => (selectMode ? onToggleSelect?.(cell.modele.id) : onSelect(cell.modele))}
                />
              ) : (
                <AddTile key={`add-${i}`} onClick={onAddNew!} />
              )
            )}
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
    </div>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={() => {
        haptic();
        onClick();
      }}
      className="glass-chip flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-ink-faint"
    >
      <IconPlus size={20} />
      <span className="text-[10px] font-bold">Nouveau</span>
    </motion.button>
  );
}

function ModeleCard({
  modele,
  selectMode,
  selected,
  onClick,
}: {
  modele: Modele;
  selectMode: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const cover = modele.photos[0]?.dataUrl;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        haptic();
        onClick();
      }}
      className={clsx(
        "glass-card relative aspect-square w-full overflow-hidden rounded-2xl",
        selectMode && selected && "ring-2 ring-indigo"
      )}
    >
      {cover ? (
        <img src={cover} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-ink-faint">
          <IconScissors size={22} />
        </span>
      )}
      {selectMode ? (
        <span
          className={clsx(
            "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full backdrop-blur-md",
            selected ? "bg-indigo text-white" : "bg-black/45 text-white"
          )}
        >
          {selected ? <IconCheckSquare size={14} /> : <IconSquare size={14} />}
        </span>
      ) : (
        modele.patronPhotos.length > 0 && (
          <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
            <IconScissors size={10} />
            {modele.patronPhotos.length}
          </span>
        )
      )}
    </motion.button>
  );
}
