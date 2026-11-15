import { useEffect } from 'react';
import { DropZone } from './components/app/DropZone';
import { StartScreen } from './components/app/StartScreen';
import { TopBar } from './components/app/TopBar';
import { TreeCanvas } from './components/canvas/TreeCanvas';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { CropDialog } from './components/dialogs/CropDialog';
import { Lightbox } from './components/dialogs/Lightbox';
import { RelationTypeDialog } from './components/dialogs/RelationTypeDialog';
import { Toast } from './components/dialogs/Toast';
import { SidePanel } from './components/panel/SidePanel';
import { StoriesPanel } from './components/stories/StoriesPanel';
import { useArchiveLifecycle } from './hooks/useArchiveLifecycle';
import { useHotkeys } from './hooks/useHotkeys';
import { useArchive } from './store/archiveStore';
import { useUi } from './store/uiStore';

export function App() {
  const theme = useUi(s => s.theme);
  const hasArchive = useArchive(s => !!s.data);
  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);
  // боковая панель или истории открыты — плавающие панели справа отодвигаются от неё
  const sideOpen = useUi(s => s.panel.open || s.storiesOpen);
  useEffect(() => {
    document.body.classList.toggle('panel-open', sideOpen && hasArchive);
  }, [sideOpen, hasArchive]);
  useHotkeys();
  useArchiveLifecycle();

  return (
    <>
      {hasArchive ? (
        <>
          <TopBar />
          <main className="app">
            <TreeCanvas />
          </main>
          <SidePanel />
          <StoriesPanel />
        </>
      ) : (
        <StartScreen />
      )}
      <DropZone />
      <Lightbox />
      <RelationTypeDialog />
      <CropDialog />
      <ConfirmDialog />
      <Toast />
    </>
  );
}
