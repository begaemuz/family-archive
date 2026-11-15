/* Сеанс работы с архивом: создание, вход по логину и паролю, сохранение, доступы, смена пароля, слияние, закрытие.
   Ключ данных живёт только в памяти; пароли не хранятся нигде. Для каждого пользователя ключ данных
   «завёрнут» в его ячейку (keys.ts) — владелец и участники открывают один и тот же файл своими логинами. */
import { create } from 'zustand';
import { ArchiveError, openContainer, sealContainer, unlockContainer, unlockWithKey } from '../archive/container';
import { clearDraft, draftInfo, restoreDraft, saveDraft, type DraftInfo } from '../archive/draftStore';
import { safeFileName, writeArchive, type FSHandle } from '../archive/fileAccess';
import { APP_VERSION, packArchive, unpackArchive } from '../archive/format';
import { loginTag, makeSlot, newSession, openSlot, type SessionKey } from '../archive/keys';
import { importLegacyJson, importLegacyZip } from '../archive/legacyImport';
import { applyMerge, planMerge, type MergeChoices, type MergePlan } from '../domain/merge';
import { createMeta, newId, normLogin, ownerUser } from '../domain/normalize';
import type { AccessUser, ArchiveData } from '../domain/types';
import { useArchive } from './archiveStore';
import { mediaRegistry } from './mediaRegistry';
import { useUi } from './uiStore';

type FileHandle = FSHandle | null;

interface PendingOpen {
  file: File;
  handle: FileHandle;
}

export interface NewUser {
  name: string;
  login: string;
  password: string;
  root: string | null;
  can: AccessUser['can'];
}

interface PendingMerge {
  fileName: string;
  theirs: ArchiveData;
  blobs: Map<string, Blob>;
  plan: MergePlan;
}

interface SessionState {
  sk: SessionKey | null;
  fileName: string;
  handle: FileHandle;
  /** выбран файл, ждём логин и пароль */
  pending: PendingOpen | null;
  /** импорт старого дерева: ждём название и пароль нового архива */
  pendingImport: { data: ArchiveData; blobs: Map<string, Blob>; missing: number } | null;
  draft: DraftInfo | null;
  busy: string | null;
  /** открыта копия для слияния — ждём решения владельца */
  merge: PendingMerge | null;

  checkDraft(): Promise<void>;
  createArchive(o: { title: string; description: string; login: string; password: string; cover?: Blob | null }): Promise<void>;
  chooseFile(file: File, handle: FileHandle): void;
  cancelPending(): void;
  unlock(login: string, password: string): Promise<void>;
  restore(login: string, password: string): Promise<void>;
  discardDraft(): Promise<void>;
  importLegacy(file: File): Promise<void>;
  finishImport(o: { title: string; description: string; login: string; password: string }): Promise<void>;
  save(opts?: { as?: boolean }): Promise<boolean>;
  changePassword(oldPw: string, newPw: string): Promise<void>;
  closeArchive(): Promise<void>;
  autosaveDraft(): Promise<void>;

  // доступы (только владелец)
  addUser(u: NewUser): Promise<AccessUser>;
  updateUser(id: string, patch: Partial<Pick<AccessUser, 'name' | 'root' | 'can'>>): void;
  setUserLogin(id: string, login: string): Promise<void>;
  setUserPassword(id: string, password: string): Promise<void>;
  removeUser(id: string): void;

  // слияние (только владелец)
  openMerge(file: File): Promise<void>;
  applyMerge(choices: MergeChoices): void;
  cancelMerge(): void;
}

const archive = () => useArchive.getState();
let snapshotQueue: Promise<void> = Promise.resolve();
const ui = () => useUi.getState();

/** Кто вошёл: пользователь архива по id из ячейки. */
export function currentUser(): AccessUser | null {
  const sk = useSession.getState().sk;
  const d = archive().data;
  return (sk && d?.access.users.find(u => u.id === sk.userId)) || null;
}

function loginTaken(d: ArchiveData, login: string, exceptId?: string) {
  const l = normLogin(login);
  return d.access.users.some(u => u.id !== exceptId && u.login === l);
}

/** Открыть данные архива в редакторе от имени пользователя. */
function openAs(data: ArchiveData, blobs: Map<string, Blob>, sk: SessionKey) {
  archive().open(data, blobs);
  archive().setActor(sk.userId);
  loginSucceeded();
}

/* Вход проходит без перезагрузки и без запросов в сеть, поэтому браузер не понимает, что пароль подошёл,
   и предлагает «Сохранить пароль» позже — при первом же запросе (например, загрузке распознавания лиц).
   Навигация внутри страницы (replaceState) — сигнал для браузера: вход удался, спросить сейчас, а не потом. */
