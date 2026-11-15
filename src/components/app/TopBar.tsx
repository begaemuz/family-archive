import { useAccess } from '../../hooks/useAccess';
import { fullName } from '../../domain/people';
import { useArchive } from '../../store/archiveStore';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
import { ArchiveMenu } from './ArchiveMenu';

/** Верхняя плашка открытого архива: логотип и меню архива; у участника — кем вошёл и что может менять.
    Действия и индикатор несохранённых изменений — в правой панели (ActionDock), масштаб и тема — в нижней правой. */
export function TopBar() {
  const acc = useAccess();
  const persons = useArchive(s => s.data?.persons);
  const u = acc.user;
  const member = u && u.role === 'member' ? u : null;
  const root = member?.root ? persons?.find(p => p.id === member.root) : null;
  const rights = member ? (['change', 'add', 'delete'] as const).filter(r => member.can[r]).length : 0;
  return (
    <header className="topbar has-archive">
      <div className="brand">
        <div className="brand-logo">
          <Logo size={34} />
        </div>
      </div>
      <ArchiveMenu />
      {member && (
        <span className="role-chip" title={rights ? 'Менять можно только свою ветку; остальное — просмотр' : 'Доступ только для просмотра'}>
          <Icon name="user" size={14} />
          <b>{member.name || member.login}</b>
          <span className="label">{!rights ? 'только просмотр' : root ? `ветка: ${fullName(root)}` : 'весь архив'}</span>
        </span>
      )}
    </header>
  );
}
