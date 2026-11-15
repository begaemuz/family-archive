import { useEffect } from 'react';
import { askDeletePerson, confirmLeaveForm } from '../flows/personFlows';
import { useArchive } from '../store/archiveStore';
import { useSession } from '../store/sessionStore';
import { useUi } from '../store/uiStore';

/** Esc закрывает по одному слою; Delete — удалить выделенного (с подтверждением); Ctrl+S — сохранить. */
export function useHotkeys() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (useArchive.getState().data) useSession.getState().save();
        return;
      }
      if (e.key === 'Escape') {
        if (ui.confirmReq) return ui.resolveConfirm(false);
        if (ui.cropReq) return ui.resolveCrop(null);
        if (ui.lightbox) return ui.setLightbox(null);
        if (ui.relationReq) return ui.closeRelation();
        if (useSession.getState().pending) return useSession.getState().cancelPending();
        if (ui.panel.form) {
          if (await confirmLeaveForm()) ui.closeForm();
          return;
        }
        if (ui.storiesOpen) return ui.setStoriesOpen(false);
        if (ui.panel.open) return ui.closePanel();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        const overlay = document.querySelector('.overlay.open, .lightbox.open');
        if (overlay || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag || '')) return;
        if (ui.selectedId && useArchive.getState().data?.persons.some(p => p.id === ui.selectedId)) {
          e.preventDefault();
          askDeletePerson(ui.selectedId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
