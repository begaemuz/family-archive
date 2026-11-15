/* Доступы и слияние: жене выдан доступ на её ветку, она дополняет копию, владелец объединяет. */
import { branchOf, makeAccess } from '../src/domain/access';
import { applyMerge, planMerge, type MergeChoices } from '../src/domain/merge';
import { createMeta, createPerson, newId, ownerUser } from '../src/domain/normalize';
import type { AccessUser, ArchiveData, Person } from '../src/domain/types';
import { useArchive } from '../src/store/archiveStore';

const person = (seq: number, firstName: string): Person => ({ ...createPerson(seq), firstName });

function family() {
  const owner = ownerUser();
  const husband = person(1, 'Андрей');
  const wife = person(2, 'Альбина');
  const son = person(3, 'Сергей');
  const hFather = person(4, 'Владимир');
  const data: ArchiveData = {
    meta: createMeta('Семья', ''),
    persons: [husband, wife, son, hFather],
    relations: [
      { id: newId(), from: husband.id, to: wife.id, type: 'spouse' },
      { id: newId(), from: husband.id, to: son.id, type: 'parent' },
      { id: newId(), from: wife.id, to: son.id, type: 'parent' },
      { id: newId(), from: hFather.id, to: husband.id, type: 'parent' },
    ],
    media: [],
    stories: [],
    history: [],
    access: { users: [owner] },
    deleted: [],
  };
  const albina: AccessUser = {
    id: newId(),
    login: 'albina',
    name: 'Альбина',
    role: 'member',
    root: wife.id,
    can: { change: true, add: true, delete: false },
    createdAt: Date.now() - 10_000,
    syncedAt: Date.now() - 10_000,
  };
  data.access.users.push(albina);
  return { data, owner, albina, husband, wife, son, hFather };
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Правки от имени пользователя — через хранилище (оно ставит отметки «кто и когда»). */
function editAs(data: ArchiveData, actor: string, fn: () => void): ArchiveData {
  const st = useArchive.getState();
  st.open(clone(data), new Map());
  st.setActor(actor);
  fn();
  const out = clone(useArchive.getState().data!);
  st.close();
  return out;
}

describe('ветка участника', () => {
  it('кровная родня + супруги: жена, её сын и муж; родители мужа — нет', () => {
    const { data, albina, husband, wife, son, hFather } = family();
    const scope = branchOf(albina, data.persons, data.relations)!;
    expect(scope.has(wife.id)).toBe(true);
    expect(scope.has(son.id)).toBe(true);
    expect(scope.has(husband.id)).toBe(true); // супруг
    expect(scope.has(hFather.id)).toBe(false);
  });

  it('новые родители жены попадают в её ветку (предки)', () => {
    const { data, albina, wife } = family();
    const mom = person(9, 'Диляра');
    data.persons.push(mom);
    data.relations.push({ id: newId(), from: mom.id, to: wife.id, type: 'parent' });
    expect(branchOf(albina, data.persons, data.relations)!.has(mom.id)).toBe(true);
  });

  it('права: менять свою ветку можно, чужую — нет; удалять без права нельзя', () => {
    const { data, albina, wife, hFather, son } = family();
    const acc = makeAccess(albina, data);
    expect(acc.canEditPerson(wife.id)).toBe(true);
    expect(acc.canEditPerson(hFather.id)).toBe(false);
    expect(acc.canAddNear(wife.id)).toBe(true);
    expect(acc.canAddNear(hFather.id)).toBe(false);
    expect(acc.canDeletePerson(son.id)).toBe(false);
    expect(acc.canManageArchive).toBe(false);
    const own = makeAccess(data.access.users[0], data);
    expect(own.canEditPerson(hFather.id) && own.canDeletePerson(son.id) && own.canManageArchive).toBe(true);
  });
});

describe('отметки правок', () => {
  it('изменение — «кто и когда», удаление — метка; перемещение по холсту правкой не считается', () => {
    const { data, albina, wife, son } = family();
    const out = editAs(data, albina.id, () => {
      const st = useArchive.getState();
      st.movePerson(wife.id, 999, true);
    });
    expect(out.persons.find(p => p.id === wife.id)!.updatedBy).toBeUndefined();
    const out2 = editAs(data, albina.id, () => {
      useArchive.getState().updatePerson(wife.id, { birth: '01.01.1965' });
      useArchive.getState().deletePerson(son.id);
    });
    expect(out2.persons.find(p => p.id === wife.id)!.updatedBy).toBe(albina.id);
    expect(out2.deleted.some(t => t.entity === 'person' && t.id === son.id && t.by === albina.id)).toBe(true);
  });
});

describe('слияние копий', () => {
  function scenario() {
    const f = family();
    // владелец выдал копию; дальше каждый правит своё
    const issued = clone(f.data);
    // жена в своей копии
    let mom!: Person;
    const theirs = editAs(issued, f.albina.id, () => {
      const st = useArchive.getState();
      mom = st.addPerson({ firstName: 'Диляра', gender: 'Женский' });
      st.addRelation('parent', mom.id, f.wife.id);
      st.updatePerson(f.wife.id, { birth: '19.01.1963' });
      st.updatePerson(f.hFather.id, { occupation: 'инженер' }); // не её ветка
      st.deletePerson(f.son.id); // нет права удалять
    });
    // владелец у себя тем временем
    const mine = editAs(f.data, f.owner.id, () => {
      useArchive.getState().updatePerson(f.wife.id, { occupation: 'учитель' });
    });
    return { ...f, mine, theirs, mom };
  }

  it('план: мама и связь — добавить; жена — конфликт; чужое и удаление — отклонить', () => {
    const { mine, theirs, mom, wife } = scenario();
    const plan = planMerge(mine, theirs);
    const keys = plan.items.map(i => `${i.entity}:${i.action}:${i.conflict ? 'conflict' : 'ok'}`).sort();
    expect(keys).toEqual(['person:add:ok', 'person:update:conflict', 'relation:add:ok']);
    expect(plan.items.find(i => i.action === 'add' && i.entity === 'person')!.id).toBe(mom.id);
    const upd = plan.items.find(i => i.action === 'update')!;
    expect(upd.id).toBe(wife.id);
    expect(upd.fields!.map(f => f.field).sort()).toEqual(['birth', 'occupation']);
    expect(plan.rejected.map(r => r.reason)).toEqual(
      expect.arrayContaining(['нет права менять этого человека', 'нет права удалять этого человека']),
    );
  });

  it('применение: выбор по полям, мама с связью добавлены, сын и родитель мужа не тронуты', () => {
    const { mine, theirs, mom, wife, son, hFather, albina } = scenario();
    const plan = planMerge(mine, theirs);
    const upd = plan.items.find(i => i.action === 'update')!;
    const choices: MergeChoices = { skip: new Set(), fields: new Map([[upd.key, { birth: 'theirs', occupation: 'mine' }]]), side: new Map() };
    const { data } = applyMerge(mine, theirs, plan, choices);
    const w = data.persons.find(p => p.id === wife.id)!;
    expect(w.birth).toBe('19.01.1963'); // её правка
    expect(w.occupation).toBe('учитель'); // моя правка
    expect(data.persons.some(p => p.id === mom.id)).toBe(true);
    expect(data.relations.some(r => r.from === mom.id && r.to === wife.id && r.type === 'parent')).toBe(true);
    expect(data.persons.some(p => p.id === son.id)).toBe(true);
    expect(data.persons.find(p => p.id === hFather.id)!.occupation).toBe('');
    // правки до этого момента слиты: повторное слияние той же копии — пусто
    expect(data.access.users.find(u => u.id === albina.id)!.syncedAt).toBeGreaterThan(albina.syncedAt);
    const again = planMerge(data, theirs);
    expect(again.items.filter(i => !i.conflict)).toHaveLength(0);
  });

  it('копия владельца без правок участников — объединять нечего', () => {
    const { data } = family();
    expect(planMerge(data, clone(data)).items).toHaveLength(0);
  });
});
