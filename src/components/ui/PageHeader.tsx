import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { IconBack } from "../../lib/icons";

export default function PageHeader({
  title,
  backTo,
  actions,
}: {
  title: string;
  backTo?: string;
  actions?: ReactNode;
}) {
  return (
    <>
      {/* mobile: compact sticky bar */}
      <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        {backTo && (
          <Link
            to={backTo}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-2 text-ink"
            aria-label="Retour"
          >
            <IconBack size={16} />
          </Link>
        )}
        <span className="flex-1 truncate text-[15px] font-bold">{title}</span>
        {actions}
      </div>
      {/* desktop: editorial page title */}
      <div className="hidden lg:flex items-center justify-between px-10 pt-9 pb-2">
        <h1 className="font-display italic font-bold text-3xl text-ink text-balance">{title}</h1>
        {actions}
      </div>
    </>
  );
}
