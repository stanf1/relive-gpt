import { useMemo } from 'react';
import type { Activity } from '../lib/gpx';

export default function ElevationChart({ activity, progress, onSeek }: { activity: Activity; progress: number; onSeek: (progress: number) => void }) {
  const chart = useMemo(() => {
    const points = activity.points;
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) if (p.elevation !== null) { min = Math.min(min, p.elevation); max = Math.max(max, p.elevation); }
    if (!Number.isFinite(min)) return null;
    const padding = Math.max((max - min) * 0.18, 15);
    const bottom = min - padding;
    const range = max - min + padding * 2;
    const paths: { line: string; area: string }[] = [];
    let line = '';
    let startX = 0;
    let endX = 0;
    let previousSegment = -1;
    const finish = () => { if (line) paths.push({ line, area: `${line} L ${endX} 90 L ${startX} 90 Z` }); line = ''; };
    // Keep gaps / segments intact and downsample only inside continuous runs.
    const stride = Math.max(1, Math.floor(points.length / 1000));
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.elevation === null || p.segment !== previousSegment) finish();
      previousSegment = p.segment;
      if (p.elevation === null) continue;
      const boundary = !line || i === points.length - 1 || points[i + 1].elevation === null || points[i + 1].segment !== p.segment;
      if (!boundary && i % stride !== 0) continue;
      const x = p.distance / activity.distance * 1000;
      const y = 86 - (p.elevation - bottom) / range * 76;
      if (!line) startX = x;
      endX = x;
      line += `${line ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    finish();
    return { min, max, paths };
  }, [activity]);

  if (!chart) return <div className="chart-empty">此 GPX 未包含海拔資料，仍可重播路徑。</div>;
  return <div className="elevation-chart">
    <div className="chart-axis"><span>{Math.round(chart.max).toLocaleString()} m</span><span>{Math.round(chart.min).toLocaleString()} m</span></div>
    <div className="chart-plot">
      <svg viewBox="0 0 1000 96" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#85b09a" stopOpacity="0.38" /><stop offset="100%" stopColor="#85b09a" stopOpacity="0.02" /></linearGradient></defs>
        <line x1="0" y1="25" x2="1000" y2="25" className="chart-grid" /><line x1="0" y1="70" x2="1000" y2="70" className="chart-grid" />
        {chart.paths.map((p, i) => <g key={i}><path d={p.area} fill="url(#elevation-fill)" /><path d={p.line} fill="none" stroke="#8fbea2" strokeWidth="2" vectorEffect="non-scaling-stroke" /></g>)}
        <line x1={progress * 1000} y1="0" x2={progress * 1000} y2="96" stroke="#edab77" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
      </svg>
      <input className="chart-seek" type="range" min="0" max="1" step="0.001" value={progress} onChange={(e) => onSeek(Number(e.target.value))} aria-label="拖曳海拔圖以調整重播位置" />
      <div className="chart-distances"><span>0 km</span><span>{(activity.distance / 2000).toFixed(1)}</span><span>{(activity.distance / 1000).toFixed(2)} km</span></div>
    </div>
  </div>;
}
