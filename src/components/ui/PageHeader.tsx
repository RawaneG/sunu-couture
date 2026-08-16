import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { IconBack, IconSearch, IconX } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

interface SearchBundle {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
}

export default function PageHeader({
  title,
  backTo,
  actions,
  search,
  hideActionsOnMobile = false,
}: {
  title: string;
  backTo?: string;
  actions?: ReactNode;
  search?: SearchBundle;
  hideActionsOnMobile?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeSearch = () => {
    haptic();
    setSearchOpen(false);
    search?.onQueryChange("");
  };

  return (
    <>
      {/* mobile: compact sticky glass bar */}
      <div
        className={clsx(
          "sticky top-0 z-20 backdrop-saturate-150 transition-[backdrop-filter,background-color] duration-300 lg:hidden",
          scrolled ? "bg-surface/92 backdrop-blur-xl" : "bg-surface/70 backdrop-blur-md"
        )}
      >
        <div
          className={clsx(
            "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-line-strong transition-opacity duration-300",
            scrolled ? "opacity-100" : "opacity-0"
          )}
        />
        <div className="flex items-center gap-2.5 px-4 py-3">
          {searchOpen && search ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="glass-input flex flex-1 items-center gap-2 rounded-full px-3.5 py-2"
            >
              <IconSearch size={15} className="flex-none text-ink-faint" />
              <input
                autoFocus
                value={search.query}
                onChange={(e) => search.onQueryChange(e.target.value)}
                placeholder={search.placeholder}
                className="w-full min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:text-ink-faint placeholder:font-normal"
              />
              <button type="button" onClick={closeSearch} aria-label="Fermer la recherche" className="flex-none text-ink-faint">
                <IconX size={15} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 items-center gap-2.5 min-w-0"
            >
              {backTo && (
                <Link
                  to={backTo}
                  className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-ink shadow-soft ring-1 ring-line-strong/40 active:scale-90 transition-transform"
                  aria-label="Retour"
                >
                  <IconBack size={16} />
                </Link>
              )}
              <span className="flex-1 truncate text-[15px] font-bold">{title}</span>
            </motion.div>
          )}

          {!searchOpen && search && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => {
                haptic();
                setSearchOpen(true);
              }}
              aria-label="Rechercher"
              className="glass-chip flex h-8 w-8 flex-none items-center justify-center rounded-full text-ink-soft shadow-soft ring-1 ring-line-strong/40"
            >
              <IconSearch size={15} />
            </motion.button>
          )}
          {!searchOpen && !hideActionsOnMobile && actions}
        </div>
      </div>

      {/* desktop: editorial page title */}
      <div className="hidden lg:flex lg:flex-col gap-3 px-6 pt-9 pb-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="min-w-0 flex-1 font-display italic font-bold text-3xl text-ink text-balance">{title}</h1>
          {actions && <div className="flex flex-none items-center gap-2.5">{actions}</div>}
        </div>
        {search && (
          <label className="glass-input flex w-full items-center gap-2 rounded-full px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-indigo">
            <IconSearch size={14} className="flex-none text-ink-faint" />
            <input
              value={search.query}
              onChange={(e) => search.onQueryChange(e.target.value)}
              placeholder={search.placeholder}
              className="w-full min-w-0 bg-transparent text-[13px] font-semibold outline-none placeholder:text-ink-faint placeholder:font-normal"
            />
            {search.query && (
              <button type="button" onClick={() => search.onQueryChange("")} aria-label="Effacer" className="flex-none text-ink-faint">
                <IconX size={13} />
              </button>
            )}
          </label>
        )}
      </div>
    </>
  );
}
