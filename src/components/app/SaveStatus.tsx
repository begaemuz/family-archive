import { useArchive } from '../../store/archiveStore';

export const SAVE_TEXT = {
  saved: 'Все изменения сохранены',
  dirty: 'Есть несохранённые изменения',
  saving: 'Сохранение…',
  error: 'Ошибка сохранения',
};

/** Индикатор состояния сохранения (сама кнопка «Сохранить» — в правой панели). */
export function SaveStatus() {
  const status = useArchive(s => s.status);
  return (
    <span className={'save-status ' + status} title={SAVE_TEXT[status]} role="status">
      <span className="dot" />
      <span className="label">{SAVE_TEXT[status]}</span>
    </span>
  );
}
