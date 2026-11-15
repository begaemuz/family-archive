import type { ReactNode } from 'react';
import { useUi } from '../../store/uiStore';
import { Icon } from '../../ui/Icon';

const REPO = 'https://github.com/begaemuz/family-archive';

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: 'tree', title: 'Родословное древо', text: 'Поколения выстраиваются сами. Степени родства — двоюродные, троюродные, родня по браку — считаются автоматически.' },
  { icon: 'image', title: 'Фото, видео и голоса', text: 'Альбом каждого человека: фотографии, видео и аудиозаписи до 200 МБ на файл. Плюс сканы документов.' },
  { icon: 'story', title: 'Семейные истории', text: 'Записывайте воспоминания и отмечайте в них людей — история появится в карточке каждого.' },
  { icon: 'book-pdf', title: 'PDF-книга', text: 'Одна кнопка — и готова красивая книга: схема древа, страницы людей, истории и указатель имён.' },
  { icon: 'shield', title: 'Шифрование', text: 'AES-256 и Argon2id. Без пароля файл — набор случайных байтов. Пароль нигде не хранится.' },
  { icon: 'globe', title: 'Работает без интернета', text: 'Всё происходит в браузере. После первого открытия сайт работает офлайн, есть и версия одним файлом.' },
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
          <Icon name="tree" />
        </span>
        Семейный архив
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

/** Иллюстрация: три поколения в кругах, как на холсте. */
function HeroTree() {
  const nodes: [number, number, 'm' | 'f', string][] = [
    [120, 60, 'm', 'ИП'],
    [220, 60, 'f', 'АС'],
    [70, 175, 'f', 'ОИ'],
    [170, 175, 'm', 'ВИ'],
    [270, 175, 'f', 'МК'],
    [120, 290, 'm', 'СВ'],
    [220, 290, 'f', 'ЕВ'],
  ];
  return (
    <svg className="lp-tree" viewBox="0 0 340 350" role="img" aria-label="Пример родословного древа">
      <g fill="none" strokeWidth="2.5" strokeLinecap="round">
        <path d="M150 60 H190" stroke="var(--line-spouse)" />
        <path d="M170 60 V118 M70 118 H170 M70 118 V147 M170 118 V147" stroke="var(--line-parent)" />
        <path d="M200 175 H240" stroke="var(--line-spouse)" />
        <path d="M220 175 V233 M120 233 H220 M120 233 V262 M220 233 V262" stroke="var(--line-parent)" />
      </g>
      {nodes.map(([x, y, g, t]) => (
        <g key={t}>
          <circle cx={x} cy={y} r="29" fill="var(--panel)" stroke={g === 'm' ? 'var(--male)' : 'var(--female)'} strokeWidth="3" />
          <circle cx={x} cy={y} r="24" fill={g === 'm' ? 'var(--male)' : 'var(--female)'} opacity=".14" />
          <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill={g === 'm' ? 'var(--male)' : 'var(--female)'}>
            {t}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Landing({
  draftCard,
  onCreate,
  onOpen,
  onImport,
}: {
  draftCard: ReactNode;
  onCreate(): void;
  onOpen(): void;
  onImport(): void;
}) {
  const offline = import.meta.env.PROD;
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
            <button className="lp-link" onClick={onImport}>
              <Icon name="upload" size={15} /> Перенести дерево из старой версии
            </button>
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
        <span>Семейный архив — открытый проект</span>
        <span className="lp-footer-links">
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Исходный код на GitHub
          </a>
          {offline && (
            <a href="./family-archive.html" download>
              Скачать офлайн-версию (один файл)
            </a>
          )}
        </span>
      </footer>
    </main>
  );
}
