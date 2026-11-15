import { useEffect, useMemo, useState } from 'react';
import { burialFilled, normBurial, SOCIAL_NETWORKS, cleanHandle } from '../../domain/normalize';
import { fullName, isValidDate, normDate } from '../../domain/people';
import type { Burial, Gender, Person, Social, SocialNetwork } from '../../domain/types';
import { freeX } from '../../domain/layout';
import { preparedFromBlob } from '../../flows/mediaFlows';
import { confirmLeaveForm, linkPeople } from '../../flows/personFlows';
import { pickFiles } from '../../hooks/useFilePicker';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import { useArchive } from '../../store/archiveStore';
import { mediaRegistry } from '../../store/mediaRegistry';
import { useUi, type FormContext } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { BurialMapPicker } from './BurialMap';

type Fields = Pick<
  Person,
  | 'lastName' | 'firstName' | 'middleName' | 'maidenName' | 'gender' | 'birth' | 'death'
  | 'birthCountry' | 'birthCity' | 'deathCountry' | 'deathCity' | 'residenceCountry' | 'residenceCity'
  | 'phone' | 'email' | 'address' | 'occupation'
>;

type FieldDef = [keyof Fields, string, ('date' | 'tel' | 'email' | 'gender')?];
const PRIMARY: FieldDef[] = [
  ['lastName', 'Фамилия'],
  ['firstName', 'Имя'],
  ['middleName', 'Отчество'],
  ['gender', 'Пол', 'gender'],
  ['birth', 'Дата рождения', 'date'],
];
const ADVANCED: FieldDef[] = [
  ['maidenName', 'Девичья фамилия'],
  ['birthCountry', 'Страна рождения'],
  ['birthCity', 'Город рождения'],
  ['residenceCountry', 'Страна проживания'],
  ['residenceCity', 'Город проживания'],
  ['phone', 'Телефон', 'tel'],
  ['email', 'Электронная почта', 'email'],
  ['address', 'Адрес'],
  ['occupation', 'Профессия'],
];
const DEATH: FieldDef[] = [
  ['death', 'Дата смерти', 'date'],
  ['deathCountry', 'Страна смерти'],
  ['deathCity', 'Город смерти'],
];

type RelChoice = 'child' | 'parent' | 'spouse' | 'sibling' | 'other';

const EMPTY: Fields = {
  lastName: '', firstName: '', middleName: '', maidenName: '', gender: '', birth: '', death: '',
  birthCountry: '', birthCity: '', deathCountry: '', deathCity: '', residenceCountry: '', residenceCity: '',
  phone: '', email: '', address: '', occupation: '',
};

type PhotoState = { kind: 'keep' } | { kind: 'new'; blob: Blob; url: string } | { kind: 'remove' };

