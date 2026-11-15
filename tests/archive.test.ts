import { ArchiveError, CHUNK_SIZE, openContainer, readHeader, sealContainer, unlockContainer } from '../src/archive/container';
import { makeSlot, newSession } from '../src/archive/keys';
import * as v1 from './fixtures/containerV1';
import { packArchive, unpackArchive } from '../src/archive/format';
import { createMeta, createPerson, newId, ownerUser } from '../src/domain/normalize';
import type { ArchiveData } from '../src/domain/types';

// минимальный корректный PNG 1×1
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  c => c.charCodeAt(0),
);

function sample(extraBytes?: Uint8Array): { data: ArchiveData; blobs: Map<string, Blob> } {
  const meta = createMeta('Тестовая семья', 'описание');
  const a = { ...createPerson(1), firstName: 'Иван', lastName: 'Иванов', gender: 'Мужской' as const };
  const b = { ...createPerson(2), firstName: 'Мария', gender: 'Женский' as const };
  const photoId = newId();
  a.mainPhotoId = photoId;
  const blobs = new Map<string, Blob>([[photoId, new Blob([PNG], { type: 'image/png' })]]);
  const media = [{ id: photoId, kind: 'photo' as const, mime: 'image/png', name: 'a.png', size: PNG.length, sha256: '', createdAt: 1, people: [] as string[], date: '', year: null as number | null }];
  if (extraBytes) {
    const big = newId();
    blobs.set(big, new Blob([extraBytes as BlobPart], { type: 'image/png' }));
    media.push({ id: big, kind: 'photo', mime: 'image/png', name: 'big.png', size: extraBytes.length, sha256: '', createdAt: 1, people: [], date: '', year: null });
    b.media = [big];
  }
  meta.nextSeq = 3;
  return {
    data: { meta, persons: [a, b], relations: [{ id: newId(), from: a.id, to: b.id, type: 'spouse' }], media, stories: [], history: [], access: { users: [ownerUser()] }, deleted: [] },
    blobs,
  };
}

async function build(password: string, extra?: Uint8Array, login = '') {
  const { data, blobs } = sample(extra);
  const payload = await packArchive(data, id => blobs.get(id));
  const sk = await newSession(data.meta.id, data.access.users[0].id, login, password);
  const file = await sealContainer(payload, sk, data.meta.id, 'test');
  return { data, file, sk, payload };
}

async function openWith(file: Blob, password: string, login = '') {
  const { fileKey } = await unlockContainer(file, login, password);
  return unpackArchive(await openContainer(file, fileKey));
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ArchiveError ? e.code : 'other:' + (e as Error).message;
  }
};

async function mutate(file: Blob, fn: (b: Uint8Array) => Uint8Array) {
  return new Blob([fn(new Uint8Array(await file.arrayBuffer())) as BlobPart]);
}

