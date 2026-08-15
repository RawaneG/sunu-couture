export function detectDominantColor(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 48;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, size, size).data;
      } catch (e) {
        reject(e);
        return;
      }

      const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
      const margin = Math.round(size * 0.12);
      for (let y = margin; y < size - margin; y++) {
        for (let x = margin; x < size - margin; x++) {
          const i = (y * size + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 200) continue;
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
          bucket.count++;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          buckets.set(key, bucket);
        }
      }

      let best: { count: number; r: number; g: number; b: number } | null = null;
      for (const bucket of buckets.values()) {
        if (!best || bucket.count > best.count) best = bucket;
      }
      if (!best) {
        reject(new Error("no pixels sampled"));
        return;
      }
      resolve(rgbToHex(Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)));
    };
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
