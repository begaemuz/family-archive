import { useEffect, useRef } from 'react';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

/** «Вы уверены?» — фокус сразу на «Отмена», чтобы случайный Enter ничего не удалил. */
export function ConfirmDialog() {
  const req = useUi(s => s.confirmReq);
  const resolve = useUi(s => s.resolveConfirm);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (req) setTimeout(() => cancelRef.current?.focus(), 30);
  }, [req]);

  if (!req) return null;
  const danger = req.danger ?? true;
  return (
    <div className="overlay confirm-overlay open" onClick={e => e.target === e.currentTarget && resolve(false)}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div className="modal-body">
          <div className={'confirm-icon' + (danger ? '' : ' neutral')}>
            <Icon name={req.icon || (danger ? 'trash' : 'folder')} size={24} />
          </div>
          <h2 id="confirmTitle">{req.title}</h2>
          {req.body && <p>{req.body}</p>}
        </div>
        {req.alt ? (
          // три варианта — столбцом на всю ширину: рекомендуемое действие сверху, отмена внизу
          <div className="modal-footer confirm-actions stacked">
            <button className="primary" onClick={() => resolve('alt')}>
              {req.alt}
            </button>
            <button className={danger ? 'ghost danger' : ''} onClick={() => resolve(true)}>
              {req.ok || 'Удалить'}
            </button>
            <button ref={cancelRef} className="ghost" onClick={() => resolve(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <div className="modal-footer confirm-actions">
            <button ref={cancelRef} className="ghost" onClick={() => resolve(false)}>
              Отмена
            </button>
            <button className={danger ? 'danger-solid' : 'primary'} onClick={() => resolve(true)}>
              {req.ok || 'Удалить'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
