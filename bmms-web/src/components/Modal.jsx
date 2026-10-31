import { useEffect, useRef } from 'react';

/** <dialog> дээр суурилсан цонх: Esc, фокус, backdrop-ийг хөтөч өөрөө зохицуулна */
export default function Modal({ open, title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); document.body.classList.add('dlg-open'); }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => () => document.body.classList.remove('dlg-open'), []);
  if (!open) return null;
  return (
    <dialog ref={ref} className={wide ? 'wide' : ''} onClose={() => { document.body.classList.remove('dlg-open'); onClose(); }}
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="dlg-head"><h2>{title}</h2><button type="button" className="btn ghost sm" onClick={onClose} aria-label="Хаах">✕</button></div>
      <div className="dlg-body">{children}</div>
      {footer && <div className="dlg-foot">{footer}</div>}
    </dialog>
  );
}
