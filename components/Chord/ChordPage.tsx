
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Song } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';

/**
 * Clock positions → canvas angle (degrees from +x axis, y-down):
 *   clock = hours * 30° offset from 12-o'clock (-90° in canvas)
 *   canvas_angle = -90 + (clock_hour * 30)
 *
 *   12 o'clock → -90°
 *    5 o'clock → -90 + 150 =  60°
 *    7 o'clock → -90 + 210 = 120°
 */

const DEG = Math.PI / 180;

// ── Outer-ring chord nodes (Major) ───────────────────────────────────────────
// I  = 12 o'clock, V = 5 o'clock, IV = 7 o'clock
const OUTER_CHORDS = [
    { label: 'I', angleDeg: -90, quality: 'major' },  // 12 o'clock
    { label: 'V', angleDeg: 60, quality: 'major' },  //  5 o'clock
    { label: 'IV', angleDeg: 120, quality: 'major' },  //  7 o'clock
] as const;

// ── Inner-ring chord nodes (Minor) ───────────────────────────────────────────
// vi = 12 o'clock inner, ii = 5 o'clock inner, iii = 7 o'clock inner
const INNER_CHORDS = [
    { label: 'vi', angleDeg: -90, quality: 'minor' },  // 12 o'clock
    { label: 'ii', angleDeg: 60, quality: 'minor' },  //  5 o'clock
    { label: 'iii', angleDeg: 120, quality: 'minor' },  //  7 o'clock
] as const;

// Scale-degree semitone offsets from root key
const CHORD_SEMITONES: Record<string, number> = {
    I: 0, ii: 2, iii: 4, IV: 5, V: 7, vi: 9,
};

// Key → root semitone
const KEY_ROOT: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
    F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9,
    'A#': 10, Bb: 10, B: 11,
};

interface ChordPageProps {
    song: Song | null;
    musicXml: string | null;
}

