import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { IconCheck, IconX } from "../../lib/icons";

const FRAME = 260;
const OUTPUT = 480;

export default function ImageCropper({
  src,
  shape = "circle",
  onCancel,
  onConfirm,
}: {
  src: string;
  shape?: "circle" | "square";
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(null);

  const baseScale = Math.max(FRAME / natural.w, FRAME / natural.h);
  const scale = baseScale * zoom;
  const renderedW = natural.w * scale;
  const renderedH = natural.h * scale;

  function clamp(pos: { x: number; y: number }, w: number, h: number) {
    const minX = Math.min(0, FRAME - w);
    const minY = Math.min(0, FRAME - h);
    return { x: Math.max(minX, Math.min(0, pos.x)), y: Math.max(minY, Math.min(0, pos.y)) };
  }

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    const bs = Math.max(FRAME / w, FRAME / h);
    setOffset({ x: (FRAME - w * bs) / 2, y: (FRAME - h * bs) / 2 });
    setZoom(1);
    setReady(true);
  }

  useEffect(() => {
    setOffset((prev) => clamp(prev, renderedW, renderedH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.offX + dx, y: dragRef.current.offY + dy }, renderedW, renderedH));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img) return;
    const exportScale = OUTPUT / FRAME;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(img, offset.x * exportScale, offset.y * exportScale, renderedW * exportScale, renderedH * exportScale);
    onConfirm(canvas.toDataURL("image/jpeg", 0.92));
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink/85 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl bg-surface p-6 shadow-lift"
      >
        <p className="text-sm font-bold text-ink">Ajustez la photo</p>

        <div
          className="relative touch-none select-none overflow-hidden bg-surface-3"
          style={{ width: FRAME, height: FRAME, borderRadius: shape === "circle" ? "9999px" : "20px" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <img
            ref={imgRef}
            src={src}
            onLoad={handleImgLoad}
            alt=""
            draggable={false}
            className="absolute pointer-events-none"
            style={{
              width: renderedW || undefined,
              height: renderedH || undefined,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              opacity: ready ? 1 : 0,
            }}
          />
        </div>

        <div className="flex w-full items-center gap-3">
          <span className="text-[11px] font-bold text-ink-faint">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-indigo"
          />
        </div>

        <div className="flex w-full gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold text-ink-soft"
          >
            <IconX size={15} />
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-tile px-4 py-3 text-sm font-bold text-[#2a1c04]"
          >
            <IconCheck size={15} strokeWidth={2} />
            Valider
          </button>
        </div>
      </motion.div>
    </div>
  );
}
