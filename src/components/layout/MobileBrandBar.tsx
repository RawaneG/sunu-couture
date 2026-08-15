import { IconMoon, IconScissors, IconSun } from "../../lib/icons";
import { useTheme } from "../../lib/theme";

export default function MobileBrandBar() {
  const { dark, toggle } = useTheme();
  return (
    <div className="flex items-center gap-2.5 px-4 pt-5 pb-3 lg:hidden">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-indigo text-amber-tile">
        <IconScissors size={15} />
      </span>
      <span className="flex-1 font-display italic font-bold text-lg leading-none">Sunu Couture</span>
      <button
        type="button"
        onClick={toggle}
        aria-label="Changer de thème"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-ink-soft"
      >
        {dark ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>
    </div>
  );
}
