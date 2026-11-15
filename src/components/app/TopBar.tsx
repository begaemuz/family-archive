import { Icon } from '../../ui/Icon';
import { ArchiveMenu } from './ArchiveMenu';
import { SaveStatus } from './SaveStatus';

/** Верхняя плашка открытого архива: логотип, меню архива и состояние сохранения.
    Действия — в правой панели (ActionDock), масштаб и тема — в нижней правой. */
export function TopBar() {
  return (
    <header className="topbar has-archive">
      <div className="brand">
        <div className="brand-logo">
          <Icon name="tree" />
        </div>
      </div>
      <ArchiveMenu />
      <SaveStatus />
    </header>
  );
}
