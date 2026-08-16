import { useEffect, useRef, useState } from "react";
import { haptic } from "../../lib/haptics";

export default function SignaturePad({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !value) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = value;
    // Only restore the saved drawing on mount — this canvas is uncontrolled after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#241c34";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.strokeStyle = ink;
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasDrawn(true);
    haptic(6);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
    haptic();
  }

  return (
    <div>
      <div className="glass-input relative overflow-hidden rounded-2xl" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block h-24 w-full cursor-crosshair"
        />
        {!hasDrawn && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] font-semibold text-ink-faint">
            Signer ici
          </span>
        )}
      </div>
      {hasDrawn && (
        <button type="button" onClick={clear} className="mt-2 text-[11.5px] font-bold text-terracotta">
          Effacer la signature
        </button>
      )}
    </div>
  );
}
