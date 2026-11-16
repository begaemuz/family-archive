import type { ReactNode } from 'react';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
// Фото: Unsplash (unsplash.com), лицензия Unsplash — свободное использование
import imgGrandpa from '../../assets/landing/grandpa.webp';
import imgGrandma from '../../assets/landing/grandma.webp';
import imgDad from '../../assets/landing/dad.webp';
import imgMom from '../../assets/landing/mom.webp';
import imgAunt from '../../assets/landing/aunt.webp';
import imgSon from '../../assets/landing/son.webp';
import imgDaughter from '../../assets/landing/daughter.webp';
import imgAlbum from '../../assets/landing/album.webp';
import imgSeniors from '../../assets/landing/seniors.webp';
import imgGrandmaBaby from '../../assets/landing/grandma-baby.webp';

const REPO = 'https://github.com/begaemuz/family-archive';

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: 'tree', title: 'Родословное древо', text: 'Поколения выстраиваются сами. Степени родства — двоюродные, троюродные, родня по браку — считаются автоматически.' },
  { icon: 'image', title: 'Фото, видео и голоса', text: 'Альбом каждого человека: фотографии, видео и аудиозаписи до 200 МБ на файл. Плюс сканы документов.' },
  { icon: 'story', title: 'Семейные истории', text: 'Записывайте воспоминания и отмечайте в них людей — история появится в карточке каждого.' },
  { icon: 'book-pdf', title: 'PDF-книга', text: 'Одна кнопка — и готова красивая книга: схема древа, страницы людей, истории и указатель имён.' },
  { icon: 'shield', title: 'Шифрование', text: 'AES-256 и Argon2id. Без пароля файл — набор случайных байтов. Пароль нигде не хранится.' },
  { icon: 'globe', title: 'Работает без интернета', text: 'Всё происходит в браузере. После первого открытия сайт работает и офлайн.' },
];

const STEPS: { title: string; text: string }[] = [
  { title: 'Создайте альбом', text: 'Придумайте название и пароль. Регистрация не нужна.' },
  { title: 'Наполните его', text: 'Добавляйте родных, фото, видео, голоса и истории.' },
  { title: 'Сохраните и поделитесь', text: 'Отправьте файл .family родственникам, а пароль — отдельно.' },
];

const PRIVACY = [
  'Нет серверов: архив никуда не загружается',
  'Нет регистрации, аналитики и рекламы',
  'Пароль не хранится и не передаётся — восстановить его нельзя',
  'Открытый исходный код — можно проверить',
];

/** Шапка стартовых экранов: логотип, разделы лендинга, тема, «Открыть архив». */
export function LandingHeader({ home, onHome, onOpen }: { home: boolean; onHome(): void; onOpen(): void }) {
  const theme = useUi(s => s.theme);
  const setTheme = useUi(s => s.setTheme);
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <header className="lp-header">
      <button className="lp-brand" onClick={onHome} title="На главную">
        <span className="brand-logo">
          <Logo size={36} />
        </span>
        Rodiva
      </button>
      {home && (
        <nav className="lp-nav">
          <button onClick={() => go('features')}>Возможности</button>
          <button onClick={() => go('how')}>Как это работает</button>
          <button onClick={() => go('privacy')}>Приватность</button>
        </nav>
      )}
      <div className="lp-header-actions">
        <button className="ghost icon-button" title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="lp-open" onClick={onOpen}>
          <Icon name="unlock" />
          <span>Открыть архив</span>
        </button>
      </div>
    </header>
  );
}

