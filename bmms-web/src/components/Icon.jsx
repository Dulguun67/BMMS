const P = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  register: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM9 11h6M9 15h4" /></>,
  classroom: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 4v16M10 12h11" /></>,
  assess: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8.5 12l2.5 2.5L16 9.5" /></>,
  plan: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  report: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 17v-3M12 17v-6M15 17v-4" /></>,
  individual: <><circle cx="12" cy="7" r="3.5" /><path d="M5 21c.8-4 3.6-6 7-6s6.2 2 7 6" /></>,
  profile: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.6 3.5 5.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  print: <><path d="M7 8V3h10v5M7 17H4v-7h16v7h-3" /><rect x="7" y="14" width="10" height="7" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  check: <path d="M5 12l4 4 10-10" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: <><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></>,
};
export default function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" width={size} height={size}>{P[name]}</svg>
  );
}
