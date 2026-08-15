import { useState } from "react";
import { motion, useDragControls } from "framer-motion";
import { useStore } from "../../lib/store";
import { matchesQuery } from "../../lib/search";
import Avatar from "./Avatar";
import ClientFields from "./ClientFields";
import { IconCheck, IconPlus, IconSearch, IconUsers, IconX } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

export default function ClientPickerSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (clientId: string) => void;
}) {
  const clients = useStore((s) => s.clients);
  const addClient = useStore((s) => s.addClient);
  const dragControls = useDragControls();

  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "new">("list");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const filtered = clients.filter((c) => matchesQuery(query, c.name, c.phone));

  function reset() {
    setQuery("");
    setView("list");
    setNewPhoto(null);
    setNewName("");
    setNewPhone("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSelect(id: string) {
    reset();
    onSelect(id);
  }

  function handleCreate() {
    if (!newName.trim()) return;
    const id = addClient({ name: newName, phone: newPhone, photo: newPhoto });
    handleSelect(id);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.65 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) handleClose();
            }}
            className="relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-3xl border border-line-strong/30 bg-surface/85 shadow-lift backdrop-blur-2xl backdrop-saturate-150 lg:max-h-[640px] lg:w-[420px] lg:rounded-3xl"
          >
            <div
              className="mx-auto mb-1 mt-2 h-1.5 w-10 flex-none touch-none rounded-full bg-line-strong lg:hidden"
              onPointerDown={(e) => {
                haptic();
                dragControls.start(e);
              }}
            />
            {view === "list" ? (
              <>
                <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
                  <p className="flex-1 font-display italic font-bold text-lg">Choisir un client</p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-2 text-ink-faint"
                    aria-label="Fermer"
                  >
                    <IconX size={15} />
                  </button>
                </div>

                <div className="px-5 pb-3">
                  <label className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                    <IconSearch size={15} className="flex-none text-ink-faint" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Rechercher un client"
                      className="w-full min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:text-ink-faint placeholder:font-normal"
                    />
                  </label>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    haptic();
                    setView("new");
                  }}
                  className="mx-5 mb-2 flex items-center gap-3 rounded-2xl bg-indigo-tint px-3.5 py-2.5 text-left"
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-indigo text-white">
                    <IconPlus size={16} />
                  </span>
                  <span className="text-[13.5px] font-bold text-indigo">Nouveau client</span>
                </motion.button>

                <div className="flex-1 overflow-y-auto px-2.5 pb-4">
                  {filtered.length === 0 ? (
                    <div className="mt-8 flex flex-col items-center gap-2 text-ink-faint">
                      <IconUsers size={22} />
                      <p className="text-sm font-semibold">Aucun client trouvé</p>
                    </div>
                  ) : (
                    filtered.map((c) => (
                      <motion.button
                        key={c.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          haptic();
                          handleSelect(c.id);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left hover:bg-surface-2 active:bg-surface-2 transition-colors"
                      >
                        <Avatar photo={c.photo} seed={c.colorSeed} size={42} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-bold">{c.name}</span>
                          <span className="block text-[11.5px] text-ink-faint tabular-nums">
                            {c.phone || "Numéro non renseigné"}
                          </span>
                        </span>
                      </motion.button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-2 text-ink"
                    aria-label="Retour"
                  >
                    <IconX size={15} />
                  </button>
                  <p className="flex-1 font-display italic font-bold text-lg">Nouveau client</p>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-4">
                  <ClientFields
                    photo={newPhoto}
                    onPhotoChange={setNewPhoto}
                    name={newName}
                    onNameChange={setNewName}
                    phone={newPhone}
                    onPhoneChange={setNewPhone}
                    autoFocusName
                  />
                </div>

                <div className="px-5 pb-5 pt-2">
                  <motion.button
                    type="button"
                    whileTap={newName.trim() ? { scale: 0.97 } : undefined}
                    disabled={!newName.trim()}
                    onClick={() => {
                      haptic(14);
                      handleCreate();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-tile px-4 py-3.5 font-bold text-[#2a1c04] shadow-soft disabled:bg-surface-3 disabled:text-ink-faint"
                  >
                    <IconCheck size={17} strokeWidth={2} />
                    Ajouter et sélectionner
                  </motion.button>
                </div>
              </>
            )}
      </motion.div>
    </div>
  );
}
