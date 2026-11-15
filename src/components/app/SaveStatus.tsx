import { useArchive } from '../../store/archiveStore';
import { useSession } from '../../store/sessionStore';
import { Icon } from '../../ui/Icon';

const TEXT = {
  saved: 'Все изменения сохранены',
  dirty: 'Есть несохранённые изменения',
  saving: 'Сохранение…',
  error: 'Ошибка сохранения',
};

/** Индикатор состояния + кнопка «Сохранить архив». */
export function SaveStatus() {
  const status = useArchive(s => s.status);
  const save = useSession(s => s.save);
  return (
    <>
      <span className={'save-status ' + status} title={TEXT[status]}>
        <span className="dot" />
        <span className="label">{TEXT[status]}</span>
      </span>
      <button className={status === 'saved' ? 'ghost' : 'save-btn'} title="Сохранить архив (Ctrl+S)" disabled={status === 'saving'} onClick={() => save()}>
        <Icon name="save" />
        <span className="label">Сохранить архив</span>
      </button>
    </>
  );
}
