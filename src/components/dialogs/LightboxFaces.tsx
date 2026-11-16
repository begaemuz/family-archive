import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { fullName } from '../../domain/people';
import type { MediaItem } from '../../domain/types';
import { FACES_VERSION } from '../../domain/normalize';
import { facesAvailable, matchFaces, savedMatches, toMediaFaces, type FaceMatch } from '../../faces/faces';
import { useArchive } from '../../store/archiveStore';
import { Icon } from '../../ui/Icon';

export interface FaceScan {
  status: 'idle' | 'busy' | 'done' | 'error';
  msg: string;
  matches: FaceMatch[];
  /** можно спрашивать «Это …?» и запускать распознавание (есть право менять отметки) */
  canAsk: boolean;
  /** лицо под курсором в списке вопросов — подсветить рамку */
  hover: number | null;
  setHover(i: number | null): void;
  run(): void;
}

/** Лица на текущем фото. Найденные лица хранятся в архиве: после перезапуска рамки и вопросы на месте,
    искать заново не нужно. Сам поиск — по кнопке или сразу после загрузки фото (auto). */
export function useFaceScan(item: MediaItem | undefined, enabled: boolean, auto: boolean): FaceScan {
  const data = useArchive(s => s.data);
  const [busy, setBusy] = useState<{ id: string; msg: string } | null>(null);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const canRun = facesAvailable && !!item && enabled && item.kind === 'photo';
  const saved = useMemo(() => (item?.faces && data ? savedMatches(data, item) : null), [data, item]);
  // лица найдены старой версией поиска (пропускала лица, рамки мимо) — найти заново, ответы перенесутся
  const stale = !!item?.faces && item.facesV !== FACES_VERSION;

  const run = () => {
    if (!item || !canRun || busy?.id === item.id) return;
    const id = item.id;
    setError(null);
    setBusy({ id, msg: 'Ищу лица…' });
    const d = useArchive.getState().data!;
    const current = d.media.find(m => m.id === id) ?? item;
    // всегда ищем заново: «Проверить снова» должна находить пропущенные лица, ответы переносятся
    matchFaces(d, current, msg => setBusy(b => (b?.id === id ? { id, msg } : b)), true)
      .then(matches => useArchive.getState().setMediaFaces(id, toMediaFaces(matches)))
      .catch(e => {
        console.error('Распознавание лиц:', e);
        setError({ id, msg: 'Не получилось обработать это фото' });
      })
      .finally(() => setBusy(b => (b?.id === id ? null : b)));
  };

  useEffect(() => {
    setHover(null);
    // только что загруженное фото, которое ещё не проверяли, или проверенное старой версией — проверить сразу
    if (canRun && ((auto && !item?.faces) || stale)) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, canRun]);

  const id = item?.id;
  const status: FaceScan['status'] = busy?.id === id ? 'busy' : error?.id === id ? 'error' : saved ? 'done' : 'idle';
  const visible = saved && !(stale && canRun) ? saved : null;
  const msg = busy && busy.id === id ? busy.msg : error && error.id === id ? error.msg : visible && !visible.some(m => !m.notFace) ? 'Лиц не нашлось' : '';
  return { status, msg, matches: visible ?? [], canAsk: canRun, hover, setHover, run };
}

/** Рамки лиц поверх фото: узнанные — с именем, предложения — с вопросом.
    Клик по рамке — «Кто это?»: исправить, если узнали неверно. */
