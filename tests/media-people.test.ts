/* Отметки людей на фото: совместное фото видно у всех отмеченных. */
import { personMedia } from '../src/domain/mediaPeople';
import { createMeta, createPerson, newId, normalizeArchive, ownerUser } from '../src/domain/normalize';
import type { ArchiveData, MediaItem } from '../src/domain/types';
import { useArchive } from '../src/store/archiveStore';

function sample() {
  const husband = { ...createPerson(1, 0, 0), firstName: 'Андрей' };
  const wife = { ...createPerson(2, 300, 0), firstName: 'Альбина' };
  const son = { ...createPerson(3, 150, 300), firstName: 'Сергей' };
  const photo: MediaItem = { id: newId(), kind: 'photo', mime: 'image/jpeg', name: 'свадьба.jpg', size: 10, sha256: '', createdAt: 1, people: [wife.id], date: '' };
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
