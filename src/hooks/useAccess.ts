import { useMemo } from 'react';
import { makeAccess, type Access } from '../domain/access';
import { useArchive } from '../store/archiveStore';
import { useSession } from '../store/sessionStore';

let cache: { data: unknown; userId: string | undefined; access: Access } | null = null;

/** Права текущего пользователя (вне компонентов — в сценариях flows). Пересчитываются при правке архива. */
export function access(): Access {
  const data = useArchive.getState().data;
  const userId = useSession.getState().sk?.userId;
  if (cache && cache.data === data && cache.userId === userId) return cache.access;
  const user = data?.access.users.find(u => u.id === userId) ?? null;
  cache = { data, userId, access: makeAccess(user, data) };
  return cache.access;
}

/** Права текущего пользователя для компонентов: владелец — всё, участник — своя ветка. */
export function useAccess(): Access {
  const data = useArchive(s => s.data);
  const userId = useSession(s => s.sk?.userId);
  return useMemo(() => {
    void data;
    void userId;
    return access();
  }, [data, userId]);
}
