import { r2 } from '../lib/format';

export function BarChart({ labels, series, max = 3, h = 230 }) {
  const W = 680; const pl = 34; const pb = 48; const pt = 14; const pr = 10;
  const cw = (W - pl - pr) / labels.length; const bw = Math.min(26, (cw - 16) / Math.max(series.length, 1));
  const ticks = [...Array(Math.min(max, 6) + 1)].map((_, i) => (max * i) / Math.min(max, 6));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Баганан график">
      {ticks.map((t) => { const y = pt + (h - pt - pb) * (1 - t / max); return <g key={t}><line className="grid" x1={pl} x2={W - pr} y1={y} y2={y} /><text x={pl - 8} y={y + 4} textAnchor="end">{Math.round(t * 10) / 10}</text></g>; })}
      {labels.map((l, i) => {
        const x0 = pl + i * cw + (cw - bw * series.length) / 2;
        const words = String(l).split(' ');
        return (
          <g key={l}>
            {series.map((s, j) => {
              const v = s.values[i]; if (v == null) return null;
              const bh = (h - pt - pb) * (v / max);
              return <rect key={s.name} x={x0 + j * bw + 1} y={h - pb - bh} width={bw - 2} height={bh} rx="4" fill={s.color} opacity={s.opacity || 1}><title>{`${s.name}: ${r2(v)}`}</title></rect>;
            })}
            <text x={pl + i * cw + cw / 2} y={h - pb + 17} textAnchor="middle">{words.slice(0, 2).join(' ')}</text>
            {words.length > 2 && <text x={pl + i * cw + cw / 2} y={h - pb + 31} textAnchor="middle">{words.slice(2).join(' ')}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ labels, series, h = 200 }) {
  const vals = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!vals.length) return <p className="muted small">Хэмжилтийн мэдээлэл алга.</p>;
  let lo = Math.min(...vals); let hi = Math.max(...vals); const span = (hi - lo) || 10;
  lo = Math.floor(lo - span * 0.2); hi = Math.ceil(hi + span * 0.2);
  const W = 680; const pl = 40; const pb = 28; const pt = 12; const pr = 16;
  const cw = labels.length > 1 ? (W - pl - pr) / (labels.length - 1) : 0;
  const Y = (v) => pt + (h - pt - pb) * (1 - (v - lo) / (hi - lo));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Шугаман график">
      {[0, 1, 2, 3, 4].map((t) => { const v = lo + ((hi - lo) * t) / 4; return <g key={t}><line className="grid" x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} /><text x={pl - 8} y={Y(v) + 4} textAnchor="end">{Math.round(v)}</text></g>; })}
      {labels.map((l, i) => <text key={l} x={pl + i * cw} y={h - 8} textAnchor={labels.length === 1 || i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{l}</text>)}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (v == null ? null : [pl + i * cw, Y(v)])).filter(Boolean);
        return (
          <g key={s.name}>
            {pts.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={pts.map((p) => p.join(',')).join(' ')} />}
            {pts.map((p) => <circle key={p.join()} cx={p[0]} cy={p[1]} r="4.5" fill="var(--surface)" stroke={s.color} strokeWidth="2.5" />)}
          </g>
        );
      })}
    </svg>
  );
}
