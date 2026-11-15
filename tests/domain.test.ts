import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { legacyToArchive } from '../src/archive/legacyImport';
import { relationGroups } from '../src/domain/kinship';
import { ageText, isValidDate, normDate, yearLine } from '../src/domain/people';
import { cleanHandle, socialUrl } from '../src/domain/normalize';

describe('даты', () => {
  it.each([
    ['1.5.1990', '01.05.1990'],
    ['3/7/1950', '03.07.1950'],
    ['05.1990', '**.05.1990'],
    ['1990', '**.**.1990'],
    ['12051990', '12.05.1990'],
    ['1990-05-12', '12.05.1990'],
    ['**.05.1990', '**.05.1990'],
  ])('%s → %s', (input, out) => expect(normDate(input)).toBe(out));

  it('неверная дата остаётся как есть и не проходит проверку', () => {
    expect(normDate('45.13.1950')).toBe('45.13.1950');
    expect(isValidDate('45.13.1950')).toBe(false);
    expect(isValidDate('03.07.1950')).toBe(true);
  });

  it('подписи и возраст', () => {
    expect(yearLine({ birth: '**.**.1950', death: '', deceased: true })).toBe('1950 — †');
    expect(ageText({ birth: '**.**.1950', death: '**.**.2010', deceased: true, gender: 'Женский' })).toBe('Прожила 60 лет');
    expect(ageText({ birth: '**.**.1950', death: '', deceased: true, gender: '' })).toBe('');
  });
});

describe('соцсети', () => {
  it('ник очищается от адреса и @', () => {
    expect(cleanHandle('https://t.me/ivan_p')).toBe('ivan_p');
    expect(cleanHandle('@ivan')).toBe('ivan');
    expect(socialUrl({ network: 'telegram', handle: '@ivan' })).toBe('https://t.me/ivan');
    expect(socialUrl({ network: 'whatsapp', handle: '+998 90 000-00-00' })).toBe('https://wa.me/998900000000');
  });
});

describe('родство', () => {
  it('двоюродные, дяди, родня со стороны и по браку', async () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/synthetic.json'), 'utf8'));
    const { data } = await legacyToArchive(json, () => null);
    const byLegacy = (n: number) => data.persons.find(p => p.legacyId === n)!;
    const labels = (n: number) =>
      Object.fromEntries(relationGroups(byLegacy(n), data.persons, data.relations).flatMap(g => g.items.map(i => [i.other.legacyId, i.label])));
    // 22 — внук деда 3 (через 9); 24 — внучка деда 4 (брата деда 3)
    const l22 = labels(22);
    expect(l22[9]).toBe('Отец');
    expect(l22[3]).toBe('Дедушка');
    expect(l22[1]).toBe('Прадедушка');
    expect(l22[24]).toBe('Троюродная сестра'.replace('Троюродная', 'Троюродная'));
    expect(l22[16]).toBe('Двоюродный дядя');
    expect(l22[4]).toBe('Двоюродный дедушка');
    expect(l22[19]).toBe('Дедушка'); // отец матери
    // 9: родители жены — тесть и тёща, брат жены — шурин
    const l9 = labels(9);
    expect(l9[19]).toBe('Тесть');
    expect(l9[20]).toBe('Тёща');
    expect(l9[21]).toBe('Шурин (брат жены)');
    expect(l9[10]).toBe('Сестра · родные');
    expect(l9[11]).toBe('Брат · по одному из родителей');
  });
});