export function FaceBoxes({ scan, item }: { scan: FaceScan; item: MediaItem }) {
  const persons = useArchive(s => s.data!.persons);
  const [menu, setMenu] = useState<number | null>(null);
  const boxEls = useRef(new Map<number, HTMLDivElement>());
  useEffect(() => setMenu(null), [item.id]);
  const name = (id: string) => {
    const p = persons.find(x => x.id === id);
    return p ? p.firstName || fullName(p) : '';
  };
  if (!scan.matches.length) return null;
  return (
    <div className={'lb-faces' + (scan.hover !== null || menu !== null ? ' show' : '') + (scan.canAsk ? ' editable' : '')}>
      {scan.matches.map((m, i) =>
        m.notFace ? null : (
        <div
          key={i}
          className={
            'lb-face' +
            (m.knownId ? ' known' : m.suggestId ? ' suggest' : '') +
            (scan.hover === i || menu === i ? ' hot' : '') +
            // под рамкой нет места до края фото (подпись ~30px) — подпись внутрь рамки
            (m.face.box.y + m.face.box.h > 0.86 ? ' label-in' : '') +
            // у левого/правого края фото подпись прижимается к краю рамки, а не по центру
            (m.face.box.x + m.face.box.w / 2 < 0.15 ? ' label-l' : m.face.box.x + m.face.box.w / 2 > 0.85 ? ' label-r' : '')
          }
          ref={el => {
            if (el) boxEls.current.set(i, el);
            else boxEls.current.delete(i);
          }}
          style={{ left: `${m.face.box.x * 100}%`, top: `${m.face.box.y * 100}%`, width: `${m.face.box.w * 100}%`, height: `${m.face.box.h * 100}%` }}
          title={scan.canAsk ? 'Кто это? Нажмите, чтобы исправить' : undefined}
          onClick={e => {
            if (!scan.canAsk) return;
            e.stopPropagation();
            setMenu(menu === i ? null : i);
          }}
        >
          {(m.knownId || m.suggestId) && <span className="lb-face-name">{m.knownId ? name(m.knownId) : `${name(m.suggestId!)}?`}</span>}
        </div>
        ),
      )}
      {menu !== null && scan.matches[menu] && (
        <FaceMenu item={item} index={menu} match={scan.matches[menu]} anchor={() => boxEls.current.get(menu) ?? null} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

/** «Кто это?» у одного лица: это не тот / это вот этот человек. */
function FaceMenu({ item, index, match, anchor, onClose }: { item: MediaItem; index: number; match: FaceMatch; anchor(): HTMLElement | null; onClose(): void }) {
  const data = useArchive(s => s.data!);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const current = match.knownId ?? match.suggestId;
  const cur = current ? data.persons.find(p => p.id === current) : null;
  const ownerId = data.persons.find(p => p.media.includes(item.id))?.id ?? null;
  const not = new Set(match.not ?? []);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const onPhoto = [...(ownerId ? [ownerId] : []), ...item.people];
    const pool = t ? data.persons.filter(p => fullName(p).toLowerCase().includes(t)) : onPhoto.map(id => data.persons.find(p => p.id === id)!).filter(Boolean);
    return pool.filter(p => p.id !== current).slice(0, 8);
  }, [q, data.persons, item.people, ownerId, current]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.lb-face') && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  // место на экране: под лицом, если влезает; иначе над ним; иначе — где больше места, со своей прокруткой.
  // По горизонтали — по центру лица, но не за краями экрана
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor()?.getBoundingClientRect();
    const m = ref.current?.getBoundingClientRect();
    if (!a || !m) return;
    const gap = 10;
    const pad = 8;
    const below = innerHeight - a.bottom - gap - pad;
    const above = a.top - gap - pad;
    const left = Math.min(Math.max(a.left + a.width / 2 - m.width / 2, pad), innerWidth - m.width - pad);
    if (m.height <= below) setPos({ left, top: a.bottom + gap });
    else if (m.height <= above) setPos({ left, top: a.top - gap - m.height });
    else if (below >= above) setPos({ left, top: a.bottom + gap, maxHeight: Math.max(160, below) });
    else setPos({ left, top: Math.max(pad, a.top - gap - Math.min(m.height, above)), maxHeight: Math.max(160, above) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const style: CSSProperties = pos
    ? { position: 'fixed', left: pos.left, top: pos.top, transform: 'none', maxHeight: pos.maxHeight, overflowY: pos.maxHeight ? 'auto' : undefined }
    : { position: 'fixed', left: 0, top: 0, visibility: 'hidden', transform: 'none' };
  const st = useArchive.getState();

  return (
    <div className="lb-face-menu" ref={ref} style={style} onClick={e => e.stopPropagation()}>
      <div className="lb-face-menu-title">Кто это?</div>
      {cur && (
        <button
          className="lb-face-menu-wrong"
          onClick={() => {
            st.unassignFace(item.id, index);
            onClose();
          }}
        >
          <Icon name="x" size={14} /> Это не {fullName(cur)}
        </button>
      )}
      <button
        className="lb-face-menu-notface"
        onClick={() => {
          st.notAFace(item.id, index);
          onClose();
        }}
      >
        <Icon name="eye-off" size={14} /> Это не лицо — убрать рамку
      </button>
      <input value={q} placeholder="Найти человека…" autoFocus onChange={e => setQ(e.target.value)} />
      <div className="lb-face-menu-list">
        {!q.trim() && list.length > 0 && <div className="lb-face-menu-hint">Отмечены на фото</div>}
        {list.map(p => (
          <button
            key={p.id}
            className={not.has(p.id) ? 'was-not' : ''}
            onClick={() => {
              st.assignFace(item.id, index, p.id);
              onClose();
            }}
          >
            <Icon name="user" size={14} /> {fullName(p)}
          </button>
        ))}
        {!list.length && <div className="lb-face-menu-hint">{q.trim() ? 'Никого не нашлось' : 'Начните вводить имя'}</div>}
      </div>
    </div>
  );
}

/** Вопросы «Кажется, это Петя? Да / Нет» и кнопка «Кто на фото?». */
export function FaceQuestions({ item, scan }: { item: MediaItem; scan: FaceScan }) {
  const persons = useArchive(s => s.data!.persons);
  const asks = scan.canAsk ? scan.matches.map((m, i) => ({ m, i })).filter(x => x.m.suggestId) : [];
  // «Да» — лицо запоминается за человеком (в архиве), и он отмечается на фото; «Нет» — больше не предлагать
  const yes = (i: number) => {
    useArchive.getState().confirmFace(item.id, i);
    scan.setHover(null);
  };
  const no = (i: number) => {
    useArchive.getState().rejectFace(item.id, i);
    scan.setHover(null);
  };

  return (
    <>
      {asks.length > 0 && (
        <div className="lb-asks" onClick={e => e.stopPropagation()}>
          {asks.map(({ m, i }) => {
            const p = persons.find(x => x.id === m.suggestId);
            if (!p) return null;
            return (
              <div className="lb-ask" key={i} onPointerEnter={() => scan.setHover(i)} onPointerLeave={() => scan.setHover(null)}>
                <Icon name="scan-face" size={16} />
                <span>
                  Кажется, это <b>{fullName(p)}</b>?
                </span>
                <button className="lb-ask-yes" onClick={() => yes(i)}>
                  <Icon name="check" size={14} /> Да
                </button>
                <button className="lb-ask-no" onClick={() => no(i)}>
                  Нет
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Кнопка в строке «На фото:». */
export function FaceScanButton({ scan }: { scan: FaceScan }) {
  if (!facesAvailable) return null;
  if (scan.status === 'busy')
    return (
      <span className="lb-scan-status">
        <span className="lb-spin" /> {scan.msg}
      </span>
    );
  if (scan.status === 'done' || scan.status === 'error') {
    const unknown = scan.matches.filter(m => !m.notFace && !m.knownId && !m.suggestId).length;
    const text = scan.msg || (unknown ? `Не узнал: ${unknown}` : '');
    // лица уже найдены и сохранены; «проверить снова» — сравнить с родными заново (например, после новых фото профиля)
    return (
      <span className="lb-scan-status">
        {text}
        <button className="lb-rescan" title="Проверить снова — сравнить лица с родными ещё раз" onClick={scan.run}>
          <Icon name="refresh" size={14} />
        </button>
      </span>
    );
  }
  return (
    <button className="lb-chip scan" title="Найти лица и узнать родных — на этом устройстве, фото никуда не отправляется" onClick={scan.run}>
      <Icon name="scan-face" size={15} /> Кто на фото?
    </button>
  );
}