describe('архив .family', () => {
  it('сохранение и открытие с верным паролем', async () => {
    const { data, file } = await build('Пароль-123');
    const { header } = await readHeader(file);
    expect(header.version).toBe(2);
    expect(header.keySlots).toHaveLength(1);
    expect(header.keySlots![0].kdf.alg).toBe('argon2id');
    // в файле нет открытых данных
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer());
    expect(raw).not.toContain('Иванов');
    expect(raw).not.toContain('Пароль-123');

    const res = await openWith(file, 'Пароль-123');
    expect(res.data.persons.map(p => p.firstName)).toEqual(['Иван', 'Мария']);
    expect(res.data.relations).toHaveLength(1);
    expect(res.data.meta.title).toBe('Тестовая семья');
    const photo = res.blobs.get(data.persons[0].mainPhotoId!)!;
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(PNG);
    expect(photo.type).toBe('image/png');
  });

  it('неверный пароль', async () => {
    const { file } = await build('верный');
    expect(await codeOf(openWith(file, 'неверный'))).toBe('wrong-password');
  });

  it('повреждённый байт в содержимом', async () => {
    const { file } = await build('pw');
    const bad = await mutate(file, b => {
      const c = b.slice();
      c[c.length - 20] ^= 0xff;
      return c;
    });
    expect(await codeOf(openWith(bad, 'pw'))).toBe('corrupted');
  });

  it('обрезанный файл и лишние байты в конце', async () => {
    const { file } = await build('pw');
    expect(await codeOf(openWith(await mutate(file, b => b.slice(0, b.length - 100)), 'pw'))).toBe('corrupted');
    expect(await codeOf(openWith(await mutate(file, b => new Uint8Array([...b, 1, 2, 3])), 'pw'))).toBe('corrupted');
  });

  it('изменённый заголовок обнаруживается', async () => {
    const { file } = await build('pw');
    // меняем chunkSize-независимое поле: дату/приложение в заголовке
    const bad = await mutate(file, b => {
      const s = new TextDecoder().decode(b.subarray(0, 600));
      const i = s.indexOf('"createdWith":"test"');
      const c = b.slice();
      c[i + 15] = 'T'.charCodeAt(0);
      return c;
    });
    expect(await codeOf(openWith(bad, 'pw'))).toBe('wrong-password'); // AAD не совпадает уже на проверке пароля
  });

  it('не архив', async () => {
    expect(await codeOf(unlockContainer(new Blob(['hello world, это не архив']), '', 'x'))).toBe('not-archive');
  });

  it('архив более новой версии', async () => {
    const { file } = await build('pw');
    const bad = await mutate(file, b => {
      const s = new TextDecoder().decode(b);
      const i = s.indexOf('"version":2');
      const c = b.slice();
      c[i + 10] = '9'.charCodeAt(0);
      return c;
    });
    expect(await codeOf(unlockContainer(bad, '', 'pw'))).toBe('newer-version');
  });

  it('несколько блоков: перестановка блоков обнаруживается', async () => {
    // фото больше 4 МиБ → содержимое делится на 2+ блока
    const big = new Uint8Array(CHUNK_SIZE + 500_000);
    big.set(PNG);
    for (let i = PNG.length; i < big.length; i++) big[i] = (i * 31) & 0xff;
    const { file } = await build('pw', big);
    const res = await openWith(file, 'pw');
    expect(res.data.media).toHaveLength(2);

    // переставляем два блока местами
    const swapped = await mutate(file, b => {
      const dv = new DataView(b.buffer, b.byteOffset);
      let off = 8;
      const hlen = dv.getUint32(off);
      off += 4 + hlen;
      off += 16 + dv.getUint32(off + 12); // verifier
      const blocks: [number, number][] = [];
      while (off < b.length) {
        const len = dv.getUint32(off + 12);
        blocks.push([off, 16 + len]);
        off += 16 + len;
      }
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      const [a, c] = [blocks[0], blocks[1]];
      const out = new Uint8Array(b.length);
      out.set(b.subarray(0, a[0]));
      out.set(b.subarray(c[0], c[0] + c[1]), a[0]);
      out.set(b.subarray(a[0], a[0] + a[1]), a[0] + c[1]);
      out.set(b.subarray(c[0] + c[1]), a[0] + c[1] + a[1]);
      return out;
    });
    expect(await codeOf(openWith(swapped, 'pw'))).toBe('corrupted');
  }, 30000);

  it('смена пароля: старый перестаёт подходить', async () => {
    const { data, file } = await build('старый');
    const res = await openWith(file, 'старый');
    const payload = await packArchive(res.data, id => res.blobs.get(id));
    const resealed = await sealContainer(payload, await newSession(data.meta.id, data.access.users[0].id, '', 'новый'), data.meta.id, 'test');
    expect(await codeOf(openWith(resealed, 'старый'))).toBe('wrong-password');
    expect((await openWith(resealed, 'новый')).data.persons).toHaveLength(2);
  });

  it('логины: владелец и участник открывают один файл каждый своим паролем', async () => {
    const { data, sk, payload } = await build('пароль-владельца', undefined, 'Admin');
    // выдаём доступ «albina»: тот же ключ данных, своя ячейка
    const memberSlot = await makeSlot(sk.raw, data.meta.id, 'member-id-0001', 'albina', 'пароль-альбины');
    const file = await sealContainer(payload, { ...sk, slots: [...sk.slots, memberSlot] }, data.meta.id, 'test');
    expect((await unlockContainer(file, 'admin', 'пароль-владельца')).sk.userId).toBe(data.access.users[0].id); // регистр логина не важен
    expect((await unlockContainer(file, 'Albina ', 'пароль-альбины')).sk.userId).toBe('member-id-0001');
    expect((await openWith(file, 'пароль-альбины', 'albina')).data.persons).toHaveLength(2);
    // чужой пароль к чужому логину не подходит, без логина участник не войдёт
    expect(await codeOf(unlockContainer(file, 'albina', 'пароль-владельца'))).toBe('wrong-password');
    expect(await codeOf(unlockContainer(file, '', 'пароль-альбины'))).toBe('wrong-password');
    expect(await codeOf(unlockContainer(file, 'admin', 'пароль-альбины'))).toBe('wrong-password');
    // логинов в файле нет в открытом виде — только хеши
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer());
    expect(raw).not.toContain('albina');
    expect(raw).not.toContain('admin');
  }, 30000);

  it('старый формат (v1, один пароль) открывается и переходит на новый', async () => {
    const { data, blobs } = sample();
    const payload = await packArchive(data, id => blobs.get(id));
    const old = await v1.sealContainer(payload, await v1.createKey('старый-пароль'), data.meta.id, 'old');
    expect((await readHeader(old)).header.version).toBe(1);
    const u = await unlockContainer(old, '', 'старый-пароль');
    expect(u.legacy).toBe(true);
    const res = await unpackArchive(await openContainer(old, u.fileKey));
    expect(res.data.persons).toHaveLength(2);
    expect(res.data.access.users.filter(x => x.role === 'owner')).toHaveLength(1);
    expect(await codeOf(unlockContainer(old, '', 'не-тот'))).toBe('wrong-password');
  });

  it('подделанный тип файла: HTML под видом фото отбрасывается, тип берётся из содержимого', async () => {
    const { data, blobs } = sample();
    const htmlId = newId();
    blobs.set(htmlId, new Blob(['<html><script>alert(1)</script></html>']));
    data.media.push({ id: htmlId, kind: 'photo', mime: 'text/html', name: 'x.jpg', size: 40, sha256: '', createdAt: 1, people: [], date: '', year: null });
    data.persons[1].media = [htmlId];
    data.media[0].mime = 'text/html'; // настоящий PNG с поддельным типом
    const payload = await packArchive(data, id => blobs.get(id));
    const res = await unpackArchive(payload);
    expect(res.skipped).toBe(1);
    expect(res.data.persons[1].media).toEqual([]);
    expect(res.blobs.get(data.media[0].id)!.type).toBe('image/png');
  });
});
