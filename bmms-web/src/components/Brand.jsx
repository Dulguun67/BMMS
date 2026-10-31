export default function Brand() {
  return (
    <div className="brand">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <g transform="rotate(-8 20 20)">
          <rect x="3" y="3" width="16" height="16" rx="4" fill="var(--yellow)" />
          <rect x="21" y="3" width="16" height="16" rx="4" fill="var(--primary)" />
          <rect x="3" y="21" width="16" height="16" rx="4" fill="var(--green)" />
          <rect x="21" y="21" width="16" height="16" rx="4" fill="var(--rose)" />
          <circle cx="20" cy="11" r="3.4" fill="var(--yellow)" /><circle cx="29" cy="20" r="3.4" fill="var(--primary)" />
          <circle cx="11" cy="20" r="3.4" fill="var(--green)" /><circle cx="20" cy="29" r="3.4" fill="var(--rose)" />
        </g>
      </svg>
      <div>
        <div className="wordmark" aria-label="Wonders">{'Wonders'.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
        <small>Бүлгийн менежментийн систем</small>
      </div>
    </div>
  );
}