const ChordPage: React.FC<ChordPageProps> = ({ song, musicXml }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pulseRef = useRef(0);
    const rafRef = useRef(0);

    const [activeChord, setActiveChord] = useState<string | null>(null);
    const [songKey, setSongKey] = useState('C');
    const [isPlaying, setIsPlaying] = useState(false);
    const [parsedData, setParsedData] = useState<any>(null);

    // ── Parse MusicXML ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!musicXml) return;
        try {
            const parsed = musicEngine.parseMusicXml(musicXml);
            setParsedData(parsed);
            if (parsed.metadata?.key) setSongKey(parsed.metadata.key);
        } catch (e) {
            console.error('ChordPage parse error', e);
        }
    }, [musicXml]);

    // ── Detect active chord ───────────────────────────────────────────────────
    const detectChord = useCallback((): string | null => {
        if (!parsedData?.notes?.length) return null;
        const t = musicEngine.transportSeconds;
        const root = KEY_ROOT[songKey] ?? 0;

        const active = parsedData.notes.filter(
            (n: any) => n.startTime <= t + 0.4 && n.startTime + n.duration > t - 0.05
        );
        if (!active.length) return null;

        const pcs = new Set<number>(
            active.map((n: any) => {
                const idx = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
                    .indexOf(n.step.toUpperCase());
                return idx < 0 ? -1 : ((idx + n.alter - root + 120) % 12);
            }).filter((x: number) => x >= 0)
        );

        let best: string | null = null;
        let score = -1;
        for (const [label, semi] of Object.entries(CHORD_SEMITONES)) {
            const s = pcs.has(semi) ? 1 : 0;
            if (s > score) { score = s; best = label; }
        }
        return score > 0 ? best : null;
    }, [parsedData, songKey]);

    // ── Canvas ring drawing ───────────────────────────────────────────────────
    const drawRings = useCallback((
        ctx: CanvasRenderingContext2D,
        W: number, H: number,
        currentChord: string | null,
        playing: boolean,
    ) => {
        ctx.clearRect(0, 0, W, H);

        const cx = W / 2;
        const cy = H / 2;
        const outerR = Math.min(W, H) * 0.40;    // outer ring radius (canvas px)
        const outerRingW = outerR * 0.18;          // outer ring stroke width — thicker
        const innerR = outerR - outerRingW;        // inner ring sits just inside outer ring
        const innerRingW = outerR * 0.09;          // inner ring is thinner & subtle
        const pulse = Math.sin(pulseRef.current) * 0.5 + 0.5;

        // ── Draw one ring ──────────────────────────────────────────────────────
        const drawRing = (
            r: number,
            strokeW: number,
            colorA: string, colorB: string,
            glowRgb: string,
            active: boolean,
            opacity = 1.0,
        ) => {
            ctx.save();
            ctx.globalAlpha = opacity;
            // Outer glow halos
            for (let i = 3; i >= 1; i--) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.lineWidth = strokeW + i * (active ? 14 : 8);
                ctx.strokeStyle = `rgba(${glowRgb},${0.05 * i * (0.7 + pulse * 0.3)})`;
                ctx.stroke();
            }

            // Gradient stroke
            const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
            g.addColorStop(0, colorA);
            g.addColorStop(0.5, colorB);
            g.addColorStop(1, colorA);

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.lineWidth = strokeW;
            ctx.strokeStyle = g;
            ctx.shadowColor = colorB;
            ctx.shadowBlur = active ? 30 + pulse * 20 : 16 + pulse * 10;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Inner highlight
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.lineWidth = strokeW * 0.25;
            ctx.strokeStyle = `rgba(255,255,255,${active ? 0.35 + pulse * 0.2 : 0.12 + pulse * 0.08})`;
            ctx.stroke();
            ctx.restore();
        };

        // Outer green ring
        const outerActive = playing && currentChord !== null &&
            OUTER_CHORDS.some(c => c.label === currentChord);
        drawRing(outerR, outerRingW, '#15803d', '#4ade80', '34,197,94', outerActive, 1.0);

        // Inner amber ring — subtle (50% opacity), sits right inside outer ring
        const innerActive = playing && currentChord !== null &&
            INNER_CHORDS.some(c => c.label === currentChord);
        drawRing(innerR, innerRingW, '#92400e', '#fde68a', '251,191,36', innerActive, 0.55);
    }, []);

    // ── Animation loop ────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let live = true;
        const tick = () => {
            if (!live) return;
            pulseRef.current += 0.025;

            const playing = musicEngine.transportState === 'started';
            setIsPlaying(playing);

            let chord: string | null = null;
            if (playing) {
                chord = detectChord();
                setActiveChord(chord);
            } else {
                setActiveChord(null);
            }

            drawRings(ctx, canvas.width, canvas.height, chord, playing);
            rafRef.current = requestAnimationFrame(tick);
        };

        tick();
        return () => { live = false; cancelAnimationFrame(rafRef.current); };
    }, [detectChord, drawRings]);

    // ── Layout constants (for node overlays) ─────────────────────────────────
    const SIZE = 340;              // container px (CSS)
    const SCALE = 2;              // canvas resolution multiplier
    const cx = SIZE / 2;
    const cy = SIZE / 2;

    // Ring geometry in CSS px
    const outerR = SIZE * 0.40;         // outer ring centerline = 136px
    const outerRingW = outerR * 0.18;       // ring stroke width (CSS) = 24.48px
    const outerRingHalf = outerRingW / 2;      // half stroke = 12.24px

    // Node sizes
    const outerNodeSize = 46;   // blue major nodes  (radius = 23)
    const innerNodeSize = 36;   // yellow minor nodes (radius = 18)

    // ── THE KEY GEOMETRY ────────────────────────────────────────────
    // The outer ring is drawn at outerR with strokeW = outerR * 0.18.
    // Inner edge of render = outerR - strokeW/2 = outerR * (1 - 0.09) = outerR * 0.91
    //
    // The two chord-node circles meet EXACTLY at this boundary:
    //   Blue  node inner edge = boundary  → center at boundary + blueR
    //   Yellow node outer edge = boundary → center at boundary - yellowR
    const boundary = outerR * 0.91;              // inner edge of outer ring ≈ 123.8px

    // Blue outer nodes: lean outward from boundary
    const outerNodeR = boundary + outerNodeSize / 2;  // 123.8 + 22 = 145.8px

    // Yellow inner nodes: lean inward from boundary, NO crossing into outer ring
    const innerNodeR = boundary - innerNodeSize / 2;  // 123.8 - 18 = 105.8px

    const nodePos = (angleDeg: number, r: number, nodeSize: number) => {
        const rad = angleDeg * DEG;
        return {
            left: cx + r * Math.cos(rad) - nodeSize / 2,
            top: cy + r * Math.sin(rad) - nodeSize / 2,
        };
    };

    // ── Render node ────────────────────────────────────────────────────────────
    const renderNode = (
        label: string,
        angleDeg: number,
        r: number,
        isOuter: boolean,
        isActive: boolean,
    ) => {
        const size = isOuter ? outerNodeSize : innerNodeSize;
        const pos = nodePos(angleDeg, r, size);

        const baseStyle = isOuter
            ? { background: 'radial-gradient(circle at 33% 33%, #93c5fd, #1d4ed8)', border: '2.5px solid rgba(147,197,253,0.7)' }
            : { background: 'radial-gradient(circle at 33% 33%, #fde68a, #d97706)', border: '2.5px solid rgba(253,230,138,0.7)' };

        const activeStyle = isOuter
            ? { boxShadow: '0 0 24px rgba(59,130,246,1), 0 0 48px rgba(59,130,246,0.6), 0 0 72px rgba(59,130,246,0.25)', transform: 'scale(1.22)' }
            : { boxShadow: '0 0 24px rgba(251,191,36,1), 0 0 48px rgba(251,191,36,0.6), 0 0 72px rgba(251,191,36,0.25)', transform: 'scale(1.22)' };

        const idleStyle = isOuter
            ? { boxShadow: '0 0 12px rgba(59,130,246,0.55), 0 0 24px rgba(59,130,246,0.2)' }
            : { boxShadow: '0 0 10px rgba(251,191,36,0.5), 0 0 20px rgba(251,191,36,0.18)' };

        return (
            <div
                key={label}
                style={{
                    position: 'absolute',
                    width: size,
                    height: size,
                    left: pos.left,
                    top: pos.top,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                    ...baseStyle,
                    ...(isActive ? activeStyle : idleStyle),
                }}
            >
                <span style={{
                    fontFamily: "'Georgia', 'Times New Roman', serif",
                    fontWeight: 900,
                    fontStyle: 'italic',
                    fontSize: isOuter ? 22 : 18,
                    color: '#dc2626',
                    textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    userSelect: 'none',
                }}>
                    {label}
                </span>
            </div>
        );
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#050507',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: 96,
            overflowY: 'auto',
            fontFamily: "'Outfit', 'Inter', sans-serif",
        }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
        .chord-badge {
          background: linear-gradient(135deg,rgba(34,197,94,0.13),rgba(34,197,94,0.04));
          border: 1px solid rgba(34,197,94,0.28);
          backdrop-filter: blur(14px);
          border-radius: 20px;
          padding: 14px 16px;
          text-align: center;
          flex: 1;
        }
        .chord-badge-label {
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #52525b;
          margin-bottom: 6px;
        }
        .chord-badge-value {
          font-size: 28px;
          font-weight: 900;
          font-style: italic;
          color: #fff;
          line-height: 1;
        }
        .chord-scale-cell {
          border-radius: 12px;
          padding: 8px 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.03);
          transition: all 0.2s;
        }
        .chord-scale-cell.active {
          background: rgba(0,229,255,0.15);
          border-color: rgba(0,229,255,0.45);
          box-shadow: 0 0 14px rgba(0,229,255,0.35);
        }
        @keyframes ring-breathe {
          0%,100% { opacity: 0.88; }
          50%      { opacity: 1;    }
        }
        .ring-breathe { animation: ring-breathe 2.8s ease-in-out infinite; }
      `}</style>

            <div style={{ width: '100%', maxWidth: 440, padding: '24px 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

                {/* ── Header ──────────────────────────────────────────────────────── */}
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ height: 1, width: 36, background: 'linear-gradient(to right, transparent, #00e5ff)' }} />
                        <span style={{ fontSize: 9, fontWeight: 900, color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '0.4em' }}>Chord Intelligence</span>
                        <div style={{ height: 1, width: 36, background: 'linear-gradient(to left, transparent, #00e5ff)' }} />
                    </div>
                    <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.5, margin: 0 }}>
                        Diatonic Chord Ring
                    </h1>
                    <p style={{ fontSize: 12, color: '#52525b', fontStyle: 'italic', fontWeight: 700, margin: '6px 0 0' }}>
                        "Wisdom of Play by Ear and Hear by Eye"
                    </p>
                </div>

                {/* ── Status badges ────────────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                    <div className="chord-badge">
                        <div className="chord-badge-label">Key</div>
                        <div className="chord-badge-value">{song ? songKey : '–'}</div>
                    </div>
                    <div className="chord-badge">
                        <div className="chord-badge-label">Active Chord</div>
                        <div className="chord-badge-value" style={{ color: isPlaying && activeChord ? '#00e5ff' : '#fff' }}>
                            {isPlaying ? (activeChord ?? '·') : '–'}
                        </div>
                    </div>
                    <div className="chord-badge">
                        <div className="chord-badge-label">Status</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: isPlaying ? '#4ade80' : '#3f3f46',
                                boxShadow: isPlaying ? '0 0 8px #4ade80' : 'none',
                            }} />
                            <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', textTransform: 'uppercase' }}>
                                {isPlaying ? 'Live' : 'Stop'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Ring + Nodes ─────────────────────────────────────────────────── */}
                <div className="ring-breathe" style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>

                    {/* Canvas (ring art) */}
                    <canvas
                        ref={canvasRef}
                        width={SIZE * SCALE}
                        height={SIZE * SCALE}
                        style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE }}
                    />

                    {/* Outer-ring Major chord nodes — centered at outer edge of ring */}
                    {OUTER_CHORDS.map(({ label, angleDeg }) =>
                        renderNode(label, angleDeg, outerNodeR, true, activeChord === label && isPlaying)
                    )}

                    {/* Inner-ring Minor chord nodes — centered at inner edge of ring */}
                    {INNER_CHORDS.map(({ label, angleDeg }) =>
                        renderNode(label, angleDeg, innerNodeR, false, activeChord === label && isPlaying)
                    )}

                    {/* Center label */}
                    <div style={{
                        position: 'absolute',
                        left: cx - 44, top: cy - 20,
                        width: 88, textAlign: 'center', pointerEvents: 'none',
                    }}>
                        <div style={{ fontSize: 8, fontWeight: 900, color: '#27272a', textTransform: 'uppercase', letterSpacing: '0.15em', lineHeight: 1.6 }}>DIATONIC</div>
                        <div style={{ fontSize: 8, fontWeight: 900, color: '#27272a', textTransform: 'uppercase', letterSpacing: '0.15em', lineHeight: 1.6 }}>FIELD</div>
                    </div>

                    {/* Clock reference tick marks (subtle) */}
                    {[-90, 60, 120].map((a, i) => {
                        const rad = a * DEG;
                        const r1 = outerR + 12;
                        const r2 = outerR + 24;
                        return (
                            <svg
                                key={i}
                                style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, pointerEvents: 'none', opacity: 0.25 }}
                            >
                                <line
                                    x1={cx + r1 * Math.cos(rad)} y1={cy + r1 * Math.sin(rad)}
                                    x2={cx + r2 * Math.cos(rad)} y2={cy + r2 * Math.sin(rad)}
                                    stroke="#4ade80" strokeWidth={2} strokeLinecap="round"
                                />
                            </svg>
                        );
                    })}
                </div>

                {/* ── Legend ───────────────────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                    {[
                        { color: '#3b82f6', shadow: 'rgba(59,130,246,0.5)', label: 'Major  (outer ring)', desc: 'I  ·  IV  ·  V' },
                        { color: '#f59e0b', shadow: 'rgba(245,158,11,0.5)', label: 'Minor  (inner ring)', desc: 'ii  ·  iii  ·  vi' },
                    ].map(it => (
                        <div key={it.label} style={{
                            flex: 1,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 20, padding: '12px 14px',
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: it.color, boxShadow: `0 0 8px ${it.shadow}`, flexShrink: 0 }} />
                            <div>
                                <div style={{ fontSize: 9, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{it.label}</div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#52525b', marginTop: 2 }}>{it.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Diatonic scale row ──────────────────────────────────────────── */}
                <div style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 24, padding: '16px 14px',
                }}>
                    <div style={{ fontSize: 9, fontWeight: 900, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.25em', marginBottom: 10 }}>
                        Diatonic Scale — {song ? songKey : 'C'} Major
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                        {(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] as const).map((lb, i) => {
                            const isAct = activeChord === lb && isPlaying;
                            return (
                                <div key={lb} className={`chord-scale-cell${isAct ? ' active' : ''}`}>
                                    <span style={{ fontSize: 11, fontWeight: 900, fontStyle: 'italic', color: isAct ? '#00e5ff' : '#71717a' }}>{lb}</span>
                                    <span style={{ fontSize: 7, fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase' }}>{i + 1}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── No-song hint ─────────────────────────────────────────────────── */}
                {!song && (
                    <div style={{
                        width: '100%', background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 28, padding: '24px 20px', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>♪</div>
                        <p style={{ fontSize: 12, fontWeight: 900, color: '#fff', fontStyle: 'italic', textTransform: 'uppercase', marginBottom: 6 }}>
                            No Song Selected
                        </p>
                        <p style={{ fontSize: 11, color: '#52525b', lineHeight: 1.6, margin: 0 }}>
                            Open a song in the Player and press play.<br />
                            The ring will glow and highlight each chord live.
                        </p>
                    </div>
                )}

                {song && !isPlaying && (
                    <div style={{
                        width: '100%', background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 24, padding: '16px 20px', textAlign: 'center',
                    }}>
                        <p style={{ fontSize: 12, fontWeight: 900, color: '#fff', fontStyle: 'italic', margin: '0 0 4px' }}>{song.title}</p>
                        <p style={{ fontSize: 10, color: '#52525b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                            key: {songKey}  ·  Press Play in Player to activate the ring
                        </p>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ChordPage;
