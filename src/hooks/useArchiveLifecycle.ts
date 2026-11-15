import { useEffect } from 'react';
import { useArchive } from '../store/archiveStore';
import { useSession } from '../store/sessionStore';

/** Защита от потери: зашифрованный снимок архива через 2 с после правки (переживает обновление страницы) + предупреждение при закрытии. */
export function useArchiveLifecycle() {
  const revision = useArchive(s => s.revision);
  const status = useArchive(s => s.status);

  useEffect(() => {
    useSession.getState().checkDraft();
  }, []);

  useEffect(() => {
    if (!revision) return;
    const t = setTimeout(() => useSession.getState().autosaveDraft(), 2000);
    return () => clearTimeout(t);
  }, [revision]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useArchive.getState().data && useArchive.getState().status !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);
}
