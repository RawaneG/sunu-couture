import { IconHanger } from "../lib/icons";

export default function OrdersEmptyState() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-3 text-ink-faint lg:flex">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
        <IconHanger size={24} />
      </span>
      <p className="text-sm font-semibold">Sélectionnez une commande</p>
    </div>
  );
}
