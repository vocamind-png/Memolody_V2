
import React, { useRef, useEffect, memo, useMemo } from 'react';

// Deterministic hash from string → number
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Seeded pseudo-random
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 7) % 2147483647;
    return s / 2147483647;
  };
}

// Curated palettes — each yields a rich, harmonious result
const PALETTES = [
  // 0: Deep Ocean
  ['#0f0c29', '#302b63', '#24243e', '#00d2ff', '#3a7bd5'],
  // 1: Sunset Ember
  ['#0f0505', '#4a1942', '#c94b4b', '#fc4a1a', '#f7b733'],
  // 2: Aurora Borealis
  ['#000428', '#004e92', '#43cea2', '#185a9d', '#00c9ff'],
  // 3: Cosmic Rose
  ['#141e30', '#243b55', '#7f00ff', '#e100ff', '#ff6b6b'],
  // 4: Emerald Night
  ['#0a0f0d', '#1b4332', '#2d6a4f', '#40916c', '#52b788'],
  // 5: Violet Nebula
  ['#0d0d2b', '#1a1a3e', '#6c5ce7', '#a29bfe', '#fd79a8'],
  // 6: Golden Dawn
  ['#0f0c08', '#2d1f0f', '#f39c12', '#e74c3c', '#f1c40f'],
  // 7: Ice Crystal
  ['#06060f', '#0c2340', '#00b4d8', '#48cae4', '#caf0f8'],
  // 8: Berry Fusion
  ['#1a0a1e', '#2d132c', '#801336', '#c72c41', '#ee4540'],
  // 9: Midnight Jazz
  ['#010117', '#110f3c', '#553c9a', '#7b5ea7', '#9b59b6'],
];

interface AbstractCoverProps {
  seed: string;
  size?: number;      // px (canvas resolution, CSS always fills parent)
  className?: string;
  style?: React.CSSProperties;
}

const AbstractCover: React.FC<AbstractCoverProps> = memo(({ seed, size = 200, className = '', style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const h = useMemo(() => hashStr(seed || 'untitled'), [seed]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const w = size;
    cvs.width = w;
    cvs.height = w;

    const rand = seededRandom(h);
    const palette = PALETTES[h % PALETTES.length];

    // Layer 1: Base gradient (diagonal with rotation based on seed)
    const angle = rand() * Math.PI * 2;
    const gx0 = w / 2 + Math.cos(angle) * w * 0.7;
    const gy0 = w / 2 + Math.sin(angle) * w * 0.7;
    const gx1 = w / 2 - Math.cos(angle) * w * 0.7;
    const gy1 = w / 2 - Math.sin(angle) * w * 0.7;
    const baseGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    baseGrad.addColorStop(0, palette[0]);
    baseGrad.addColorStop(0.5, palette[1]);
    baseGrad.addColorStop(1, palette[2]);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, w);

    // Layer 2: Radial blobs (2-4 circles)
    const blobCount = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < blobCount; i++) {
      const cx = rand() * w;
      const cy = rand() * w;
      const r = w * (0.2 + rand() * 0.5);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const col = palette[3 + Math.floor(rand() * (palette.length - 3))];
      grad.addColorStop(0, col + '60');
      grad.addColorStop(0.5, col + '20');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, w);
    }

    // Layer 3: Organic flowing curves (like sound waves)
    ctx.globalCompositeOperation = 'screen';
    const waveCount = 2 + Math.floor(rand() * 3);
    for (let wave = 0; wave < waveCount; wave++) {
      ctx.beginPath();
      const baseY = w * (0.2 + rand() * 0.6);
      const amplitude = w * (0.05 + rand() * 0.15);
      const freq = 2 + rand() * 4;
      const phase = rand() * Math.PI * 2;

      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 2) {
        const y = baseY + Math.sin((x / w) * freq * Math.PI + phase) * amplitude
          + Math.cos((x / w) * (freq + 1) * Math.PI + phase * 2) * amplitude * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, w);
      ctx.lineTo(0, w);
      ctx.closePath();

      const waveCol = palette[Math.floor(rand() * palette.length)];
      const waveGrad = ctx.createLinearGradient(0, baseY - amplitude, 0, baseY + amplitude * 2);
      waveGrad.addColorStop(0, waveCol + '40');
      waveGrad.addColorStop(0.5, waveCol + '15');
      waveGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = waveGrad;
      ctx.fill();
    }

    // Layer 4: Small glitter/star dots
    ctx.globalCompositeOperation = 'screen';
    const dotCount = 6 + Math.floor(rand() * 15);
    for (let i = 0; i < dotCount; i++) {
      const dx = rand() * w;
      const dy = rand() * w;
      const dr = 0.5 + rand() * 2;
      const col = palette[3 + Math.floor(rand() * (palette.length - 3))];
      const dotGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dr * 4);
      dotGrad.addColorStop(0, col + 'cc');
      dotGrad.addColorStop(0.5, col + '40');
      dotGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = dotGrad;
      ctx.fillRect(dx - dr * 4, dy - dr * 4, dr * 8, dr * 8);
    }

    ctx.globalCompositeOperation = 'source-over';

    // Layer 5: Soft vignette
    const vig = ctx.createRadialGradient(w / 2, w / 2, w * 0.2, w / 2, w / 2, w * 0.8);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, w);

  }, [h, size]);

  return (
    <canvas
      ref={canvasRef}
      className={`block ${className}`}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: 'inherit',
        ...style,
      }}
    />
  );
});

AbstractCover.displayName = 'AbstractCover';
export default AbstractCover;
