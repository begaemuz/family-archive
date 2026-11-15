import { formatSize, isPreviewable } from '../../archive/media';
import type { MediaItem, Person } from '../../domain/types';
import { prepareFiles } from '../../flows/mediaFlows';
import { askDeleteMedia } from '../../flows/personFlows';
import { downloadBlob, pickFiles } from '../../hooks/useFilePicker';
import { useArchive } from '../../store/archiveStore';
import { mediaRegistry } from '../../store/mediaRegistry';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.odt,.pptx,.txt,image/jpeg,image/png,image/webp';

/** Открыть документ: PDF/картинки/текст — в новой вкладке как blob с безопасным типом; остальное — скачать.
   HTML и скрипты в архив не попадают вовсе (проверка при добавлении и при открытии архива). */
function openDoc(m: MediaItem) {
  const blob = mediaRegistry.get(m.id);
  if (!blob) return;
  if (isPreviewable(m.mime)) {
    const url = URL.createObjectURL(new Blob([blob], { type: m.mime }));
    const w = window.open(url, '_blank', 'noopener');
    if (!w) downloadBlob(blob, m.name);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else downloadBlob(blob, m.name);
}

export function DocumentsTab({ person: p }: { person: Person }) {
  const media = useArchive(s => s.data!.media);
  const docs = p.documents.map(id => media.find(m => m.id === id)).filter((m): m is MediaItem => !!m);

  const add = async () => {
    const files = await pickFiles(ACCEPT, true);
    if (!files.length) return;
    const ready = await prepareFiles(files, ['document', 'photo']);
    if (!ready.length) return;
    const st = useArchive.getState();
    // скан документа (картинка) хранится как документ
    ready.forEach(r => st.addMedia({ ...r.item, kind: 'document' }, r.blob));
    st.updatePerson(p.id, { documents: [...(st.data!.persons.find(x => x.id === p.id)?.documents ?? []), ...ready.map(r => r.item.id)] });
    useUi.getState().showToast(`Добавлено документов: ${ready.length}`);
  };

  return (
    <div className="sp-body">
      <button className="bio-add doc-add" onClick={add}>
        <Icon name="plus" /> Добавить документ
      </button>
      <div className="doc-list">
        {docs.slice().reverse().map(m => (
          <div className="doc-item" key={m.id}>
            <span className="doc-ico">
              <Icon name="file" />
            </span>
            <button className="doc-meta" onClick={() => openDoc(m)} title={isPreviewable(m.mime) ? 'Открыть' : 'Скачать'}>
              <b>{m.name}</b>
              <small>
                {formatSize(m.size)} · {new Date(m.createdAt).toLocaleDateString('ru-RU')}
              </small>
            </button>
            <button className="ghost" title="Скачать" onClick={() => downloadBlob(mediaRegistry.get(m.id)!, m.name)}>
              <Icon name="download" />
            </button>
            <button className="ghost danger" title="Удалить" onClick={() => askDeleteMedia(m.id, p.id)}>
              <Icon name="trash" />
            </button>
          </div>
        ))}
      </div>
      {!docs.length && (
        <div className="sp-empty" style={{ marginTop: 14 }}>
          Свидетельства, справки, письма, сканы — PDF, Word, Excel, текст или фото
        </div>
      )}
    </div>
  );
}
