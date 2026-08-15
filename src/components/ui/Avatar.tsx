import clsx from "clsx";
import { IconUser } from "../../lib/icons";

const SEED_BG: Record<string, string> = {
  indigo: "bg-indigo",
  terracotta: "bg-terracotta",
  teal: "bg-teal",
  grey: "bg-grey-status",
  amber: "bg-amber-tile",
};

export default function Avatar({
  photo,
  seed = "indigo",
  size = 40,
  className,
}: {
  photo?: string | null;
  seed?: string;
  size?: number;
  className?: string;
}) {
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={clsx("rounded-full object-cover flex-none", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={clsx(
        "rounded-full flex-none flex items-center justify-center text-white",
        SEED_BG[seed] ?? "bg-indigo",
        className
      )}
      style={{ width: size, height: size }}
    >
      <IconUser size={size * 0.46} strokeWidth={1.7} />
    </span>
  );
}
