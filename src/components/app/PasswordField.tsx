import { useState } from 'react';
import { passwordStrength } from '../../archive/crypto';
import { Icon } from '../../ui/Icon';

export function PasswordField({
  id,
  label,
  value,
  onChange,
  showStrength,
  autoFocus,
  autoComplete = 'current-password',
}: {
  id: string;
  label: string;
  value: string;
  onChange(v: string): void;
  showStrength?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const st = passwordStrength(value);
  return (
    <div className="pw-wrap">
      <div className="field pw-field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          spellCheck={false}
          onChange={e => onChange(e.target.value)}
        />
        <button type="button" className="ghost pw-eye" title={show ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShow(s => !s)}>
          <Icon name={show ? 'eye' : 'lock'} />
        </button>
      </div>
      {showStrength && value && (
        <div className={'pw-strength s' + st.score}>
          <span className="bar">
            <span />
          </span>
          {st.label}
        </div>
      )}
    </div>
  );
}
