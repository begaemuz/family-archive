import { useMemo, useState } from 'react';
import { fullName } from '../../domain/people';
import type { AccessRight, AccessUser, Person } from '../../domain/types';
import { useArchive } from '../../store/archiveStore';
import { useSession } from '../../store/sessionStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { PersonAvatar } from '../stories/PeopleAvatars';
import { PasswordField } from './PasswordField';

const RIGHTS: { key: AccessRight; label: string; hint: string }[] = [
  { key: 'change', label: 'Менять', hint: 'править данные, фото, биографию' },
  { key: 'add', label: 'Добавлять', hint: 'новых родственников, файлы, истории' },
  { key: 'delete', label: 'Удалять', hint: 'людей, связи и файлы' },
];

/** Выбор человека — корня ветки: поиск по имени. */
function PersonPicker({ value, onChange }: { value: string | null; onChange(id: string | null): void }) {
  const persons = useArchive(s => s.data!.persons);
  const [q, setQ] = useState('');
  const chosen = persons.find(p => p.id === value) ?? null;
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? persons.filter(p => fullName(p).toLowerCase().includes(t)).slice(0, 6) : [];
  }, [q, persons]);
  if (chosen)
    return (
      <div className="acc-chosen">
        <PersonAvatar person={chosen} size={30} />
        <b>{fullName(chosen)}</b>
        <button type="button" className="ghost" onClick={() => onChange(null)}>
          Другой человек
        </button>
      </div>
    );
  return (
    <div className="acc-picker">
      <input value={q} autoComplete="off" placeholder="Начните вводить имя — например, Альбина" onChange={e => setQ(e.target.value)} />
      {found.length > 0 && (
        <div className="map-results">
          {found.map(p => (
            <button type="button" key={p.id} className="map-result" onClick={() => onChange(p.id)}>
              <PersonAvatar person={p} size={24} />
              <span>{fullName(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RightsBoxes({ can, onChange }: { can: AccessUser['can']; onChange(c: AccessUser['can']): void }) {
  return (
    <div className="acc-rights">
      <label className="acc-right on" title="Видит весь архив: дерево, фото, истории">
        <input type="checkbox" checked disabled /> <b>Читать</b> <small>весь архив — всегда</small>
      </label>
      {RIGHTS.map(r => (
        <label key={r.key} className={'acc-right' + (can[r.key] ? ' on' : '')}>
          <input type="checkbox" checked={can[r.key]} onChange={e => onChange({ ...can, [r.key]: e.target.checked })} /> <b>{r.label}</b> <small>{r.hint}</small>
        </label>
      ))}
    </div>
  );
}

/** Форма доступа: новый (с паролем) или изменение существующего. */
function UserForm({ user, onDone }: { user: AccessUser | null; onDone(created?: AccessUser): void }) {
  const [name, setName] = useState(user?.name ?? '');
  const [login, setLogin] = useState(user?.login ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [scope, setScope] = useState<'all' | 'branch'>(user && !user.root ? 'all' : 'branch');
  const [root, setRoot] = useState<string | null>(user?.root ?? null);
  const [can, setCan] = useState<AccessUser['can']>(user?.can ?? { change: true, add: true, delete: false });
  const [error, setError] = useState('');
  const busy = useSession(s => s.busy);

  const submit = async () => {
    setError('');
    if (!login.trim()) return setError('Укажите логин');
    if (scope === 'branch' && !root) return setError('Выберите человека — с него начнётся ветка');
    if (!user) {
      if (pw.length < 8) return setError('Пароль — не короче 8 символов');
      if (pw !== pw2) return setError('Пароли не совпадают');
    }
    const s = useSession.getState();
    try {
      if (user) {
        if (login.trim().toLowerCase() !== user.login) await s.setUserLogin(user.id, login);
        s.updateUser(user.id, { name: name.trim() || login.trim(), root: scope === 'all' ? null : root, can });
        onDone();
      } else {
        const created = await s.addUser({ name, login, password: pw, root: scope === 'all' ? null : root, can });
        onDone(created);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <form
      className="acc-form"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="acc_name">Кто это</label>
          <input id="acc_name" value={name} placeholder="Например: Альбина" onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="acc_login">Логин</label>
          <input id="acc_login" value={login} autoCapitalize="none" spellCheck={false} autoComplete="off" placeholder="albina" onChange={e => setLogin(e.target.value)} />
        </div>
      </div>
      {!user && (
        <div className="form-grid">
          <PasswordField id="acc_pw" label="Пароль (не короче 8)" value={pw} onChange={setPw} showStrength autoComplete="new-password" />
          <PasswordField id="acc_pw2" label="Пароль ещё раз" value={pw2} onChange={setPw2} autoComplete="new-password" />
        </div>
      )}

      <div className="sp-section-title">Что можно менять</div>
      <div className="acc-scope">
        <label className={'acc-scope-opt' + (scope === 'branch' ? ' on' : '')}>
          <input type="radio" checked={scope === 'branch'} onChange={() => setScope('branch')} />
          <span>
            <b>Ветку человека</b>
            <small>Сам человек, все его предки и все их потомки (кровная родня), их супруги и люди, которых участник добавит сам.</small>
          </span>
        </label>
        {scope === 'branch' && <PersonPicker value={root} onChange={setRoot} />}
        <label className={'acc-scope-opt' + (scope === 'all' ? ' on' : '')}>
          <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
          <span>
            <b>Весь архив</b>
            <small>Без ограничения веткой — по выбранным ниже правам.</small>
          </span>
        </label>
      </div>

      <div className="sp-section-title">Права</div>
      <RightsBoxes can={can} onChange={setCan} />

      {error && <div className="form-error">{error}</div>}
      <div className="acc-form-actions">
        <button type="button" className="ghost" onClick={() => onDone()} disabled={!!busy}>
          Отмена
        </button>
        <button className="primary" disabled={!!busy}>
          {user ? 'Сохранить' : 'Выдать доступ'}
        </button>
      </div>
    </form>
  );
}

function rootName(persons: Person[], id: string | null) {
  if (!id) return 'весь архив';
  const p = persons.find(x => x.id === id);
  return p ? 'ветка: ' + fullName(p) : 'ветка (человек удалён)';
}

/** Новый пароль участнику (владелец задаёт — старый не нужен). */
function NewPassword({ user, onDone }: { user: AccessUser; onDone(): void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="acc-newpw"
      onSubmit={async e => {
        e.preventDefault();
        if (pw.length < 8) return setError('Не короче 8 символов');
        await useSession.getState().setUserPassword(user.id, pw);
        useUi.getState().showToast(`Новый пароль для ${user.name || user.login} задан — сохраните архив`);
        onDone();
      }}
    >
      <PasswordField id={'np_' + user.id} label={`Новый пароль для ${user.name || user.login}`} value={pw} onChange={setPw} autoComplete="new-password" autoFocus />
      {error && <div className="form-error">{error}</div>}
      <div className="acc-form-actions">
        <button type="button" className="ghost" onClick={onDone}>
          Отмена
        </button>
        <button className="primary">Задать</button>
      </div>
    </form>
  );
}

/** Доступы к архиву: владелец выдаёт участникам логины и права на свои ветки. */
export function AccessDialog({ onClose }: { onClose(): void }) {
  const users = useArchive(s => s.data!.access.users);
  const persons = useArchive(s => s.data!.persons);
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'form'; user: AccessUser | null } | { kind: 'pw'; user: AccessUser } | { kind: 'done'; user: AccessUser }>({ kind: 'list' });
  const [ownerLogin, setOwnerLogin] = useState<string | null>(null);
  const owner = users.find(u => u.role === 'owner')!;
  const members = users.filter(u => u.role === 'member');

  const body = (() => {
    if (mode.kind === 'form') return <UserForm user={mode.user} onDone={created => setMode(created ? { kind: 'done', user: created } : { kind: 'list' })} />;
    if (mode.kind === 'pw') return <NewPassword user={mode.user} onDone={() => setMode({ kind: 'list' })} />;
    if (mode.kind === 'done')
      return (
        <div className="acc-done">
          <div className="confirm-icon neutral">
            <Icon name="key" size={24} />
          </div>
          <h3>Доступ для «{mode.user.name}» готов</h3>
          <ol>
            <li>
              <b>Сохраните архив</b> — доступ записывается в файл.
            </li>
            <li>
              <b>Отправьте файл .family</b> — {mode.user.name} откроет его на сайте.
            </li>
            <li>
              <b>Сообщите логин «{mode.user.login}» и пароль</b> — лучше отдельным сообщением, не вместе с файлом.
            </li>
            <li>
              Когда пришлют файл обратно — меню архива → <b>«Объединить с копией»</b>: правки попадут в ваш архив.
            </li>
          </ol>
          <div className="acc-form-actions">
            <button className="ghost" onClick={() => setMode({ kind: 'list' })}>
              К списку доступов
            </button>
            <button
              className="primary"
              onClick={async () => {
                if (await useSession.getState().save()) onClose();
              }}
            >
              <Icon name="save" /> Сохранить архив
            </button>
          </div>
        </div>
      );
    return (
      <>
        <div className="acc-card owner">
          <span className="acc-ico">
            <Icon name="shield" size={18} />
          </span>
          <div className="acc-main">
            <b>Вы — владелец</b>
            <small>Все права, доступы и слияние копий</small>
            {ownerLogin === null ? (
              <small>
                Логин: <b>{owner.login || 'без логина — вход только по паролю'}</b>{' '}
                <button type="button" className="link-btn" onClick={() => setOwnerLogin(owner.login)}>
                  изменить
                </button>
              </small>
            ) : (
              <form
                className="acc-inline"
                onSubmit={async e => {
                  e.preventDefault();
                  try {
                    await useSession.getState().setUserLogin(owner.id, ownerLogin);
                    setOwnerLogin(null);
                  } catch (err) {
                    useUi.getState().showToast((err as Error).message);
                  }
                }}
              >
                <input value={ownerLogin} autoFocus autoCapitalize="none" spellCheck={false} placeholder="Пусто — вход только по паролю" onChange={e => setOwnerLogin(e.target.value)} />
                <button className="primary">OK</button>
                <button type="button" className="ghost" onClick={() => setOwnerLogin(null)}>
                  Отмена
                </button>
              </form>
            )}
          </div>
        </div>

        {members.map(u => (
          <div className="acc-card" key={u.id}>
            <span className="acc-ico">
              <Icon name="user" size={18} />
            </span>
            <div className="acc-main">
              <b>{u.name || u.login}</b>
              <small>
                логин «{u.login}» · {rootName(persons, u.root)}
              </small>
              <span className="acc-chips">
                <span className="acc-chip on">читать</span>
                {RIGHTS.map(r => (
                  <span key={r.key} className={'acc-chip' + (u.can[r.key] ? ' on' : '')}>
                    {r.label.toLowerCase()}
                  </span>
                ))}
              </span>
            </div>
            <div className="acc-actions">
              <button className="ghost icon-button" title="Изменить права и ветку" onClick={() => setMode({ kind: 'form', user: u })}>
                <Icon name="edit" />
              </button>
              <button className="ghost icon-button" title="Задать новый пароль" onClick={() => setMode({ kind: 'pw', user: u })}>
                <Icon name="key" />
              </button>
              <button
                className="ghost danger icon-button"
                title="Удалить доступ"
                onClick={async () => {
                  const ok = await useUi.getState().confirm({
                    title: 'Удалить доступ?',
                    body: (
                      <>
                        <b>{u.name || u.login}</b> больше не сможет открыть новые сохранения архива своим логином. Уже отправленные копии файла останутся у этого человека.
                      </>
                    ),
                    ok: 'Удалить доступ',
                  });
                  if (ok === true) useSession.getState().removeUser(u.id);
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
        ))}
        {!members.length && <div className="sp-empty">Пока доступ есть только у вас. Выдайте доступ родственнику — он сможет дополнять свою ветку.</div>}
        <button className="bio-add" onClick={() => setMode({ kind: 'form', user: null })}>
          <Icon name="plus" /> Выдать доступ
        </button>
      </>
    );
  })();

  return (
    <div className="overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal acc-modal">
        <div className="modal-header">
          <div>
            <h2>Доступы</h2>
            <p>Кто может открывать архив своим логином и что может менять</p>
          </div>
          <button className="icon-button ghost" title="Закрыть" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{body}</div>
      </div>
    </div>
  );
}
