import { useEffect, useRef, useState } from 'react';
import { fullName } from '../../domain/people';
import type { MediaItem } from '../../domain/types';
import { facesAvailable, facesReady, learnFace, matchFaces, type FaceMatch } from '../../faces/faces';
import { useArchive } from '../../store/archiveStore';
import { Icon } from '../../ui/Icon';

export interface FaceScan {
  status: 'idle' | 'busy' | 'done' | 'error';
  msg: string;
  matches: FaceMatch[];
  /** лицо под курсором в списке вопросов — подсветить рамку */
  hover: number | null;
  setHover(i: number | null): void;
  run(): void;
}

/** Поиск лиц на текущем фото. Сам запускается, если движок уже загружен или фото только что добавили. */
export function useFaceScan(item: MediaItem | undefined, enabled: boolean, auto: boolean): FaceScan {
  const [state, setState] = useState<{ id: string | null; status: FaceScan['status']; msg: string; matches: FaceMatch[] }>({ id: null, status: 'idle', msg: '', matches: [] });
  const [hover, setHover] = useState<number | null>(null);
  const started = useRef<string | null>(null);
  const ok = facesAvailable && !!item && enabled && item.kind === 'photo';

  const run = () => {
    if (!item || !ok) return;
    const id = item.id;
    started.current = id;
    setState(s => ({ id, status: 'busy', msg: 'Ищу лица…', matches: s.id === id ? s.matches : [] }));
    const data = useArchive.getState().data!;
    const current = data.media.find(m => m.id === id) ?? item;
    matchFaces(data, current, msg => started.current === id && setState(s => (s.id === id ? { ...s, msg } : s)))
      .then(matches => started.current === id && setState({ id, status: 'done', msg: matches.length ? '' : 'Лиц не нашлось', matches }))
      .catch(() => started.current === id && setState({ id, status: 'error', msg: 'Распознавание недоступно в этом браузере', matches: [] }));
  };

  // новое фото — с чистого листа; автозапуск, если движок уже загружен или просили
  useEffect(() => {
    started.current = null;
    setHover(null);
    setState({ id: item?.id ?? null, status: 'idle', msg: '', matches: [] });
    if (ok && (auto || facesReady())) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, ok]);

  // отметили или ответили «нет» — пересчитать подсказки (лица уже найдены, это быстро)
  const peopleKey = item ? item.people.join(',') + '|' + (item.notPeople ?? []).join(',') : '';
  useEffect(() => {
    if (started.current === item?.id && state.status === 'done') run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  const mine = state.id === item?.id;
  return { status: mine ? state.status : 'idle', msg: mine ? state.msg : '', matches: mine ? state.matches : [], hover, setHover, run };
}

/** Рамки лиц поверх фото: узнанные — с именем, предложения — с вопросом. */
export function FaceBoxes({ scan }: { scan: FaceScan }) {
  const persons = useArchive(s => s.data!.persons);
  const name = (id: string) => {
    const p = persons.find(x => x.id === id);
    return p ? p.firstName || fullName(p) : '';
  };
  if (!scan.matches.length) return null;
  return (
    <div className="lb-faces" aria-hidden>
      {scan.matches.map((m, i) => (
        <div
          key={i}
          className={'lb-face' + (m.knownId ? ' known' : m.suggestId ? ' suggest' : '') + (scan.hover === i ? ' hot' : '')}
          style={{ left: `${m.face.box.x * 100}%`, top: `${m.face.box.y * 100}%`, width: `${m.face.box.w * 100}%`, height: `${m.face.box.h * 100}%` }}
        >
          {(m.knownId || m.suggestId) && <span className="lb-face-name">{m.knownId ? name(m.knownId) : `${name(m.suggestId!)}?`}</span>}
        </div>
      ))}
    </div>
  );
}

/** Вопросы «Кажется, это Петя? Да / Нет» и кнопка «Кто на фото?». */
export function FaceQuestions({ item, scan }: { item: MediaItem; scan: FaceScan }) {
  const persons = useArchive(s => s.data!.persons);
  const asks = scan.matches.map((m, i) => ({ m, i })).filter(x => x.m.suggestId);
  const yes = (m: FaceMatch) => {
    learnFace(m.suggestId!, m.face);
    const cur = useArchive.getState().data!.media.find(x => x.id === item.id);
    if (cur && !cur.people.includes(m.suggestId!)) useArchive.getState().setMediaPeople(item.id, [...cur.people, m.suggestId!]);
    scan.setHover(null);
  };
  const no = (m: FaceMatch) => {
    useArchive.getState().rejectFaceMatch(item.id, m.suggestId!);
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
                <button className="lb-ask-yes" onClick={() => yes(m)}>
                  <Icon name="check" size={14} /> Да
                </button>
                <button className="lb-ask-no" onClick={() => no(m)}>
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
    const unknown = scan.matches.filter(m => !m.knownId && !m.suggestId).length;
    const text = scan.msg || (unknown ? `Не узнал: ${unknown}` : '');
    return text ? <span className="lb-scan-status">{text}</span> : null;
  }
  return (
    <button className="lb-chip scan" title="Найти лица и узнать родных — на этом устройстве, фото никуда не отправляется" onClick={scan.run}>
      <Icon name="scan-face" size={15} /> Кто на фото?
    </button>
  );
}
