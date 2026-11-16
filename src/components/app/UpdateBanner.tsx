import { useUpdate } from '../../pwa/update';
import { useArchive } from '../../store/archiveStore';
import { Icon } from '../../ui/Icon';

/** «Доступна новая версия» — внизу слева, пока не обновили. */
export function UpdateBanner() {
  const update = useUpdate();
  const open = useArchive(s => !!s.data);
  if (!update) return null;
  return (
    <div className="update-banner" role="status">
      <Icon name="refresh" size={18} />
      <div className="update-text">
        <b>Доступна новая версия Rodiva</b>
        {open && <small>Изменения не пропадут: после обновления введите пароль архива</small>}
      </div>
      <button className="primary" onClick={update}>
        Обновить
      </button>
    </div>
  );
}