export function PersonForm({ ctx }: { ctx: FormContext }) {
  const person = useArchive(s => (ctx.personId ? s.data?.persons.find(p => p.id === ctx.personId) : undefined));
  const anchor = useArchive(s => (ctx.anchorId ? s.data?.persons.find(p => p.id === ctx.anchorId) : undefined));
  const isNew = !ctx.personId;
  const setDirty = useUi(s => s.setFormDirty);
  const closeForm = useUi(s => s.closeForm);

  const [f, setF] = useState<Fields>(() => (person ? (Object.fromEntries(Object.keys(EMPTY).map(k => [k, person[k as keyof Fields]])) as Fields) : { ...EMPTY }));
  const [deceased, setDeceased] = useState(!!person?.deceased);
  const [burial, setBurial] = useState<Burial>(() => normBurial(person?.burial));
  const [socials, setSocials] = useState<Social[]>(person?.socials ?? []);
  const [rel, setRel] = useState<RelChoice>('child');
  const [advanced, setAdvanced] = useState(() => !!person && (ADVANCED.some(([k]) => person[k]) || person.socials.length > 0));
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'keep' });
  const currentPhotoUrl = useMediaUrl(person?.mainPhotoId);
  const photoUrl = photo.kind === 'new' ? photo.url : photo.kind === 'remove' ? null : currentPhotoUrl;

  useEffect(() => () => (photo.kind === 'new' ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const touch = () => setDirty(true);
  const set = (k: keyof Fields, v: string) => {
    setF(s => ({ ...s, [k]: v }));
    touch();
  };

  /* ---------- фото профиля: всегда через квадратный кадр ---------- */
  const choosePhoto = async () => {
    const [file] = await pickFiles('image/jpeg,image/png,image/webp,image/gif,image/avif');
    if (!file) return;
    const url = URL.createObjectURL(file);
    const blob = await useUi.getState().crop(url);
    URL.revokeObjectURL(url);
    if (!blob) return;
    setPhoto({ kind: 'new', blob, url: URL.createObjectURL(blob) });
    touch();
  };
  const recrop = async () => {
    if (!photoUrl) return;
    const blob = await useUi.getState().crop(photoUrl);
    if (!blob) return;
    setPhoto({ kind: 'new', blob, url: URL.createObjectURL(blob) });
    touch();
  };
  const removePhoto = async () => {
    if (!photoUrl) return;
    const ok = await useUi.getState().confirm({ title: 'Удалить фото профиля?', body: 'Фото профиля будет убрано после сохранения формы.', ok: 'Удалить фото' });
    if (ok !== true) return;
    setPhoto({ kind: 'remove' });
    touch();
  };

  /* ---------- «Человек умер» ---------- */
  const deathFilled = () => DEATH.some(([k]) => f[k].trim()) || burialFilled(burial);
  const toggleDeceased = async (on: boolean) => {
    if (!on && deathFilled()) {
      const ok = await useUi.getState().confirm({
        title: 'Убрать данные о смерти?',
        body: 'Дата и место смерти, место захоронения и точка на карте будут очищены после сохранения.',
        ok: 'Убрать',
      });
      if (ok !== true) return;
    }
    setDeceased(on);
    touch();
  };

  const subtitle = useMemo(() => {
    if (!isNew && person) return fullName(person);
    if (anchor) return `Родственник для «${fullName(anchor)}»`;
    return 'Заполните то, что известно — остальное можно добавить позже';
  }, [isNew, person, anchor]);

  /* ---------- сохранение ---------- */
  const save = async () => {
    const ui = useUi.getState();
    const data: Fields = { ...f, birth: normDate(f.birth), death: deceased ? normDate(f.death) : '' };
    for (const [k, label] of [['birth', 'рождения'], ['death', 'смерти']] as const) {
      if (!isValidDate(data[k])) {
        ui.showToast(`Неверная дата ${label}. Формат: ДД.ММ.ГГГГ, неизвестное — **`);
        if (k === 'death') setDeceased(true);
        document.getElementById('f_' + k)?.focus();
        return;
      }
    }
    if (!deceased) {
      data.deathCountry = '';
      data.deathCity = '';
    }
    const st = useArchive.getState();
    const patch: Partial<Person> = {
      ...data,
      gender: data.gender as Gender,
      deceased,
      burial: deceased ? normBurial(burial) : normBurial(null),
      socials: socials.map(s => ({ ...s, handle: cleanHandle(s.handle) })).filter(s => s.handle),
    };

    // фото
    const oldPhoto = person?.mainPhotoId ?? null;
    if (photo.kind === 'new') {
      const prep = await preparedFromBlob(photo.blob, 'profile.jpg');
      st.addMedia(prep.item, prep.blob);
      patch.mainPhotoId = prep.item.id;
    } else if (photo.kind === 'remove') patch.mainPhotoId = null;

    let id: string;
    if (isNew) {
      const created = st.addPerson({ ...patch, x: ctx.x ?? 500, y: ctx.y ?? 500 });
      id = created.id;
      if (anchor) {
        if (rel === 'child') linkPeople('parent', anchor.id, id);
        else if (rel === 'parent') linkPeople('parent', id, anchor.id);
        else linkPeople(rel, anchor.id, id);
      }
      // не класть нового человека поверх другого
      const s2 = useArchive.getState();
      const p2 = s2.data!.persons.find(p => p.id === id)!;
      const x = freeX(s2.layout, p2, p2.x);
      if (x !== p2.x) s2.movePerson(id, x, true);
    } else {
      id = person!.id;
      st.updatePerson(id, patch);
    }
    if ((photo.kind === 'new' || photo.kind === 'remove') && oldPhoto) useArchive.getState().deleteMedia(oldPhoto);

    setDirty(false);
    ui.openPerson(id);
    ui.select(id);
    ui.showToast('Данные сохранены');
  };

  const field = ([k, label, type]: FieldDef) => (
    <div className="field" key={k}>
      <label htmlFor={'f_' + k}>{label}</label>
      {type === 'gender' ? (
        <select id={'f_' + k} value={f[k]} onChange={e => set(k, e.target.value)}>
          <option value="">Не указан</option>
          <option value="Мужской">Мужской</option>
          <option value="Женский">Женский</option>
        </select>
      ) : (
        <input
          id={'f_' + k}
          type={type === 'tel' || type === 'email' ? type : 'text'}
          inputMode={type === 'date' ? 'numeric' : undefined}
          maxLength={type === 'date' ? 10 : 300}
          placeholder={type === 'date' ? 'ДД.ММ.ГГГГ — неизвестное: **' : ''}
          value={f[k]}
          autoComplete="off"
          onChange={e => set(k, e.target.value)}
          onBlur={type === 'date' ? e => set(k, normDate(e.target.value)) : undefined}
        />
      )}
    </div>
  );

  const close = async () => {
    if (await confirmLeaveForm()) closeForm();
  };

  return (
    <>
      <div className="modal-header">
        <div>
          <h2>{isNew ? 'Новый человек' : 'Редактирование'}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="icon-button ghost" title="Закрыть" onClick={close}>
          <Icon name="x" />
        </button>
      </div>

      <div className="modal-body">
        <section className="form-section">
          <div className="form-section-title">
            <Icon name="user" /> Основное
          </div>
          <div className="form-grid">
            {PRIMARY.map(field)}
            {isNew && anchor && (
              <div className="field full">
                <label htmlFor="relationType">Кем приходится для «{fullName(anchor)}»</label>
                <select id="relationType" value={rel} onChange={e => setRel(e.target.value as RelChoice)}>
                  <option value="child">Ребёнок</option>
                  <option value="parent">Родитель</option>
                  <option value="spouse">Супруг / супруга</option>
                  <option value="sibling">Брат / сестра</option>
                  <option value="other">Другая связь</option>
                </select>
              </div>
            )}
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-title">
            <Icon name="image" /> Фото профиля
          </div>
          <div className="photo-card">
            <div className="photo-main-content">
              <div className="photo-main-preview">{photoUrl ? <img src={photoUrl} alt="Фото профиля" /> : <Icon name="user" size={34} />}</div>
              <div>
                <div className="photo-title">Фото профиля</div>
                <div className="photo-hint">После загрузки выберете квадратный кадр для круга. Видео, аудио и другие фото — во вкладке «Медиа»</div>
                <div className="photo-actions">
                  <button type="button" onClick={choosePhoto}>
                    <Icon name="upload" /> Загрузить
                  </button>
                  {photoUrl && (
                    <button type="button" onClick={recrop}>
                      <Icon name="target" /> Изменить кадр
                    </button>
                  )}
                  {photoUrl && (
                    <button type="button" className="ghost danger" onClick={removePhoto}>
                      <Icon name="trash" /> Удалить
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <button type="button" className={'advanced-toggle' + (advanced ? ' open' : '')} onClick={() => setAdvanced(a => !a)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" /> Даты, места, контакты, соцсети
          </span>
          <span className="chev">
            <Icon name="chevron-down" />
          </span>
        </button>
        <div className={'advanced-fields' + (advanced ? ' open' : '')}>
          <div className="form-grid">{ADVANCED.map(field)}</div>
          <SocialFields
            value={socials}
            onChange={v => {
              setSocials(v);
              touch();
            }}
          />
        </div>

        <label className="switch-row" htmlFor="f_deceased">
          <span className="switch-text">
            <b>Человек умер</b>
            <small>Включите, чтобы указать дату и место смерти, место захоронения</small>
          </span>
          <span className="switch">
            <input type="checkbox" id="f_deceased" checked={deceased} onChange={e => toggleDeceased(e.target.checked)} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </span>
        </label>

        {deceased && (
          <div className="death-block open">
            <div className="form-section-title">
              <Icon name="book" /> Смерть
            </div>
            <div className="form-grid">{DEATH.map(field)}</div>
            <div className="form-section-title" style={{ marginTop: 22 }}>
              <Icon name="pin" /> Место захоронения
            </div>
            <div className="form-grid">
              {(
                [
                  ['cemetery', 'Кладбище', 'Название кладбища'],
                  ['address', 'Адрес / населённый пункт', ''],
                  ['plot', 'Участок, ряд, место', 'Например: уч. 12, ряд 4, место 7'],
                ] as const
              ).map(([k, label, ph]) => (
                <div className="field full" key={k}>
                  <label htmlFor={'b_' + k}>{label}</label>
                  <input
                    id={'b_' + k}
                    value={burial[k]}
                    placeholder={ph}
                    autoComplete="off"
                    onChange={e => {
                      setBurial(b => ({ ...b, [k]: e.target.value }));
                      touch();
                    }}
                  />
                </div>
              ))}
              <BurialMapPicker
                point={burial.lat != null && burial.lng != null ? { lat: burial.lat, lng: burial.lng } : null}
                onChange={pt => {
                  setBurial(b => ({ ...b, lat: pt?.lat ?? null, lng: pt?.lng ?? null }));
                  touch();
                }}
                onFoundCemetery={name => setBurial(b => (b.cemetery.trim() ? b : { ...b, cemetery: name }))}
              />
              <div className="field full">
                <label htmlFor="b_notes">Заметки</label>
                <textarea
                  id="b_notes"
                  value={burial.notes}
                  placeholder="Как найти, ориентиры, кто ухаживает…"
                  onChange={e => {
                    setBurial(b => ({ ...b, notes: e.target.value }));
                    touch();
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="ghost" onClick={close}>
          Отмена
        </button>
        <button className="primary" onClick={save}>
          {isNew ? (
            <>
              <Icon name="plus" /> Добавить
            </>
          ) : (
            'Сохранить'
          )}
        </button>
      </div>
    </>
  );
}

/** Ники в соцсетях: сеть + ник (ссылка строится автоматически). */
function SocialFields({ value, onChange }: { value: Social[]; onChange(v: Social[]): void }) {
  const used = new Set(value.map(s => s.network));
  const free = SOCIAL_NETWORKS.filter(n => !used.has(n.id));
  return (
    <div className="socials-edit">
      <div className="form-section-title" style={{ marginTop: 22 }}>
        <Icon name="globe" /> Соцсети и мессенджеры
      </div>
      {value.map((s, i) => (
        <div className="social-row" key={s.network}>
          <div className="field">
            <label>{SOCIAL_NETWORKS.find(n => n.id === s.network)?.label}</label>
            <input
              value={s.handle}
              placeholder={s.network === 'whatsapp' ? 'Номер телефона' : 'Ник или ссылка на профиль'}
              autoComplete="off"
              onChange={e => onChange(value.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)))}
            />
          </div>
          <button type="button" className="ghost danger icon-button" title="Убрать" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      {free.length > 0 && (
        <div className="field social-add">
          <label htmlFor="social_add">Добавить соцсеть</label>
          <select
            id="social_add"
            value=""
            onChange={e => {
              if (e.target.value) onChange([...value, { network: e.target.value as SocialNetwork, handle: '' }]);
            }}
          >
            <option value="">Выберите…</option>
            {free.map(n => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export { mediaRegistry };
