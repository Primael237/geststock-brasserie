import { useMemo, useRef, useState } from 'react';

interface Point { date: string; total: number; }

const W = 700, H = 220, PAD_TOP = 16, PAD_BOTTOM = 28, PAD_RIGHT = 62, PAD_LEFT = 4;

// Conversion Catmull-Rom -> Bézier cubique pour obtenir une courbe lissée passant par tous les points.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function RevenueChart({ data }: { data: Point[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { points, gridLines, linePath, areaPath } = useMemo(() => {
    const values = data.map(d => d.total);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const innerW = W - PAD_LEFT - PAD_RIGHT;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const pts = data.map((d, i) => ({
      x: PAD_LEFT + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
      y: PAD_TOP + innerH - ((d.total - min) / span) * innerH,
      date: d.date, total: d.total,
    }));
    const grid = [0, 1 / 3, 2 / 3, 1].map(f => ({
      y: PAD_TOP + innerH * (1 - f),
      value: Math.round(min + span * f),
    }));
    const line = smoothPath(pts);
    const area = pts.length > 1
      ? `${line} L ${pts[pts.length - 1].x} ${PAD_TOP + innerH} L ${pts[0].x} ${PAD_TOP + innerH} Z`
      : '';
    return { points: pts, gridLines: grid, linePath: line, areaPath: area };
  }, [data]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0, bestDist = Infinity;
    points.forEach((p, i) => { const d = Math.abs(p.x - relX); if (d < bestDist) { bestDist = d; closest = i; } });
    setHoverIdx(closest);
  };

  if (data.length === 0) return <p className="text-sm text-gray-400">Aucune donnée.</p>;

  const hovered = hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];
  const refValue = points[0]?.total ?? 0;
  const refY = points.length ? PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - (refValue - Math.min(...points.map(p=>p.total)) ) / ((Math.max(...points.map(p=>p.total)) - Math.min(...points.map(p=>p.total))) || 1)) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-2xl font-bold text-gray-900">{hovered.total.toLocaleString()} <span className="text-sm font-normal text-gray-400">FCFA</span></p>
        <p className="text-xs text-gray-400">{new Date(hovered.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-48 cursor-crosshair select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grille + labels de valeur */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} y1={g.y} x2={W - PAD_RIGHT} y2={g.y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray={i === 0 || i === 3 ? undefined : '3,3'} />
            <text x={W - PAD_RIGHT + 8} y={g.y + 4} fontSize="11" fill="#9ca3af">{g.value.toLocaleString()}</text>
          </g>
        ))}

        {/* Ligne de référence (1er jour) */}
        <line x1={PAD_LEFT} y1={refY} x2={W - PAD_RIGHT} y2={refY} stroke="#9ca3af" strokeWidth="1" strokeDasharray="4,3" />

        {/* Aire dégradée + courbe lissée */}
        {areaPath && <path d={areaPath} fill="url(#revenueFill)" />}
        <path d={linePath} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Repère interactif */}
        {hoverIdx !== null && (
          <>
            <line x1={points[hoverIdx].x} y1={PAD_TOP} x2={points[hoverIdx].x} y2={H - PAD_BOTTOM} stroke="#9ca3af" strokeWidth="1" strokeDasharray="2,2" />
            <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r="4.5" fill="#059669" stroke="white" strokeWidth="2" />
          </>
        )}

        {/* Labels des jours */}
        {points.map((p, i) => (
          <text key={i} x={p.x} y={H - 8} fontSize="11" fill="#9ca3af" textAnchor="middle">
            {new Date(p.date).getDate()}
          </text>
        ))}
      </svg>
    </div>
  );
}