function loginSucceeded() {
  setTimeout(() => {
    try {
      history.replaceState(history.state, '', location.href);
    } catch {
      /* не страшно */
    }
  }, 0);
}

export const useSession = create<SessionState>((set, get) => ({
  sk: null,
  fileName: '',
  handle: null,
  pending: null,
  pendingImport: null,
  draft: null,
  busy: null,
  merge: null,

  async checkDraft() {
    set({ draft: await draftInfo() });
  },

  async createArchive({ title, description, login, password, cover }) {
    set({ busy: 'Создаю зашифрованный архив…' });
    try {
      const owner = { ...ownerUser(), login: normLogin(login) };
      const meta = createMeta(title, description);
      const sk = await newSession(meta.id, owner.id, owner.login, password);
      const data: ArchiveData = { meta, persons: [], relations: [], media: [], stories: [], history: [], access: { users: [owner] }, deleted: [] };
      const blobs = new Map<string, Blob>();
      if (cover) {
        const { addCoverToData } = await import('../flows/mediaFlows');
        await addCoverToData(data, blobs, cover);
      }
      data.history.push({ ts: Date.now(), action: 'create', entity: 'archive', id: data.meta.id, summary: 'Архив создан' });
      openAs(data, blobs, sk);
      archive().setStatus('dirty');
      set({ sk, fileName: safeFileName(data.meta.title), handle: null, draft: null });
      await get().autosaveDraft();
      ui().showToast('Архив создан. Не забудьте сохранить его — «Сохранить архив»');
    } finally {
      set({ busy: null });
    }
  },

  chooseFile(file, handle) {
    set({ pending: { file, handle } });
  },

  cancelPending() {
    set({ pending: null });
  },

  async unlock(login, password) {
    const p = get().pending;
    if (!p) return;
    set({ busy: 'Проверяю логин и пароль…' });
    try {
      const u = await unlockContainer(p.file, login, password);
      set({ busy: 'Расшифровываю архив…' });
      const payload = await openContainer(p.file, u.fileKey);
      const { data, blobs, skipped } = await unpackArchive(payload);
      const sk = u.sk;
      if (u.legacy) {
        // файл старого формата: заводим ячейку владельца тем же паролем — при сохранении файл станет v2
        const owner = data.access.users.find(x => x.role === 'owner')!;
        sk.userId = owner.id;
        sk.slots = [await makeSlot(sk.raw, data.meta.id, owner.id, owner.login, password)];
      } else if (!data.access.users.some(x => x.id === sk.userId)) throw new ArchiveError('wrong-password');
      openAs(data, blobs, sk);
      set({ sk, fileName: p.handle?.name || p.file.name, handle: p.handle, pending: null, draft: null });
      await get().autosaveDraft();
      ui().requestFit();
      const me = currentUser();
      const who = me && me.role === 'member' ? ` — вы вошли как ${me.name || me.login}` : '';
      ui().showToast(skipped ? `Архив открыт, но ${skipped} файл(ов) не прошли проверку и пропущены` : `Архив «${data.meta.title}» открыт${who}`);
    } finally {
      set({ busy: null });
    }
  },

  async restore(login, password) {
    set({ busy: 'Восстанавливаю…' });
    try {
      const { data, blobs, sk, fileName, saved, handle, legacy } = await restoreDraft(login, password);
      if (legacy) {
        const owner = data.access.users.find(x => x.role === 'owner')!;
        sk.userId = owner.id;
        sk.slots = [await makeSlot(sk.raw, data.meta.id, owner.id, owner.login, password)];
      }
      openAs(data, blobs, sk);
      archive().setStatus(saved ? 'saved' : 'dirty');
      set({ sk, fileName, handle, draft: null });
      ui().requestFit();
      ui().showToast(saved ? `Архив «${data.meta.title}» открыт` : 'Несохранённые изменения восстановлены — сохраните архив');
    } finally {
      set({ busy: null });
    }
  },

  async discardDraft() {
    await clearDraft();
    set({ draft: null });
  },

  async importLegacy(file) {
    set({ busy: 'Читаю старое дерево…' });
    try {
      const isZip = /\.zip$/i.test(file.name);
      const res = isZip ? await importLegacyZip(new Uint8Array(await file.arrayBuffer())) : await importLegacyJson(await file.text());
      if (!res.data.persons.length) throw new Error('В файле нет людей');
      set({ pendingImport: { data: res.data, blobs: res.blobs, missing: res.missingPhotos } });
    } finally {
      set({ busy: null });
    }
  },

  async finishImport({ title, description, login, password }) {
    const pi = get().pendingImport;
    if (!pi) return;
    set({ busy: 'Создаю зашифрованный архив…' });
    try {
      const data = pi.data;
      const owner = data.access.users.find(x => x.role === 'owner')!;
      owner.login = normLogin(login);
      const sk = await newSession(data.meta.id, owner.id, owner.login, password);
      data.meta.title = title.trim() || data.meta.title;
      data.meta.description = description;
      data.history.push({ ts: Date.now(), action: 'create', entity: 'archive', id: data.meta.id, summary: `Импорт старого дерева: ${data.persons.length} чел.` });
      openAs(data, pi.blobs, sk);
      archive().setStatus('dirty');
      set({ sk, fileName: safeFileName(data.meta.title), handle: null, pendingImport: null, draft: null });
      await get().autosaveDraft();
      ui().requestFit();
      ui().showToast(`Перенесено людей: ${data.persons.length}${pi.missing ? `, не найдено фото: ${pi.missing}` : ''}. Сохраните архив`);
    } finally {
      set({ busy: null });
    }
  },

  async save(opts = {}) {
    const { sk } = get();
    const data = archive().data;
    if (!sk || !data) return false;
    archive().setStatus('saving');
    try {
      const payload = await packArchive(data, id => mediaRegistry.get(id));
      const blob = await sealContainer(payload, sk, data.meta.id, APP_VERSION);
      const res = await writeArchive(blob, {
        handle: get().handle,
        suggestedName: get().fileName || safeFileName(data.meta.title),
        forcePick: opts.as,
      });
      if (!res) {
        archive().setStatus('dirty');
        return false;
      }
      // если во время сохранения успели что-то изменить — статус остаётся «есть изменения»
      if (archive().data === data) archive().setStatus('saved');
      else archive().setStatus('dirty');
      set({ handle: res.handle, fileName: res.fileName });
      await get().autosaveDraft(); // снимок помнит, что всё сохранено, и ссылку на файл
      ui().showToast(res.method === 'file' ? `Сохранено в «${res.fileName}»` : `Архив скачан: «${res.fileName}»`);
      return true;
    } catch (e) {
      console.error(e);
      archive().setStatus('error');
      ui().showToast('Ошибка сохранения: ' + ((e as Error)?.message || 'неизвестная ошибка'));
      return false;
    }
  },

  /** Сменить свой пароль: ячейка перезаворачивается новым паролем (новая соль). Ключ данных прежний —
      поэтому у остальных пользователей ничего не ломается. */
  async changePassword(oldPw, newPw) {
    const { sk } = get();
    const data = archive().data;
    const me = currentUser();
    if (!sk || !data || !me) return;
    set({ busy: 'Проверяю текущий пароль…' });
    try {
      const ok = await openSlot(
        sk.slots.filter(s => s.userId === me.id),
        data.meta.id,
        me.login,
        oldPw,
      );
      if (!ok) throw new ArchiveError('wrong-password');
      set({ busy: 'Сохраняю новый пароль…' });
      const slot = await makeSlot(sk.raw, data.meta.id, me.id, me.login, newPw);
      set({ sk: { ...sk, slots: [...sk.slots.filter(s => s.userId !== me.id), slot] } });
      archive().apply(() => {}, { history: [{ action: 'update', entity: 'archive', id: data.meta.id, summary: `Пароль изменён: ${me.name || me.login || 'владелец'}` }] });
      await get().autosaveDraft();
    } finally {
      set({ busy: null });
    }
    // сразу сохраняем: файл должен открываться только новым паролем
    await get().save();
  },

  async closeArchive() {
    archive().close();
    archive().setActor('');
    ui().closePanel();
    ui().setStoriesOpen(false);
    ui().select(null);
    get().sk?.raw.fill(0); // ключ данных больше не нужен
    set({ sk: null, fileName: '', handle: null, pending: null, pendingImport: null, merge: null });
    await snapshotQueue; // дописывающийся снимок не должен «воскресить» закрытый архив
    await clearDraft();
    set({ draft: null });
  },

  async autosaveDraft() {
    // снимки пишутся строго по очереди, чтобы не перезаписать новый старым
    snapshotQueue = snapshotQueue.then(async () => {
      const { sk, fileName, handle } = get();
      const data = archive().data;
      if (!sk || !data) return;
      try {
        await saveDraft(sk, data, id => mediaRegistry.get(id), fileName, { saved: archive().status === 'saved', handle });
      } catch (e) {
        console.warn('Снимок архива не сохранён', e);
      }
    });
    return snapshotQueue;
  },

  /* ---------- доступы ---------- */

  async addUser({ name, login, password, root, can }) {
    const { sk } = get();
    const data = archive().data;
    if (!sk || !data || currentUser()?.role !== 'owner') throw new Error('Нет прав');
    const l = normLogin(login);
    if (!l) throw new Error('Укажите логин');
    if (loginTaken(data, l)) throw new Error('Такой логин уже есть');
    const now = Date.now();
    const user: AccessUser = { id: newId(), login: l, name: name.trim() || l, role: 'member', root, can, createdAt: now, syncedAt: now };
    set({ busy: 'Создаю доступ…' });
    try {
      const slot = await makeSlot(sk.raw, data.meta.id, user.id, l, password);
      set({ sk: { ...sk, slots: [...sk.slots, slot] } });
      archive().apply(d => d.access.users.push(user), { history: [{ action: 'create', entity: 'archive', id: user.id, summary: `Выдан доступ: ${user.name}` }] });
    } finally {
      set({ busy: null });
    }
    return user;
  },

  updateUser(id, patch) {
    archive().apply(
      d => {
        d.access.users = d.access.users.map(u => (u.id === id && u.role === 'member' ? { ...u, ...patch, can: { ...u.can, ...(patch.can ?? {}) } } : u));
      },
      { history: [{ action: 'update', entity: 'archive', id, summary: 'Доступ изменён' }] },
    );
  },

  /** Логин меняется без пароля: в ячейке хранится только хеш логина, сам ключ завёрнут паролем. */
  async setUserLogin(id, login) {
    const { sk } = get();
    const data = archive().data;
    if (!sk || !data) return;
    const l = normLogin(login);
    const u = data.access.users.find(x => x.id === id);
    if (!u) return;
    if (u.role === 'member' && !l) throw new Error('Укажите логин');
    if (loginTaken(data, l, id)) throw new Error('Такой логин уже есть');
    const tag = await loginTag(data.meta.id, l);
    set({ sk: { ...sk, slots: sk.slots.map(s => (s.userId === id ? { ...s, tag } : s)) } });
    archive().apply(
      d => {
        d.access.users = d.access.users.map(x => (x.id === id ? { ...x, login: l } : x));
      },
      { history: [{ action: 'update', entity: 'archive', id, summary: `Логин изменён: ${l || 'без логина'}` }] },
    );
  },

  async setUserPassword(id, password) {
    const { sk } = get();
    const data = archive().data;
    const u = data?.access.users.find(x => x.id === id);
    if (!sk || !data || !u) return;
    set({ busy: 'Сохраняю пароль…' });
    try {
      const slot = await makeSlot(sk.raw, data.meta.id, id, u.login, password);
      set({ sk: { ...sk, slots: [...sk.slots.filter(s => s.userId !== id), slot] } });
      archive().apply(() => {}, { history: [{ action: 'update', entity: 'archive', id, summary: `Новый пароль: ${u.name || u.login}` }] });
    } finally {
      set({ busy: null });
    }
  },

  removeUser(id) {
    const { sk } = get();
    if (!sk) return;
    set({ sk: { ...sk, slots: sk.slots.filter(s => s.userId !== id) } });
    archive().apply(
      d => {
        d.access.users = d.access.users.filter(u => u.id !== id || u.role === 'owner');
      },
      { history: [{ action: 'delete', entity: 'archive', id, summary: 'Доступ удалён' }] },
    );
  },

  /* ---------- слияние ---------- */

  async openMerge(file) {
    const { sk } = get();
    const mine = archive().data;
    if (!sk || !mine) return;
    set({ busy: 'Открываю копию…' });
    try {
      // копия того же архива зашифрована тем же ключом данных — пароль не нужен
      let header;
      try {
        header = await unlockWithKey(file, sk.key);
      } catch (e) {
        if (e instanceof ArchiveError && e.code === 'wrong-password') throw new Error('Это копия другого архива — объединять можно только копии этого архива');
        throw e;
      }
      if (header.archiveId !== mine.meta.id) throw new Error('Это копия другого архива — объединять можно только копии этого архива');
      const { data: theirs, blobs } = await unpackArchive(await openContainer(file, sk.key));
      const plan = planMerge(mine, theirs);
      set({ merge: { fileName: file.name, theirs, blobs, plan } });
    } finally {
      set({ busy: null });
    }
  },

  applyMerge(choices) {
    const m = get().merge;
    const mine = archive().data;
    if (!m || !mine) return;
    const { data, copyMedia } = applyMerge(mine, m.theirs, m.plan, choices);
    // загружаем как есть (без отметок «изменил» от имени владельца — иначе следующее слияние сочло бы всё конфликтом)
    const blobs = new Map<string, Blob>();
    data.media.forEach(it => {
      const b = mediaRegistry.get(it.id) ?? (copyMedia.includes(it.id) ? m.blobs.get(it.id) : undefined);
      if (b) blobs.set(it.id, b);
    });
    const actor = archive().actor;
    archive().open(data, blobs);
    archive().setActor(actor);
    archive().autoLayout(true);
    archive().setStatus('dirty');
    set({ merge: null });
    ui().requestFit();
    ui().showToast('Архивы объединены — сохраните результат');
  },

  cancelMerge() {
    set({ merge: null });
  },
}));
