import { useMemo, useState } from 'react';
import type { MergeChoices, MergeItem } from '../../domain/merge';
import { useSession } from '../../store/sessionStore';
import { Icon } from '../../ui/Icon';

const ACTION: Record<MergeItem['action'], string> = { add: 'Добавлено', update: 'Изменено', delete: 'Удалено' };
const ENTITY: Record<MergeItem['entity'], string> = { person: 'человек', relation: 'связь', media: 'файл', story: 'история' };

/** Слияние: что прислал участник, конфликты (выбор «моё / её») и отклонённые правки. */
export function MergeDialog() {
  const merge = useSession(s => s.merge);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [fields, setFields] = useState<Map<string, Record<string, 'mine' | 'theirs'>>>(new Map());
  const [side, setSide] = useState<Map<string, 'mine' | 'theirs'>>(new Map());
  const names = useMemo(() => new Map((merge?.plan.authors ?? []).map(u => [u.id, u.name || u.login])), [merge]);
  if (!merge) return null;
  const { plan } = merge;
  const conflicts = plan.items.filter(i => i.conflict);
  const accepted = plan.items.filter(i => !skip.has(i.key)).length;

  const toggle = (key: string) =>
    setSkip(s => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const pickField = (key: string, field: string, v: 'mine' | 'theirs') =>
    setFields(m => new Map(m).set(key, { ...(m.get(key) ?? {}), [field]: v }));

  const apply = () => {
    const choices: MergeChoices = { skip, fields, side };
    useSession.getState().applyMerge(choices);
  };

  return (
    <div className="overlay open">
      <div className="modal merge-modal">
        <div className="modal-header">
          <div>
            <h2>Объединение с копией</h2>
            <p>
              {merge.fileName} · правки: {plan.authors.map(u => u.name || u.login).join(', ') || 'нет'}
            </p>
          </div>
          <button className="icon-button ghost" title="Закрыть" onClick={() => useSession.getState().cancelMerge()}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          {!plan.items.length && !plan.rejected.length && (
            <div className="sp-empty">В этой копии нет новых правок участников — объединять нечего.</div>
          )}

          {conflicts.length > 0 && (
            <div className="merge-note warn">
              <Icon name="info" />
              <span>
                <b>Конфликты: {conflicts.length}.</b> Эти записи меняли и вы, и участник. Выберите, что оставить.
              </span>
            </div>
          )}

          {plan.items.map(it => (
            <div key={it.key} className={'merge-item' + (it.conflict ? ' conflict' : '') + (skip.has(it.key) ? ' off' : '')}>
              <label className="merge-head">
                <input type="checkbox" checked={!skip.has(it.key)} onChange={() => toggle(it.key)} />
                <span className={'merge-badge ' + it.action}>{ACTION[it.action]}</span>
                <span className="merge-title">
                  <b>{it.title}</b>
                  <small>
                    {ENTITY[it.entity]} · {names.get(it.by) ?? 'участник'}
                  </small>
                </span>
              </label>
              {it.conflict && it.fields && !skip.has(it.key) && (
                <table className="merge-fields">
                  <thead>
                    <tr>
                      <th>Поле</th>
                      <th>Моё</th>
                      <th>{names.get(it.by) ?? 'Её'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {it.fields.map(f => {
                      const v = fields.get(it.key)?.[f.field] ?? 'mine';
                      return (
                        <tr key={f.field}>
                          <td>{f.label}</td>
                          <td>
                            <label className={'merge-pick' + (v === 'mine' ? ' on' : '')}>
                              <input type="radio" checked={v === 'mine'} onChange={() => pickField(it.key, f.field, 'mine')} /> {f.mine}
                            </label>
                          </td>
                          <td>
                            <label className={'merge-pick' + (v === 'theirs' ? ' on' : '')}>
                              <input type="radio" checked={v === 'theirs'} onChange={() => pickField(it.key, f.field, 'theirs')} /> {f.theirs}
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {it.conflict && !it.fields && !skip.has(it.key) && (
                <div className="merge-side">
                  {(['mine', 'theirs'] as const).map(v => (
                    <label key={v} className={'merge-pick' + ((side.get(it.key) ?? 'mine') === v ? ' on' : '')}>
                      <input type="radio" checked={(side.get(it.key) ?? 'mine') === v} onChange={() => setSide(m => new Map(m).set(it.key, v))} />{' '}
                      {v === 'mine' ? 'Оставить как у меня' : it.action === 'delete' ? 'Удалить, как у участника' : 'Взять версию участника'}
                    </label>
                  ))}
                </div>
              )}
              {!it.conflict && it.fields && it.fields.length > 0 && (
                <div className="merge-changed">Поля: {it.fields.map(f => f.label.toLowerCase()).join(', ')}</div>
              )}
            </div>
          ))}

          {plan.rejected.length > 0 && (
            <>
              <div className="sp-section-title" style={{ marginTop: 18 }}>
                Не будут приняты — нет прав ({plan.rejected.length})
              </div>
              {plan.rejected.map((r, i) => (
                <div key={i} className="merge-rejected">
                  <Icon name="lock" size={14} />
                  <span>
                    <b>{r.title}</b> — {r.reason}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={() => useSession.getState().cancelMerge()}>
            Отмена
          </button>
          <button className="primary" disabled={!accepted} onClick={apply}>
            <Icon name="users" /> Объединить ({accepted})
          </button>
        </div>
      </div>
    </div>
  );
}
