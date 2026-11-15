/* Сеанс работы с архивом: создание, открытие, сохранение, смена пароля, закрытие.
   Ключ шифрования живёт только в памяти как неизвлекаемый CryptoKey; пароль не хранится нигде. */
import { create } from 'zustand';
import { ArchiveError, createKey, openContainer, sealContainer, unlockContainer, type SessionKey } from '../archive/container';
import { clearDraft, draftInfo, restoreDraft, saveDraft, type DraftInfo } from '../archive/draftStore';
import { safeFileName, writeArchive, type FSHandle } from '../archive/fileAccess';
import { APP_VERSION, packArchive, unpackArchive } from '../archive/format';
import { importLegacyJson, importLegacyZip } from '../archive/legacyImport';
import { createMeta } from '../domain/normalize';
import type { ArchiveData } from '../domain/types';
import { useArchive } from './archiveStore';
import { mediaRegistry } from './mediaRegistry';
import { useUi } from './uiStore';

type FileHandle = FSHandle | null;

interface PendingOpen {
  file: File;
  handle: FileHandle;
}

interface SessionState {
  sk: SessionKey | null;
  fileName: string;
  handle: FileHandle;
  /** выбран файл, ждём пароль */
  pending: PendingOpen | null;
  /** импорт старого дерева: ждём название и пароль нового архива */
  pendingImport: { data: ArchiveData; blobs: Map<string, Blob>; missing: number } | null;
  draft: DraftInfo | null;
  busy: string | null;

  checkDraft(): Promise<void>;
  createArchive(o: { title: string; description: string; password: string; cover?: Blob | null }): Promise<void>;
  chooseFile(file: File, handle: FileHandle): void;
  cancelPending(): void;
  unlock(password: string): Promise<void>;
  restore(password: string): Promise<void>;
  discardDraft(): Promise<void>;
  importLegacy(file: File): Promise<void>;
  finishImport(o: { title: string; description: string; password: string }): Promise<void>;
  save(opts?: { as?: boolean }): Promise<boolean>;
  changePassword(oldPw: string, newPw: string): Promise<void>;
  closeArchive(): Promise<void>;
  autosaveDraft(): Promise<void>;
}

const archive = () => useArchive.getState();
const ui = () => useUi.getState();

export const useSession = create<SessionState>((set, get) => ({
  sk: null,
  fileName: '',
  handle: null,
  pending: null,
  pendingImport: null,
  draft: null,
  busy: null,

  async checkDraft() {
    set({ draft: await draftInfo() });
  },

  async createArchive({ title, description, password, cover }) {
    set({ busy: 'Создаю зашифрованный архив…' });
    try {
      const sk = await createKey(password);
      const data: ArchiveData = { meta: createMeta(title, description), persons: [], relations: [], media: [], stories: [], history: [] };
      const blobs = new Map<string, Blob>();
      if (cover) {
        const { addCoverToData } = await import('../flows/mediaFlows');
        await addCoverToData(data, blobs, cover);
      }
      data.history.push({ ts: Date.now(), action: 'create', entity: 'archive', id: data.meta.id, summary: 'Архив создан' });
      archive().open(data, blobs);
      archive().setStatus('dirty');
      set({ sk, fileName: safeFileName(data.meta.title), handle: null, draft: null });
      await clearDraft();
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

  async unlock(password) {
    const p = get().pending;
    if (!p) return;
    set({ busy: 'Проверяю пароль…' });
    try {
      const { key, kdf } = await unlockContainer(p.file, password);
      set({ busy: 'Расшифровываю архив…' });
      const payload = await openContainer(p.file, key);
      const { data, blobs, skipped } = await unpackArchive(payload);
      archive().open(data, blobs);
      set({ sk: { key, kdf }, fileName: p.handle?.name || p.file.name, handle: p.handle, pending: null, draft: null });
      await clearDraft();
      ui().requestFit();
      ui().showToast(skipped ? `Архив открыт, но ${skipped} файл(ов) не прошли проверку и пропущены` : `Архив «${data.meta.title}» открыт`);
    } finally {
      set({ busy: null });
    }
  },

  async restore(password) {
    set({ busy: 'Восстанавливаю изменения…' });
    try {
      const { data, blobs, sk, fileName } = await restoreDraft(password);
      archive().open(data, blobs);
      archive().setStatus('dirty');
      set({ sk, fileName, handle: null, draft: null });
      ui().requestFit();
      ui().showToast('Несохранённые изменения восстановлены — сохраните архив');
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

  async finishImport({ title, description, password }) {
    const pi = get().pendingImport;
    if (!pi) return;
    set({ busy: 'Создаю зашифрованный архив…' });
    try {
      const sk = await createKey(password);
      const data = pi.data;
      data.meta.title = title.trim() || data.meta.title;
      data.meta.description = description;
      data.history.push({ ts: Date.now(), action: 'create', entity: 'archive', id: data.meta.id, summary: `Импорт старого дерева: ${data.persons.length} чел.` });
      archive().open(data, pi.blobs);
      archive().setStatus('dirty');
      set({ sk, fileName: safeFileName(data.meta.title), handle: null, pendingImport: null, draft: null });
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
      if (archive().data === data) await clearDraft();
      ui().showToast(res.method === 'file' ? `Сохранено в «${res.fileName}»` : `Архив скачан: «${res.fileName}»`);
      return true;
    } catch (e) {
      console.error(e);
      archive().setStatus('error');
      ui().showToast('Ошибка сохранения: ' + ((e as Error)?.message || 'неизвестная ошибка'));
      return false;
    }
  },

  async changePassword(oldPw, newPw) {
    const { sk } = get();
    const data = archive().data;
    if (!sk || !data) return;
    set({ busy: 'Проверяю текущий пароль…' });
    try {
      // проверяем старый пароль: ключ из него должен совпасть с текущим (сверяем по пробному шифрованию)
      const { deriveKey, encrypt, decrypt } = await import('../archive/crypto');
      const probe = new TextEncoder().encode('probe');
      const aad = new Uint8Array(0);
      const test = await encrypt(sk.key, probe, aad);
      const oldKey = await deriveKey(oldPw, sk.kdf);
      try {
        await decrypt(oldKey, test.nonce, test.ct, aad);
      } catch {
        throw new ArchiveError('wrong-password');
      }
      set({ busy: 'Перешифровываю архив новым паролем…' });
      const newSk = await createKey(newPw);
      set({ sk: newSk });
      archive().apply(() => {}, { history: [{ action: 'update', entity: 'archive', id: data.meta.id, summary: 'Пароль изменён' }] });
      await clearDraft(); // черновик был зашифрован старым ключом
    } finally {
      set({ busy: null });
    }
    // сразу сохраняем: файл должен открываться только новым паролем
    await get().save();
  },

  async closeArchive() {
    archive().close();
    ui().closePanel();
    ui().setStoriesOpen(false);
    ui().select(null);
    set({ sk: null, fileName: '', handle: null, pending: null, pendingImport: null });
    await clearDraft();
    set({ draft: null });
  },

  async autosaveDraft() {
    const { sk, fileName } = get();
    const data = archive().data;
    if (!sk || !data || archive().status === 'saved') return;
    try {
      await saveDraft(sk, data, id => mediaRegistry.get(id), fileName);
    } catch (e) {
      console.warn('Черновик не сохранён', e);
    }
  },
}));
