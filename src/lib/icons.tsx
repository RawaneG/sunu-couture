import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(paths: React.ReactNode) {
  return function Icon({ size = 24, strokeWidth = 1.6, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const IconPlus = base(<path d="M12 5v14M5 12h14" />);
export const IconMinus = base(<path d="M5 12h14" />);
export const IconHanger = base(
  <>
    <path d="M12 4a2 2 0 1 1 2 2c-.6.5-1 .9-1 1.4 0 .6.6.9 1 1.1l7 3.6c1 .5 1 2-.1 2.4L12.5 18a1.5 1.5 0 0 1-1 0L3 14.5c-1.1-.4-1.1-1.9-.1-2.4l7-3.6c.4-.2 1-.5 1-1.1 0-.5-.4-.9-1-1.4" />
    <path d="M4 18.5c0 1 3.6 1.8 8 1.8s8-.8 8-1.8" />
  </>
);
export const IconUsers = base(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M15.5 5.5c1.4.3 2.5 1.5 2.5 3s-1.1 2.7-2.5 3" />
    <path d="M15 14c2.6.3 4.5 2.1 4.5 4.6" />
  </>
);
export const IconUser = base(
  <>
    <circle cx="12" cy="8.3" r="3.3" />
    <path d="M5 19.5c0-3.3 3.1-6 7-6s7 2.7 7 6" />
  </>
);
export const IconClock = base(
  <>
    <circle cx="12" cy="12" r="8.3" />
    <path d="M12 7.5V12l3 2" />
  </>
);
export const IconCamera = base(
  <>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.4" />
  </>
);
export const IconMic = base(
  <>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6" />
  </>
);
export const IconBack = base(<path d="M14.5 5.5 8 12l6.5 6.5" />);
export const IconChevronRight = base(<path d="M9.5 5.5 16 12l-6.5 6.5" />);
export const IconCheck = base(<path d="M5 12.5 9.5 17 19 6.5" strokeWidth={2} />);
export const IconPhone = base(
  <path d="M6.5 4h2.3l1.4 4.2-2 1.6a11 11 0 0 0 5.9 5.9l1.6-2 4.2 1.4v2.3c0 1-.9 1.8-1.9 1.6-8-1.4-13.7-7.1-15.1-15.1C3.7 4.9 4.5 4 6.5 4Z" />
);
export const IconPlay = base(<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />);
export const IconPause = base(
  <>
    <rect x="7" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </>
);
export const IconStop = base(<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />);
export const IconScissors = base(
  <>
    <circle cx="6.5" cy="6.5" r="2.2" />
    <circle cx="6.5" cy="17.5" r="2.2" />
    <path d="m8.3 8-.1-.1 11.8 11.6M8.2 16.1 20 4.5" />
  </>
);
export const IconSpool = base(
  <>
    <path d="M6 4h12M6 20h12" />
    <path d="M7 4c0 3-1.5 4-1.5 8s1.5 5 1.5 8M17 4c0 3 1.5 4 1.5 8s-1.5 5-1.5 8" />
  </>
);
export const IconInbox = base(
  <>
    <path d="M4 12h4.2l1.3 2.4h4.9L15.7 12H20" />
    <path d="M4.5 12 6 5.6A1.5 1.5 0 0 1 7.5 4.4h9a1.5 1.5 0 0 1 1.5 1.2L19.5 12v5.5A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5V12Z" />
  </>
);
export const IconHome = base(
  <>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v8.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V10" />
  </>
);
export const IconBell = base(
  <>
    <path d="M12 4.5c-2.5 0-4.3 2-4.3 4.5v2.6c0 1-.4 1.9-1.1 2.6l-.6.6h12l-.6-.6a3.7 3.7 0 0 1-1.1-2.6V9c0-2.5-1.8-4.5-4.3-4.5Z" />
    <path d="M10 17.5a2 2 0 0 0 4 0" />
  </>
);
export const IconImage = base(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.7" />
    <path d="m5 17 4.5-4.5L13 16l3-3 3 3" />
  </>
);
export const IconSun = base(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </>
);
export const IconMoon = base(<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />);
export const IconX = base(<path d="m6 6 12 12M18 6 6 18" />);
export const IconAlert = base(
  <>
    <path d="M10.6 4.5 2.9 18a1.5 1.5 0 0 0 1.3 2.2h15.6a1.5 1.5 0 0 0 1.3-2.2L13.4 4.5a1.5 1.5 0 0 0-2.8 0Z" />
    <path d="M12 10v4M12 17.2h.01" />
  </>
);
export const IconGarmentBoubou = base(
  <>
    <path d="M10 4a2 2 0 0 0 4 0" />
    <path d="M8.5 4 6 20.5h12L15.5 4Z" />
  </>
);
export const IconGarmentRobe = base(
  <>
    <path d="M10 4a2 2 0 0 0 4 0" />
    <path d="M9 4 8 11l-2.5 9.5h13L16 11l-1-7Z" />
  </>
);
export const IconGarmentChemise = base(
  <path d="M9 3.5 12 6l3-2.5 2.5 2.5-2.7 2V20H9.2V8L6.5 6Z" />
);
export const IconGarmentPantalon = base(
  <path d="M7 4h10l.6 16.5h-3.4L13.2 9l-1 11.5H8.4z" />
);
export const IconGarmentVeste = base(
  <path d="M8.5 4 6.2 6v14.5h4V11l1.8 3 1.8-3v9.5h4V6L15.5 4l-3.5 2.7z" />
);
export const IconGarmentJupe = base(<path d="M9 5.5h6l3 15H6Z" />);
export const IconGarmentEnsemble = base(
  <>
    <rect x="7" y="3.5" width="10" height="7.2" rx="2" />
    <rect x="7" y="13.3" width="10" height="7.2" rx="2" />
  </>
);
export const IconPencil = base(
  <path d="M15.7 4.3a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5L8.5 19.5l-4.2 1 1-4.2Z" />
);
export const IconCalendar = base(
  <>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
  </>
);
export const IconCalendarRange = base(
  <>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    <path d="M8 14h2M14 14h2M8 17h8" />
  </>
);
export const IconSearch = base(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m19.5 19.5-4.3-4.3" />
  </>
);
export const IconNotebook = base(
  <>
    <path d="M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M9 3.5v17M5 7.5h1.2M5 11.5h1.2M5 15.5h1.2" />
  </>
);
export const IconRotateCcw = base(
  <>
    <path d="M4 4.5V10h5.5" />
    <path d="M4.6 14.8a8 8 0 1 0 1.5-8.9L4 10" />
  </>
);
export const IconTrash = base(
  <>
    <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M18 7l-.7 12a2 2 0 0 1-2 1.9H8.7a2 2 0 0 1-2-1.9L6 7" />
  </>
);
