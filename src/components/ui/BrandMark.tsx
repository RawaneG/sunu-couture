import { useId } from "react";

export default function BrandMark({ size = 24 }: { size?: number }) {
  const uid = useId();
  const rimGrad = `rimGrad-${uid}`;
  const faceGrad = `faceGrad-${uid}`;
  const holeGrad = `holeGrad-${uid}`;
  const softBlur = `softBlur-${uid}`;
  const btnShadow = `btnShadow-${uid}`;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={rimGrad} x1="18" y1="10" x2="82" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffe9ad" />
          <stop offset="30%" stopColor="#eab54a" />
          <stop offset="62%" stopColor="#b97a24" />
          <stop offset="100%" stopColor="#74450d" />
        </linearGradient>
        <radialGradient id={faceGrad} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#fff3d6" />
          <stop offset="48%" stopColor="#f0c15a" />
          <stop offset="100%" stopColor="#d69a34" />
        </radialGradient>
        <radialGradient id={holeGrad} cx="50%" cy="32%" r="85%">
          <stop offset="0%" stopColor="#0a0e1c" />
          <stop offset="100%" stopColor="#2d3a6b" />
        </radialGradient>
        <filter id={softBlur} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={btnShadow} x="-70%" y="-70%" width="240%" height="240%">
          <feDropShadow dx="0.5" dy="4.6" stdDeviation="4" floodColor="#000000" floodOpacity="0.42" />
        </filter>
      </defs>

      <g filter={`url(#${btnShadow})`}>
        <circle cx="50" cy="50" r="32" fill={`url(#${rimGrad})`} stroke="#5c3a0b" strokeWidth="1" strokeOpacity="0.35" />
        <path d="M21 41 A29 29 0 0 1 42 21.4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <circle cx="50" cy="50" r="24" fill={`url(#${faceGrad})`} stroke="#8a530f" strokeWidth="0.8" strokeOpacity="0.45" />

        <circle cx="41.5" cy="41.5" r="5" fill={`url(#${holeGrad})`} />
        <circle cx="58.5" cy="41.5" r="5" fill={`url(#${holeGrad})`} />
        <circle cx="41.5" cy="58.5" r="5" fill={`url(#${holeGrad})`} />
        <circle cx="58.5" cy="58.5" r="5" fill={`url(#${holeGrad})`} />
        <path d="M38.3 43.7 A5 5 0 0 0 44.7 43.7" stroke="rgba(255,255,255,0.32)" strokeWidth="1" fill="none" />
        <path d="M55.3 43.7 A5 5 0 0 0 61.7 43.7" stroke="rgba(255,255,255,0.32)" strokeWidth="1" fill="none" />
        <path d="M38.3 60.7 A5 5 0 0 0 44.7 60.7" stroke="rgba(255,255,255,0.32)" strokeWidth="1" fill="none" />
        <path d="M55.3 60.7 A5 5 0 0 0 61.7 60.7" stroke="rgba(255,255,255,0.32)" strokeWidth="1" fill="none" />

        <path d="M42 43 L58.5 59.5" stroke="rgba(0,0,0,0.3)" strokeWidth="5" strokeLinecap="round" />
        <path d="M59 43 L41.5 59.5" stroke="rgba(0,0,0,0.3)" strokeWidth="5" strokeLinecap="round" />
        <path d="M41.5 41.5 L58.5 58.5" stroke="#a8471f" strokeWidth="4.4" strokeLinecap="round" />
        <path d="M58.5 41.5 L41.5 58.5" stroke="#a8471f" strokeWidth="4.4" strokeLinecap="round" />

        <ellipse cx="38" cy="33" rx="15" ry="8.5" fill="rgba(255,255,255,0.4)" transform="rotate(-24 38 33)" filter={`url(#${softBlur})`} />
        <ellipse cx="33" cy="26" rx="3.6" ry="2" fill="rgba(255,255,255,0.75)" transform="rotate(-20 33 26)" />
      </g>
    </svg>
  );
}
