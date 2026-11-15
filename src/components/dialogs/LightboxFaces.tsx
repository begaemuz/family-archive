import { useEffect, useMemo, useState } from 'react';
import { fullName } from '../../domain/people';
import type { MediaItem } from '../../domain/types';
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

  const run = () => {
    if (!item || !canRun || busy?.id === item.id) return;
    const id = item.id;
    setError(null);
    setBusy({ id, msg: 'Ищу лица…' });
    const d = useArchive.getState().data!;
    const current = d.media.find(m => m.id === id) ?? item;
    matchFaces(d, current, msg => setBusy(b => (b?.id === id ? { id, msg } : b)))
      .then(matches => useArchive.getState().setMediaFaces(id, toMediaFaces(matches)))
      .catch(() => setError({ id, msg: 'Распознавание недоступно в этом браузере' }))
      .finally(() => setBusy(b => (b?.id === id ? null : b)));
  };

  useEffect(() => {
    setHover(null);
    // только что загруженное фото, которое ещё не проверяли, — проверить сразу
    if (canRun && auto && !item?.faces) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, canRun]);

  const id = item?.id;
  const status: FaceScan['status'] = busy?.id === id ? 'busy' : error?.id === id ? 'error' : saved ? 'done' : 'idle';
  const msg = busy && busy.id === id ? busy.msg : error && error.id === id ? error.msg : saved && !saved.length ? 'Лиц не нашлось' : '';
  return { status, msg, matches: saved ?? [], canAsk: canRun, hover, setHover, run };
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
    <div className={'lb-faces' + (scan.hover !== null ? ' show' : '')} aria-hidden>
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
    const unknown = scan.matches.filter(m => !m.knownId && !m.suggestId).length;
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
