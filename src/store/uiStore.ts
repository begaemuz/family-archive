/* Состояние интерфейса: выделение, боковая панель, вид холста, тема и «диалоги-обещания»
   (подтверждение, выбор кадра, тип связи) — их удобно вызывать как await confirm({...}). */
import type { ReactNode } from 'react';
import { create } from 'zustand';
import type { IconName } from '../ui/Icon';

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* хранилище недоступно — не страшно */
    }
  },
};

export type PanelTab = 'info' | 'media' | 'documents' | 'relations' | 'bio' | 'stories';

export interface FormContext {
  /** редактирование существующего или null — новый человек */
  personId: string | null;
  /** к кому привязать нового */
  anchorId?: string;
  x?: number;
  y?: number;
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  ok?: string;
  danger?: boolean;
  /** вторая кнопка действия (результат 'alt') */
  alt?: string;
  icon?: IconName;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (v: boolean | 'alt') => void;
}

interface CropRequest {
  src: string;
  resolve: (v: Blob | null) => void;
}

export interface LightboxState {
  ids: string[];
  index: number;
  ownerId: string | null;
  /** сразу поискать лица (фото только что добавили) */
  scan?: boolean;
}

export interface View {
  x: number;
  y: number;
  scale: number;
}

interface UiState {
  theme: 'dark' | 'light';
  dots: boolean;
  view: View;
  selectedId: string | null;

  panel: { open: boolean; personId: string | null; tab: PanelTab; form: FormContext | null; formDirty: boolean };
  storiesOpen: boolean;
  /** какую историю показать при открытии панели историй */
  storyId: string | null;
  /** открыть редактор новой истории с этим человеком */
  storyNewFor: string | null;

  toast: { text: string; key: number } | null;
  confirmReq: ConfirmRequest | null;
  cropReq: CropRequest | null;
  relationReq: { from: string; to: string } | null;
  lightbox: LightboxState | null;
  /** просьба вписать дерево в экран (счётчик) */
  fitTick: number;

  setTheme(t: 'dark' | 'light'): void;
  setDots(v: boolean): void;
  setView(v: View): void;
  select(id: string | null): void;
  openPerson(id: string, tab?: PanelTab): void;
  openForm(ctx: FormContext): void;
  closeForm(): void;
  setFormDirty(v: boolean): void;
  setTab(t: PanelTab): void;
  closePanel(): void;
  setStoriesOpen(v: boolean): void;
  /** открыть панель историй сразу на конкретной истории */
  openStory(id: string): void;
  newStory(personId: string): void;

  showToast(text: string): void;
  confirm(o: ConfirmOptions): Promise<boolean | 'alt'>;
  resolveConfirm(v: boolean | 'alt'): void;
  crop(src: string): Promise<Blob | null>;
  resolveCrop(v: Blob | null): void;
  askRelation(from: string, to: string): void;
  closeRelation(): void;
  openLightbox(l: LightboxState): void;
  setLightbox(l: LightboxState | null): void;
  requestFit(): void;
}

const initialTheme = (store.get('familyTreeTheme') as 'dark' | 'light') || 'dark';

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme,
  dots: store.get('familyTreeDots') !== '0',
  view: { x: 0, y: 0, scale: 1 },
  selectedId: null,
  panel: { open: false, personId: null, tab: 'info', form: null, formDirty: false },
  storiesOpen: false,
  storyId: null,
  storyNewFor: null,
  toast: null,
  confirmReq: null,
  cropReq: null,
  relationReq: null,
  lightbox: null,
  fitTick: 0,

  setTheme(theme) {
    store.set('familyTreeTheme', theme);
    set({ theme });
  },
  setDots(dots) {
    store.set('familyTreeDots', dots ? '1' : '0');
    set({ dots });
  },
  setView(view) {
    set({ view });
  },
  select(selectedId) {
    set({ selectedId });
  },
  openPerson(id, tab) {
    set(s => ({ selectedId: id, storiesOpen: false, panel: { ...s.panel, open: true, personId: id, tab: tab ?? s.panel.tab, form: null, formDirty: false } }));
  },
  openForm(form) {
    set(s => ({ storiesOpen: false, panel: { ...s.panel, open: true, personId: form.personId ?? s.panel.personId, form, formDirty: false } }));
  },
  closeForm() {
    set(s => ({ panel: { ...s.panel, form: null, formDirty: false, open: !!s.panel.personId } }));
  },
  setFormDirty(formDirty) {
    set(s => ({ panel: { ...s.panel, formDirty } }));
  },
  setTab(tab) {
    set(s => ({ panel: { ...s.panel, tab } }));
  },
  closePanel() {
    set(s => ({ panel: { ...s.panel, open: false, personId: null, form: null, formDirty: false } }));
  },
  setStoriesOpen(storiesOpen) {
    set(s => ({ storiesOpen, storyId: null, panel: storiesOpen ? { ...s.panel, open: false, form: null } : s.panel }));
  },
  newStory(personId) {
    set(s => ({ storiesOpen: true, storyId: null, storyNewFor: personId, panel: { ...s.panel, open: false, form: null } }));
  },
  openStory(id) {
    set(s => ({ storiesOpen: true, storyId: id, panel: { ...s.panel, open: false, form: null } }));
  },

  showToast(text) {
    set({ toast: { text, key: Date.now() } });
  },
  confirm(o) {
    get().confirmReq?.resolve(false);
    return new Promise(resolve => set({ confirmReq: { ...o, resolve } }));
  },
  resolveConfirm(v) {
    const r = get().confirmReq;
    set({ confirmReq: null });
    r?.resolve(v);
  },
  crop(src) {
    get().cropReq?.resolve(null);
    return new Promise(resolve => set({ cropReq: { src, resolve } }));
  },
  resolveCrop(v) {
    const r = get().cropReq;
    set({ cropReq: null });
    r?.resolve(v);
  },
  askRelation(from, to) {
    set({ relationReq: { from, to } });
  },
  closeRelation() {
    set({ relationReq: null });
  },
  openLightbox(lightbox) {
    set({ lightbox });
  },
  setLightbox(lightbox) {
    set({ lightbox });
  },
  requestFit() {
    set(s => ({ fitTick: s.fitTick + 1 }));
  },
}));

export const prefs = store;
