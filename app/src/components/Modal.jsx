import { useEffect, useId, useRef } from 'react';
import './modal.css';

export default function Modal({ open, title, onClose, children, wide = false, initialFocus = 'input:not([type="file"]), select, textarea' }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector(initialFocus)?.focus();
    }
    else if (!open && dialog.open) dialog.close();
  }, [open, initialFocus]);

  return <dialog ref={ref} className={`app-modal${wide ? ' app-modal-wide' : ''}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="app-modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="app-modal-close" onClick={onClose} aria-label="Fermer">×</button></div>
    {children}
  </dialog>;
}
