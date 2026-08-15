import { IconUsers } from "../lib/icons";

export default function ClientsEmptyState() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-3 text-ink-faint lg:flex">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
        <IconUsers size={24} />
      </span>
      <p className="text-sm font-semibold">Sélectionnez un client</p>
    </div>
  );
}
