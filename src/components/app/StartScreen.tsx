import { useEffect, useMemo, useState } from 'react';
import { ArchiveError } from '../../archive/container';
import { pickArchiveFile } from '../../archive/fileAccess';
import { pickFiles } from '../../hooks/useFilePicker';
import { useSession } from '../../store/sessionStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { PasswordField } from './PasswordField';

type View = 'home' | 'create' | 'import' | 'restore';

const errText = (e: unknown) =>
  e instanceof ArchiveError ? e.message : (e as Error)?.message === 'wrong-password' ? 'Неверный пароль' : 'Не удалось открыть: ' + ((e as Error)?.message || 'ошибка');

/** Экран без открытого архива: создать, открыть, импортировать, восстановить. */
export function StartScreen() {
  const [view, setView] = useState<View>('home');
  const pending = useSession(s => s.pending);
  const pendingImport = useSession(s => s.pendingImport);
  const draft = useSession(s => s.draft);
  const busy = useSession(s => s.busy);

  const openFile = async () => {
    const r = await pickArchiveFile();
    if (r) useSession.getState().chooseFile(r.file, r.handle);
  };
  const importOld = async () => {
    const [f] = await pickFiles('.zip,.json');
    if (!f) return;
    try {
      await useSession.getState().importLegacy(f);
    } catch (e) {
      useUi.getState().showToast(errText(e));
    }
  };

  let body;
  if (pending) body = <UnlockForm fileName={pending.file.name} />;
  else if (pendingImport) body = <CreateForm mode="import" count={pendingImport.data.persons.length} onBack={() => useSession.setState({ pendingImport: null })} />;
  else if (view === 'create') body = <CreateForm mode="create" onBack={() => setView('home')} />;
  else if (view === 'restore' && draft) body = <RestoreForm title={draft.title} onBack={() => setView('home')} />;
  else
    body = (
      <div className="start-card">
        <div className="start-logo">
          <Icon name="tree" size={34} />
        </div>
        <h1>Семейный архив</h1>
        <p className="start-motto">История вашей семьи принадлежит только вашей семье</p>
        <p className="start-sub">
          Родословное древо, фото, видео, документы и истории — в одном зашифрованном файле <b>.family</b>. Всё хранится у вас и никуда не отправляется.
        </p>
        {draft && (
          <div className="draft-card">
            <Icon name="info" />
            <div>
              <b>Несохранённые изменения</b>
              <small>
                «{draft.title}», {new Date(draft.savedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </small>
            </div>
            <button className="primary" onClick={() => setView('restore')}>
              Восстановить
            </button>
            <button
              className="ghost danger icon-button"
              title="Удалить черновик"
              onClick={async () => {
                const ok = await useUi.getState().confirm({ title: 'Удалить несохранённые изменения?', body: 'Восстановить их будет нельзя.', ok: 'Удалить' });
                if (ok === true) useSession.getState().discardDraft();
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        )}
        <div className="start-actions big">
          <button className="primary" onClick={() => setView('create')}>
            <Icon name="plus" />
            Создать семейный альбом
          </button>
          <button onClick={openFile}>
            <Icon name="unlock" />
            Открыть архив .family
          </button>
        </div>
        <button className="ghost start-folder" onClick={importOld}>
          <Icon name="upload" />
          Перенести дерево из старой версии (ZIP / JSON)
        </button>
        <div className="drop-hint">
          <Icon name="download" />
          или перетащите файл сюда
        </div>
      </div>
    );

  return (
    <div className="start-screen">
      {body}
      {busy && (
        <div className="busy">
          <span className="spinner" />
          {busy}
        </div>
      )}
    </div>
  );
}

function UnlockForm({ fileName }: { fileName: string }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const busy = useSession(s => s.busy);
  return (
    <form
      className="start-card pw-card"
      onSubmit={async e => {
        e.preventDefault();
        setError('');
        try {
          await useSession.getState().unlock(pw);
        } catch (err) {
          setError(errText(err));
          if (err instanceof ArchiveError && err.code !== 'wrong-password') return;
          setPw('');
        }
      }}
    >
      <div className="start-logo lock">
        <Icon name="lock" size={30} />
      </div>
      <h2>Введите пароль</h2>
      <p className="start-sub">
        Архив <b>{fileName}</b> зашифрован. Он откроется прямо в браузере — пароль и данные никуда не отправляются.
      </p>
      <PasswordField id="unlock_pw" label="Пароль архива" value={pw} onChange={setPw} autoFocus />
      {error && <div className="form-error">{error}</div>}
      <div className="start-actions">
        <button type="button" className="ghost" onClick={() => useSession.getState().cancelPending()} disabled={!!busy}>
          Отмена
        </button>
        <button className="primary" disabled={!pw || !!busy}>
          <Icon name="unlock" /> Открыть
        </button>
      </div>
    </form>
  );
}

function RestoreForm({ title, onBack }: { title: string; onBack(): void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const busy = useSession(s => s.busy);
  return (
    <form
      className="start-card pw-card"
      onSubmit={async e => {
        e.preventDefault();
        setError('');
        try {
          await useSession.getState().restore(pw);
        } catch (err) {
          setError(errText(err));
          setPw('');
        }
      }}
    >
      <div className="start-logo lock">
        <Icon name="lock" size={30} />
      </div>
      <h2>Восстановить изменения</h2>
      <p className="start-sub">
        Несохранённые изменения архива <b>«{title}»</b> хранятся в браузере в зашифрованном виде. Введите пароль этого архива.
      </p>
      <PasswordField id="restore_pw" label="Пароль архива" value={pw} onChange={setPw} autoFocus />
      {error && <div className="form-error">{error}</div>}
      <div className="start-actions">
        <button type="button" className="ghost" onClick={onBack} disabled={!!busy}>
          Назад
        </button>
        <button className="primary" disabled={!pw || !!busy}>
          Восстановить
        </button>
      </div>
    </form>
  );
}

function CreateForm({ mode, count, onBack }: { mode: 'create' | 'import'; count?: number; onBack(): void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const busy = useSession(s => s.busy);
  const coverUrl = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => void (coverUrl && URL.revokeObjectURL(coverUrl)), [coverUrl]);

  const submit = async () => {
    setError('');
    if (!title.trim()) return setError('Укажите название альбома');
    if (pw.length < 8) return setError('Пароль — не короче 8 символов');
    if (pw !== pw2) return setError('Пароли не совпадают');
    try {
      if (mode === 'create') await useSession.getState().createArchive({ title, description, password: pw, cover });
      else await useSession.getState().finishImport({ title, description, password: pw });
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <form
      className="start-card create-card"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>{mode === 'create' ? 'Новый семейный альбом' : 'Перенос в зашифрованный архив'}</h2>
      <p className="start-sub">
        {mode === 'import'
          ? `Найдено людей: ${count}. Задайте название и пароль — дерево будет сохранено в новом зашифрованном формате.`
          : 'Альбом будет зашифрован вашим паролем. Его можно передать родственникам — пароль сообщите отдельно.'}
      </p>
      <div className="form-grid one">
        <div className="field">
          <label htmlFor="c_title">Название альбома</label>
          <input id="c_title" value={title} maxLength={200} placeholder="Например: Семья Ивановых" autoFocus onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c_desc">Описание (необязательно)</label>
          <textarea id="c_desc" value={description} placeholder="Чья это семья, откуда родом…" onChange={e => setDescription(e.target.value)} />
        </div>
        {mode === 'create' && (
          <div className="photo-card cover-pick">
            <div className="photo-main-content">
              <div className="photo-main-preview square">{coverUrl ? <img src={coverUrl} alt="Обложка" /> : <Icon name="image" size={30} />}</div>
              <div>
                <div className="photo-title">Обложка (необязательно)</div>
                <div className="photo-hint">Будет на первой странице PDF-книги</div>
                <div className="photo-actions">
                  <button
                    type="button"
                    onClick={async () => {
                      const [f] = await pickFiles('image/jpeg,image/png,image/webp');
                      if (f) setCover(f);
                    }}
                  >
                    <Icon name="upload" /> Выбрать
                  </button>
                  {cover && (
                    <button type="button" className="ghost danger" onClick={() => setCover(null)}>
                      <Icon name="x" /> Убрать
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <PasswordField id="c_pw" label="Пароль (не короче 8 символов)" value={pw} onChange={setPw} showStrength autoComplete="new-password" />
        <PasswordField id="c_pw2" label="Пароль ещё раз" value={pw2} onChange={setPw2} autoComplete="new-password" />
      </div>
      <div className="archive-security warn">
        <Icon name="shield" />
        <span>
          <b>Запишите пароль.</b> Он нигде не хранится — если его забыть, открыть архив будет невозможно, и никто не сможет его восстановить.
        </span>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="start-actions">
        <button type="button" className="ghost" onClick={onBack} disabled={!!busy}>
          Назад
        </button>
        <button className="primary" disabled={!!busy}>
          <Icon name="lock" /> {mode === 'create' ? 'Создать альбом' : 'Создать архив'}
        </button>
      </div>
    </form>
  );
}
