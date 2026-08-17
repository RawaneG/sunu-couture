import clsx from "clsx";
import type { Fiche } from "../../lib/types";
import { STATUS_LABEL } from "../../lib/types";

export const STATUS_DOT_COLOR: Record<string, string> = {
  recu: "bg-grey-status",
  couture: "bg-amber-tile",
  pret: "bg-teal",
  livre: "bg-indigo",
};

export default function StatusPill({ fiche, className }: { fiche: Pick<Fiche, "status" | "late">; className?: string }) {
  const late = fiche.late;
  const dotClass = late ? "bg-terracotta" : STATUS_DOT_COLOR[fiche.status];
  const label = late ? "En retard" : STATUS_LABEL[fiche.status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white",
        dotClass,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
      {label}
    </span>
  );
}
