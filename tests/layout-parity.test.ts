/* Сверка раскладки: новый код должен ставить людей ровно туда же, куда ставила прежняя версия
   (legacy/index.html). Эталоны получены автовыравниванием в старом приложении. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { legacyToArchive } from '../src/archive/legacyImport';
import { autoLayout } from '../src/domain/layout';

type Expected = Record<string, [number, number, number | null]>;

async function layoutOf(fixturePath: string) {
  const json = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const { data } = await legacyToArchive(json, () => null);
  const persons = data.persons.map(p => ({ ...p }));
  autoLayout(persons, data.relations);
  return persons;
}

function compare(persons: Awaited<ReturnType<typeof layoutOf>>, expected: Expected) {
  const diffs: string[] = [];
  for (const p of persons) {
    const e = expected[String(p.legacyId)];
    if (!e) {
      diffs.push(`${p.legacyId}: нет в эталоне`);
      continue;
    }
    if (Math.round(p.x) !== e[0] || Math.round(p.y) !== e[1]) diffs.push(`${p.legacyId}: (${p.x}, ${p.y}) ≠ (${e[0]}, ${e[1]})`);
  }
  return diffs;
}

describe('раскладка совпадает с прежней версией', () => {
  it('выдуманное дерево: много жён, двоюродные, родня со стороны, свёрнутая ветка', async () => {
    const persons = await layoutOf(resolve(__dirname, 'fixtures/synthetic.json'));
    const expected: Expected = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/synthetic.expected.json'), 'utf8'));
    expect(compare(persons, expected)).toEqual([]);
  });

  // реальное дерево (обезличенное) хранится вне проекта; путь — в переменной окружения
  const real = process.env.LAYOUT_FIXTURE;
  it.skipIf(!real || !existsSync(real))('реальное дерево (82 человека)', async () => {
    const persons = await layoutOf(real!);
    const expected: Expected = JSON.parse(readFileSync(real!.replace(/\.json$/, '.expected.json'), 'utf8'));
    expect(compare(persons, expected)).toEqual([]);
  });
});
