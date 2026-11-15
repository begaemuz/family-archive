import { useEffect, useRef, useState } from 'react';
import { useArchive } from '../../store/archiveStore';
import { useSession } from '../../store/sessionStore';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

/** Перетаскивание файла .family на страницу. Перетаскивание внутри страницы игнорируется. */
export function DropZone() {
  const [show, setShow] = useState(false);
  const depth = useRef(0);
  const internal = useRef(false);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !internal.current && [...(e.dataTransfer?.types || [])].includes('Files');
    const onStart = (e: DragEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.canvas, .side-panel, .person')) {
        e.preventDefault();
        return;
      }
      internal.current = true;
    };
    const onEnd = () => (internal.current = false);
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setShow(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setShow(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setShow(false);
      const file = e.dataTransfer!.files[0];
      if (!file) return;
      const ui = useUi.getState();
      const name = file.name.toLowerCase();
      if (useArchive.getState().data) {
        ui.showToast('Чтобы открыть другой архив, сначала закройте текущий (меню с названием архива)');
        return;
      }
      if (name.endsWith('.family')) useSession.getState().chooseFile(file, null);
      else ui.showToast('Нужен файл архива .family');
    };
    window.addEventListener('dragstart', onStart);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragstart', onStart);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <div className={'drop-zone' + (show ? ' show' : '')}>
      <div>
        <div className="empty-icon">
          <Icon name="download" size={32} />
        </div>
        Отпустите файл, чтобы открыть архив
        <small>Файл архива .family</small>
      </div>
    </div>
  );
}
