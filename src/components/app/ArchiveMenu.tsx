import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { canWriteFiles } from '../../archive/fileAccess';
import { useArchive } from '../../store/archiveStore';
import { useSession } from '../../store/sessionStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { ArchiveInfoDialog } from './ArchiveInfoDialog';
import { ChangePasswordDialog } from './ChangePasswordDialog';

/** Название открытого архива и действия с ним. */
export function ArchiveMenu() {
  const title = useArchive(s => s.data?.meta.title ?? '');
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'info' | 'password' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  /** закрыть текущий архив, при несохранённом — спросить */
  const leave = async (): Promise<boolean> => {
    if (useArchive.getState().status === 'saved') return true;
    const r = await useUi.getState().confirm({
      title: 'Есть несохранённые изменения',
      body: 'Сохраните архив, чтобы они не пропали.',
      ok: 'Закрыть без сохранения',
      alt: 'Сохранить и закрыть',
      icon: 'save',
    });
    if (r === 'alt') return useSession.getState().save();
    return r === true;
  };

  const item = (icon: Parameters<typeof Icon>[0]['name'], label: string, fn: () => void, danger = false) => (
    <button
      className={'menu-item' + (danger ? ' danger' : '')}
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  return (
    <div className="archive-menu" ref={ref}>
      <button className="ghost archive-title" title="Действия с архивом" onClick={() => setOpen(o => !o)}>
        <Icon name="lock" />
        <span className="label">{title}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="menu" role="menu">
          {item('info', 'Об архиве', () => setDialog('info'))}
          {item('save', canWriteFiles() ? 'Сохранить как…' : 'Скачать копию', () => useSession.getState().save({ as: true }))}
          {item('book-pdf', 'Скачать PDF-книгу', async () => {
            const { exportPdfBook } = await import('../../pdf/exportBook');
            exportPdfBook();
          })}
          {item('key', 'Изменить пароль', () => setDialog('password'))}
          <div className="menu-sep" />
          {item('archive', 'Создать новый архив', async () => (await leave()) && useSession.getState().closeArchive())}
          {item('logout', 'Закрыть архив', async () => (await leave()) && useSession.getState().closeArchive(), true)}
        </div>
      )}
      {/* окна — порталом в body: у шапки есть backdrop-filter, и position:fixed внутри неё
          отсчитывался бы от шапки, а не от экрана (окно уезжало за край) */}
      {dialog === 'info' && createPortal(<ArchiveInfoDialog onClose={() => setDialog(null)} />, document.body)}
      {dialog === 'password' && createPortal(<ChangePasswordDialog onClose={() => setDialog(null)} />, document.body)}
    </div>
  );
}
