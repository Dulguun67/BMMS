import { useNavigate, useParams } from 'react-router';
import { DIRS, STATUS_CHIP } from '../lib/constants';

export const Chip = ({ children, c = '' }) => <span className={`chip ${c}`}>{children}</span>;
export const StatusChip = ({ s }) => <Chip c={STATUS_CHIP[s]}>{s}</Chip>;
export const DirDots = ({ ids = [] }) => (
  <span className="dirs">{ids.map((i) => <i key={i} className="dot" style={{ background: DIRS[i] && DIRS[i].color }} title={DIRS[i] && DIRS[i].short} />)}</span>
);
export const Loading = () => <div className="loading-row"><span className="spin" /> Ачаалж байна…</div>;
export const ErrorBox = ({ error, onRetry }) => (
  <div className="panel-pad"><div className="err">{error.message}{onRetry && <> <button className="link" onClick={onRetry}>Дахин оролдох</button></>}</div></div>
);
export const Empty = ({ title, children, action }) => (
  <div className="empty">{title && <h3>{title}</h3>}{children && <p>{children}</p>}{action && <div className="row">{action}</div>}</div>
);

export function PageHead({ title, sub, right }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {right && <div className="row">{right}</div>}
    </div>
  );
}

/** URL-ийн :tab параметрээр удирдагдах таб */
export function RouteTabs({ base, tabs }) {
  const { tab } = useParams();
  const nav = useNavigate();
  const cur = tab || tabs[0][0];
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={cur === k} onClick={() => nav(`${base}/${k}`)}>{l}</button>
      ))}
    </div>
  );
}
export function useTab(def) { const { tab } = useParams(); return tab || def; }

export function Seg({ value, options, onChange, disabled, color, ink, wide, label }) {
  return (
    <span className={`seg ${wide ? 'wide' : ''}`} style={{ '--lv': color, '--lvi': ink }} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} disabled={disabled} onClick={() => onChange(value === v ? null : v)}>{l}</button>
      ))}
    </span>
  );
}

export const Field = ({ label, children, full }) => (
  <label className={`field ${full ? 'full' : ''}`}><span>{label}</span>{children}</label>
);
export const Select = ({ options, ...p }) => (
  <select className="input" {...p}>
    {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={String(v)} value={v}>{l}</option>; })}
  </select>
);
