import { useEffect, useState } from 'react';
import { useUi } from '../../store/uiStore';

export function Toast() {
  const toast = useUi(s => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), Math.max(2500, toast.text.length * 55));
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className={'toast' + (show ? ' show' : '')} role="status" aria-live="polite">
      {toast?.text}
    </div>
  );
}
