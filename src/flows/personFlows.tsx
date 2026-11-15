/* Сценарии, общие для шапки, холста и панели: добавить человека/родственника, связи, удаления. */
import { fullName } from '../domain/people';
import type { RelType, Relation } from '../domain/types';
import { useArchive } from '../store/archiveStore';
import { useUi } from '../store/uiStore';
import { worldCenter } from './canvasGeometry';

const ui = () => useUi.getState();
const archive = () => useArchive.getState();

export async function confirmLeaveForm(): Promise<boolean> {
  const p = ui().panel;
  if (!p.form || !p.formDirty) return true;
  const ok = await ui().confirm({ title: 'Закрыть без сохранения?', body: 'Введённые изменения будут потеряны.', ok: 'Закрыть без сохранения', icon: 'x' });
  return ok === true;
}

/** Клик мимо — закрыть карточку человека (с вопросом, если в форме есть правки) и панель историй.
    Историю в режиме редактирования не закрываем, чтобы не потерять текст. */
export async function closeSidePanelsFlow() {
  if (ui().panel.open) {
    if (!(await confirmLeaveForm())) return;
    ui().closePanel();
  }
  if (ui().storiesOpen && !document.querySelector('.stories-panel.form-mode')) ui().setStoriesOpen(false);
}

export async function addPersonFlow() {
  if (!(await confirmLeaveForm())) return;
  const c = worldCenter();
  ui().openForm({ personId: null, x: c.x - 100, y: c.y - 60 });
}

export async function editPersonFlow(id: string) {
  if (!(await confirmLeaveForm())) return;
  ui().select(id);
  ui().openForm({ personId: id });
}

export async function viewPersonFlow(id: string) {
  if (!(await confirmLeaveForm())) return;
  ui().openPerson(id);
}

/** «＋» у человека: новый родственник рядом (или в точке, куда отпустили линию). */
export async function createRelativeFlow(anchorId: string, drop?: { x: number; y: number }) {
  const anchor = archive().data?.persons.find(p => p.id === anchorId);
  if (!anchor) return;
  if (!(await confirmLeaveForm())) return;
  ui().openForm({
    personId: null,
    anchorId,
    x: drop ? drop.x - 100 : anchor.x + 250,
    y: drop ? drop.y - 62 : anchor.y,
  });
}

/**
 * Создать связь. kind 'parent' — первый является родителем второго, 'child' — ребёнком.
 */
export function linkPeople(kind: RelType | 'child', a: string, b: string) {
  const [type, from, to] = kind === 'child' ? (['parent', b, a] as const) : ([kind, a, b] as const);
  const res = archive().addRelation(type, from, to);
  if (res.ok) ui().showToast('Связь создана');
  else ui().showToast(res.reason === 'cycle' ? 'Нельзя: получится цикл — этот человек уже предок родителя' : 'Такая связь уже существует');
  return res.ok;
}

const Name = ({ id }: { id: string }) => <b>{fullName(archive().data!.persons.find(p => p.id === id)!)}</b>;

export async function askDeletePerson(id: string) {
  const d = archive().data;
  const p = d?.persons.find(x => x.id === id);
  if (!d || !p) return;
  const n = d.relations.filter(r => r.from === id || r.to === id).length;
  const files = (p.mainPhotoId ? 1 : 0) + p.media.length + p.documents.length;
  const ok = await ui().confirm({
    title: 'Удалить человека?',
    body: (
      <>
        <Name id={id} /> будет удалён из дерева
        {n ? ` вместе со связями (${n})` : ''}
        {files ? ` и файлами (${files})` : ''}. Это нельзя отменить.
      </>
    ),
    ok: 'Удалить человека',
  });
  if (ok !== true) return;
  archive().deletePerson(id);
  if (ui().selectedId === id) ui().select(null);
  if (ui().panel.personId === id) ui().closePanel();
  ui().showToast('Человек удалён');
}

export async function askDeleteRelation(viewerId: string, r: Relation) {
  const other = r.from === viewerId ? r.to : r.from;
  const kind = r.type === 'parent' ? (r.from === viewerId ? 'ребёнок' : 'родитель') : r.type === 'spouse' ? 'супруги' : r.type === 'sibling' ? 'брат / сестра' : 'другая связь';
  const ok = await ui().confirm({
    title: 'Удалить связь?',
    body: (
      <>
        Связь <Name id={viewerId} /> — <Name id={other} /> ({kind}) будет удалена. Сами люди останутся в дереве.
      </>
    ),
    ok: 'Удалить связь',
  });
  if (ok !== true) return;
  archive().deleteRelation(r.id);
  ui().showToast('Связь удалена');
}

export async function askDeleteMedia(mediaId: string, ownerId?: string | null) {
  const d = archive().data;
  const m = d?.media.find(x => x.id === mediaId);
  if (!d || !m) return false;
  const what = { photo: 'фото', video: 'видео', audio: 'аудиозапись', document: 'документ' }[m.kind];
  const owner = ownerId ? d.persons.find(p => p.id === ownerId) : null;
  const ok = await ui().confirm({
    title: `Удалить ${what}?`,
    body: (
      <>
        «{m.name}» будет удалён{owner ? <> из архива <b>{fullName(owner)}</b></> : null}. Это нельзя отменить.
      </>
    ),
    ok: 'Удалить',
  });
  if (ok !== true) return false;
  archive().deleteMedia(mediaId);
  ui().showToast('Файл удалён');
  return true;
}
