import { useState } from 'react';
import { ArchiveError } from '../../archive/container';
import { useSession } from '../../store/sessionStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { PasswordField } from './PasswordField';

/** Смена пароля: архив полностью перешифровывается новым ключом и сразу сохраняется. */
export function ChangePasswordDialog({ onClose }: { onClose(): void }) {
  const [oldPw, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const busy = useSession(s => s.busy);

  const submit = async () => {
    setError('');
    if (pw.length < 8) return setError('Новый пароль — не короче 8 символов');
    if (pw !== pw2) return setError('Пароли не совпадают');
    try {
      await useSession.getState().changePassword(oldPw, pw);
      useUi.getState().showToast('Пароль изменён — архив перешифрован');
      onClose();
    } catch (e) {
      setError(e instanceof ArchiveError ? e.message : 'Не удалось изменить пароль');
    }
  };

  return (
    <div className="overlay open" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className="modal pw-modal"
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="modal-header">
          <div>
            <h2>Изменить пароль</h2>
            <p>Архив будет полностью перешифрован и сохранён</p>
          </div>
          <button type="button" className="icon-button ghost" title="Закрыть" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          <PasswordField id="cp_old" label="Текущий пароль" value={oldPw} onChange={setOld} autoFocus />
          <PasswordField id="cp_new" label="Новый пароль" value={pw} onChange={setPw} showStrength autoComplete="new-password" />
          <PasswordField id="cp_new2" label="Новый пароль ещё раз" value={pw2} onChange={setPw2} autoComplete="new-password" />
          {error && <div className="form-error">{error}</div>}
          <div className="archive-security">
            <Icon name="info" />
            <span>Старые копии файла останутся со старым паролем. Передайте родственникам новый файл и новый пароль.</span>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="ghost" onClick={onClose} disabled={!!busy}>
            Отмена
          </button>
          <button className="primary" disabled={!!busy || !oldPw || !pw}>
            {busy || 'Изменить пароль'}
          </button>
        </div>
      </form>
    </div>
  );
}
