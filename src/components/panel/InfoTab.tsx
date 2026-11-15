import { burialFilled, SOCIAL_NETWORKS, socialUrl } from '../../domain/normalize';
import { place } from '../../domain/people';
import type { Person } from '../../domain/types';
import { editPersonFlow } from '../../flows/personFlows';
import { Icon } from '../../ui/Icon';
import { BurialMiniMap } from './BurialMap';

function InfoCard({ rows }: { rows: [string, string | undefined][] }) {
  const filled = rows.filter(([, v]) => v && String(v).trim());
  if (!filled.length) return null;
  return (
    <div className="info-card">
      {filled.map(([k, v]) => (
        <div className="info-row" key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

const has = (rows: [string, string | undefined][]) => rows.some(([, v]) => v && String(v).trim());

export function InfoTab({ person: p }: { person: Person }) {
  const main: [string, string][] = [
    ['Фамилия', p.lastName],
    ['Имя', p.firstName],
    ['Отчество', p.middleName],
    ['Девичья фамилия', p.maidenName],
    ['Пол', p.gender],
    ['Профессия', p.occupation],
  ];
  const life: [string, string][] = [
    ['Дата рождения', p.birth],
    ['Место рождения', place(p.birthCity, p.birthCountry)],
    ['Дата смерти', p.death],
    ['Место смерти', place(p.deathCity, p.deathCountry)],
    ['Место проживания', place(p.residenceCity, p.residenceCountry)],
  ];
  const contacts: [string, string][] = [
    ['Телефон', p.phone],
    ['Email', p.email],
    ['Адрес', p.address],
  ];
  const b = p.burial;
  const burial = p.deceased && burialFilled(b);

  return (
    <div className="sp-body">
      {has(main) && (
        <>
          <div className="sp-section-title">Личные данные</div>
          <InfoCard rows={main} />
        </>
      )}
      {has(life) && (
        <>
          <div className="sp-section-title">Жизнь</div>
          <InfoCard rows={life} />
        </>
      )}
      {has(contacts) && (
        <>
          <div className="sp-section-title">Контакты</div>
          <InfoCard rows={contacts} />
        </>
      )}
      {p.socials.length > 0 && (
        <>
          <div className="sp-section-title">Соцсети</div>
          <div className="socials">
            {p.socials.map(s => {
              const url = socialUrl(s);
              const net = SOCIAL_NETWORKS.find(n => n.id === s.network)!;
              return url ? (
                <a key={s.network + s.handle} className="social-link" href={url} target="_blank" rel="noopener noreferrer">
                  <Icon name="globe" />
                  <span>
                    <small>{net.label}</small>
                    {s.handle}
                  </span>
                </a>
              ) : null;
            })}
          </div>
        </>
      )}
      {burial && (
        <>
          <div className="sp-section-title">Место захоронения</div>
          <InfoCard
            rows={[
              ['Кладбище', b.cemetery],
              ['Адрес', b.address],
              ['Участок', b.plot],
            ]}
          />
          {b.lat != null && b.lng != null && <BurialMiniMap lat={b.lat} lng={b.lng} />}
          {b.notes && <div className="info-card burial-notes">{b.notes}</div>}
        </>
      )}
      {!has(life) && !has(contacts) && !burial && !p.socials.length && (
        <div className="sp-empty">
          Даты, места и контакты не указаны
          <div>
            <button className="primary" onClick={() => editPersonFlow(p.id)}>
              <Icon name="edit" /> Заполнить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
