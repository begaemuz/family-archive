import { useState } from 'react';
import { formatSize } from '../../archive/media';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { useSession } from '../../store/sessionStore';
import { Icon } from '../../ui/Icon';

/** Сведения об архиве: название, описание, обложка, состав, файл. */
export function ArchiveInfoDialog({ onClose }: { onClose(): void }) {
  const data = useArchive(s => s.data)!;
  const fileName = useSession(s => s.fileName);
  const [title, setTitle] = useState(data.meta.title);
  const [description, setDescription] = useState(data.meta.description);
  const cover = useMediaUrl(data.meta.coverId);
  const totalSize = data.media.reduce((s, m) => s + m.size, 0);
  const count = (k: string) => data.media.filter(m => m.kind === k).length;
  const lastEdits = data.history.slice(-6).reverse();

  return (
    <div className="overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(560px,100%)' }}>
        <div className="modal-header">
          <div>
            <h2>Об архиве</h2>
            <p>{fileName || 'ещё не сохранён в файл'}</p>
          </div>
          <button className="icon-button ghost" title="Закрыть" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          {cover && <img className="archive-cover" src={cover} alt="Обложка" />}
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="ai_title">Название</label>
              <input id="ai_title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="ai_desc">Описание</label>
              <textarea id="ai_desc" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="archive-stats">
            <div><b>{data.persons.length}</b> людей</div>
            <div><b>{data.relations.length}</b> связей</div>
            <div><b>{count('photo')}</b> фото</div>
            <div><b>{count('video')}</b> видео</div>
            <div><b>{count('audio')}</b> аудио</div>
            <div><b>{count('document')}</b> документов</div>
            <div><b>{data.stories.length}</b> историй</div>
            <div><b>{formatSize(totalSize)}</b> файлов</div>
          </div>
          <div className="archive-security">
            <Icon name="shield" />
            <span>Шифрование AES-256-GCM, ключ из пароля — Argon2id. Пароль нигде не хранится: без него архив открыть нельзя, восстановить пароль тоже нельзя.</span>
          </div>
          {lastEdits.length > 0 && (
            <>
              <div className="sp-section-title" style={{ marginTop: 18 }}>
                Последние изменения
              </div>
              <div className="history-list">
                {lastEdits.map((h, i) => (
                  <div key={i}>
                    <small>{new Date(h.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small> {h.summary}
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="muted-note">
            Создан {new Date(data.meta.createdAt).toLocaleDateString('ru-RU')} · ID архива {data.meta.id.slice(0, 8)}
          </p>
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            className="primary"
            onClick={() => {
              if (title.trim() !== data.meta.title || description !== data.meta.description)
                useArchive.getState().updateMeta({ title: title.trim() || data.meta.title, description });
              onClose();
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