/** Иллюстрация: три поколения с фотографиями в кругах — как карточки на холсте. */
function HeroTree() {
  const R = 30;
  const nodes: [number, number, 'm' | 'f', string, string][] = [
    [120, 58, 'm', imgGrandpa, 'Дедушка'],
    [220, 58, 'f', imgGrandma, 'Бабушка'],
    [70, 178, 'f', imgAunt, 'Тётя'],
    [170, 178, 'm', imgDad, 'Папа'],
    [270, 178, 'f', imgMom, 'Мама'],
    [170, 298, 'm', imgSon, 'Сын'],
    [270, 298, 'f', imgDaughter, 'Дочь'],
  ];
  return (
    <svg className="lp-tree" viewBox="0 0 340 372" role="img" aria-label="Пример родословного древа с фотографиями">
      <defs>
        <clipPath id="lp-av">
          <circle cx="0" cy="0" r={R - 3} />
        </clipPath>
      </defs>
      <g fill="none" strokeWidth="2.5" strokeLinecap="round">
        <path d="M150 58 H190" stroke="var(--line-spouse)" />
        <path d="M170 58 V118 M70 118 H170 M70 118 V148 M170 118 V148" stroke="var(--line-parent)" />
        <path d="M200 178 H240" stroke="var(--line-spouse)" />
        <path d="M220 178 V238 M170 238 H270 M170 238 V268 M270 238 V268" stroke="var(--line-parent)" />
      </g>
      {nodes.map(([x, y, g, src, label]) => (
        <g key={label} transform={`translate(${x} ${y})`}>
          <circle r={R} fill="var(--panel)" stroke={g === 'm' ? 'var(--male)' : 'var(--female)'} strokeWidth="3" />
          <image href={src} x={-(R - 3)} y={-(R - 3)} width={(R - 3) * 2} height={(R - 3) * 2} clipPath="url(#lp-av)" preserveAspectRatio="xMidYMid slice" />
          <text y={R + 16} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--muted)">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const MOMENTS: { src: string; title: string; text: string }[] = [
  { src: imgAlbum, title: 'Старые фотографии', text: 'Отсканируйте семейный альбом, пока снимки не выцвели, и подпишите, кто на них.' },
  { src: imgSeniors, title: 'Рассказы старших', text: 'Запишите голос бабушки и дедушки — как они познакомились, где жили, чем гордились.' },
  { src: imgGrandmaBaby, title: 'Новые поколения', text: 'Добавляйте внуков и правнуков — у каждого будет своё место в истории семьи.' },
];

export function Landing({
  draftCard,
  onCreate,
  onOpen,
}: {
  draftCard: ReactNode;
  onCreate(): void;
  onOpen(): void;
}) {
  return (
    <main className="lp">
      {/* ---------- первый экран ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-text">
          <div className="lp-eyebrow">
            <Icon name="lock" size={14} /> Приватно · Бесплатно · Без регистрации
          </div>
          <h1>
            История вашей семьи принадлежит <span>только вашей семье</span>
          </h1>
          <p className="lp-lead">
            Родословное древо, фотографии, видео, голоса и истории — в одном зашифрованном файле <b>.family</b>. Он хранится у вас, а не на чужом сервере.
          </p>
          {draftCard}
          <div className="lp-cta">
            <button className="primary lp-btn" onClick={onCreate}>
              <Icon name="plus" /> Создать семейный альбом
            </button>
            <button className="lp-btn" onClick={onOpen}>
              <Icon name="unlock" /> Открыть архив .family
            </button>
          </div>
          <div className="lp-cta-sub">
            <span className="lp-drop">
              <Icon name="download" size={15} /> или перетащите файл на страницу
            </span>
          </div>
        </div>
        <div className="lp-hero-art" aria-hidden="true">
          <div className="lp-art-card">
            <HeroTree />
            <span className="lp-float f1">
              <Icon name="shield" size={14} /> AES-256
            </span>
            <span className="lp-float f2">
              <Icon name="book-pdf" size={14} /> PDF-книга
            </span>
            <span className="lp-float f3">
              <Icon name="audio" size={14} /> Голоса родных
            </span>
          </div>
        </div>
      </section>

      {/* ---------- лица и голоса ---------- */}
      <section className="lp-section" id="moments">
        <h2>Сохраните то, что нельзя купить</h2>
        <p className="lp-section-sub">Лица, голоса и истории родных — в одном месте, на поколения вперёд</p>
        <div className="lp-moments">
          {MOMENTS.map(m => (
            <figure className="lp-moment" key={m.title}>
              <img src={m.src} alt="" loading="lazy" width={960} height={640} />
              <figcaption>
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- возможности ---------- */}
      <section className="lp-section" id="features">
        <h2>Всё о семье — в одном месте</h2>
        <p className="lp-section-sub">Коротко о том, что умеет архив</p>
        <div className="lp-features">
          {FEATURES.map(f => (
            <article className="lp-feature" key={f.title}>
              <span className="lp-feature-ico">
                <Icon name={f.icon} size={22} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- как это работает ---------- */}
      <section className="lp-section" id="how">
        <h2>Как это работает</h2>
        <p className="lp-section-sub">Три шага — и семейная история под защитой</p>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li className="lp-step" key={s.title}>
              <span className="lp-step-n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- приватность ---------- */}
      <section className="lp-section" id="privacy">
        <div className="lp-privacy">
          <div>
            <span className="lp-feature-ico big">
              <Icon name="shield" size={28} />
            </span>
            <h2>Ваши данные — только ваши</h2>
            <p className="lp-section-sub left">
              Архив шифруется прямо в браузере до того, как попасть в файл. Даже если файл потеряется или попадёт в чужие руки, без пароля его не прочитать.
            </p>
          </div>
          <ul className="lp-checks">
            {PRIVACY.map(t => (
              <li key={t}>
                <span className="lp-check">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- финальный призыв ---------- */}
      <section className="lp-final">
        <h2>Начните семейный архив сегодня</h2>
        <p>Пока старшие могут рассказать, как всё было.</p>
        <button className="primary lp-btn" onClick={onCreate}>
          <Icon name="plus" /> Создать семейный альбом
        </button>
      </section>

      <footer className="lp-footer">
        <span>Rodiva — семейный архив, открытый проект · Фото: Unsplash</span>
        <span className="lp-footer-links">
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Исходный код на GitHub
          </a>
        </span>
      </footer>
    </main>
  );
}
