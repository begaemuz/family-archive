import { normalizeMedia } from '../src/domain/normalize';
/* Отметки людей на фото: совместное фото видно у всех отмеченных. */
import { groupByYear, personMedia } from '../src/domain/mediaPeople';
import { createMeta, createPerson, newId, normalizeArchive, ownerUser } from '../src/domain/normalize';
import type { ArchiveData, MediaItem } from '../src/domain/types';
import { useArchive } from '../src/store/archiveStore';

function sample() {
  const husband = { ...createPerson(1, 0, 0), firstName: 'Андрей' };
  const wife = { ...createPerson(2, 300, 0), firstName: 'Альбина' };
  const son = { ...createPerson(3, 150, 300), firstName: 'Сергей' };
  const photo: MediaItem = { id: newId(), kind: 'photo', mime: 'image/jpeg', name: 'свадьба.jpg', size: 10, sha256: '', createdAt: 1, people: [wife.id], date: '', year: null };
  husband.media = [photo.id];
  const data: ArchiveData = { meta: createMeta('Тест', ''), persons: [husband, wife, son], relations: [], media: [photo], stories: [], history: [], access: { users: [ownerUser()] }, deleted: [] };
  return { data, husband, wife, son, photo };
}

describe('отметки людей на фото', () => {
  it('при чтении архива отметки чистятся: нет несуществующих людей и самого владельца', () => {
    const { data, husband, wife, photo } = sample();
    photo.people = [wife.id, husband.id, newId(), wife.id];
    const out = normalizeArchive(JSON.parse(JSON.stringify(data)));
    expect(out.media[0].people).toEqual([wife.id]);
  });

  it('старые архивы без поля people читаются как «никто не отмечен»', () => {
    const { data } = sample();
    const raw = JSON.parse(JSON.stringify(data));
    delete raw.media[0].people;
    expect(normalizeArchive(raw).media[0].people).toEqual([]);
  });

  it('фото мужа с отмеченной женой видно у обоих; у сына — нет', () => {
    const { data, husband, wife, son, photo } = sample();
    const h = personMedia(husband, data.media, data.persons);
    const w = personMedia(wife, data.media, data.persons);
    expect(h).toEqual([{ item: photo, own: true, ownerId: husband.id }]);
    expect(w).toEqual([{ item: photo, own: false, ownerId: husband.id }]);
    expect(personMedia(son, data.media, data.persons)).toEqual([]);
  });

  it('владельца нельзя отметить на собственном фото, повторы убираются', () => {
    const { data, husband, wife, son, photo } = sample();
    useArchive.getState().open(data, new Map());
    useArchive.getState().setMediaPeople(photo.id, [husband.id, son.id, son.id, wife.id]);
    expect(useArchive.getState().data!.media[0].people).toEqual([son.id, wife.id]);
    useArchive.getState().close();
  });

  it('удалили владельца — фото переходит к первому отмеченному, а не пропадает', () => {
    const { data, husband, wife, son, photo } = sample();
    data.media[0].people = [wife.id, son.id];
    useArchive.getState().open(data, new Map());
    useArchive.getState().deletePerson(husband.id);
    const d = useArchive.getState().data!;
    expect(d.media.map(m => m.id)).toEqual([photo.id]);
    expect(d.persons.find(p => p.id === wife.id)!.media).toEqual([photo.id]);
    expect(d.media[0].people).toEqual([son.id]);
    useArchive.getState().close();
  });

  it('удалили отмеченного человека — отметка снимается, фото у владельца остаётся', () => {
    const { data, husband, wife, photo } = sample();
    useArchive.getState().open(data, new Map());
    useArchive.getState().deletePerson(wife.id);
    const d = useArchive.getState().data!;
    expect(d.persons.find(p => p.id === husband.id)!.media).toEqual([photo.id]);
    expect(d.media[0].people).toEqual([]);
    useArchive.getState().close();
  });
});

describe('лица на фото сохраняются в архиве', () => {
  const d = btoa(String.fromCharCode(...new Uint8Array(new Float32Array(128).fill(0.25).buffer)));
  const id = 'aaaaaaaa-1111-2222-3333-444444444444';
  const pid = 'bbbbbbbb-1111-2222-3333-444444444444';

  it('рамки, отпечаток и ответы проходят нормализацию, мусор отбрасывается', () => {
    const m = normalizeMedia({
      id,
      kind: 'photo',
      faces: [
        { x: 0.1, y: 0.2, w: 0.1, h: 0.15, d, p: pid },
        { x: 0.5, y: 0.2, w: 0.1, h: 0.15, d, s: pid },
        { x: 2, y: 0, w: 0.1, h: 0.1, d },
        { x: 0.1, y: 0.1, w: 0.1, h: 0.1, d: '<script>' },
      ],
    })!;
    expect(m.faces).toHaveLength(2);
    expect(m.faces![0].p).toBe(pid);
    expect(m.faces![1].s).toBe(pid);
    // «искали, но лиц нет» — тоже запоминается
    expect(normalizeMedia({ id, kind: 'photo', faces: [] })!.faces).toEqual([]);
    expect(normalizeMedia({ id, kind: 'photo' })!.faces).toBeUndefined();
  });
});

describe('исправление неверного узнавания', () => {
  const d = btoa(String.fromCharCode(...new Uint8Array(new Float32Array(128).fill(0.25).buffer)));
  const face = { x: 0.1, y: 0.1, w: 0.1, h: 0.1, d };

  it('«Это не …» снимает человека с лица и запоминает, «Это …» ставит другого и отмечает его на фото', () => {
    const { data, wife, son, photo } = sample();
    // ребёнка узнали как маму
    photo.faces = [{ ...face, p: wife.id }, { ...face }];
    useArchive.getState().open(data, new Map());
    const st = () => useArchive.getState().data!.media[0];

    useArchive.getState().unassignFace(photo.id, 0);
    expect(st().faces![0].p).toBeUndefined();
    expect(st().faces![0].n).toEqual([wife.id]);
    expect(st().people).toEqual([wife.id]); // мама на фото остаётся отмеченной

    useArchive.getState().assignFace(photo.id, 0, son.id);
    expect(st().faces![0].p).toBe(son.id);
    expect(st().people).toContain(son.id);

    // тот же человек на другом лице — с прежнего снимается: один человек — одно лицо
    useArchive.getState().assignFace(photo.id, 1, son.id);
    expect(st().faces![0].p).toBeUndefined();
    expect(st().faces![1].p).toBe(son.id);
  });
});

describe('фото по годам', () => {
  it('группы идут по годам, внутри — по времени добавления, без года — в конце', () => {
    const mk = (year: number | null, createdAt: number) => ({ item: { id: String(createdAt), year, createdAt } as MediaItem });
    const g = groupByYear([mk(null, 1), mk(1990, 5), mk(1985, 3), mk(1990, 2), mk(null, 4)]);
    expect(g.map(x => x.year)).toEqual([1985, 1990, null]);
    expect(g[1].items.map(x => x.item.createdAt)).toEqual([2, 5]);
    expect(g[2].items).toHaveLength(2);
  });
});
