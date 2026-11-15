import { Logo } from '../../ui/Logo';
import { ArchiveMenu } from './ArchiveMenu';

/** Верхняя плашка открытого архива: логотип и меню архива.
    Действия и индикатор несохранённых изменений — в правой панели (ActionDock), масштаб и тема — в нижней правой. */
export function TopBar() {
  return (
    <header className="topbar has-archive">
      <div className="brand">
        <div className="brand-logo">
          <Logo size={34} />
        </div>
      </div>
      <ArchiveMenu />
    </header>
  );
}
