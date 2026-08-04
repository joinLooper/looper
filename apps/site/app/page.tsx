import Link from "next/link";
import { Co2eLabel } from "../components/co2e-label";

const journeySteps = [
  {
    title: "真實蔬食選擇",
    description: "對自己和環境，多一點友善。",
    image: "/assets/home/journey-01.png",
  },
  {
    title: "到合作店家",
    description: "在合作店家完成一餐蔬食。",
    image: "/assets/home/journey-02.png",
  },
  {
    title: "店家確認",
    description: "輸入任務碼，由店家完成確認。",
    image: "/assets/home/journey-03.png",
  },
  {
    title: "拿到成果",
    description: "EXP、星星與減碳成果回到 Looper。",
    image: "/assets/home/journey-04.png",
  },
  {
    title: "世界成長",
    description: "森林、樹屋與居民生活繼續成長。",
    image: "/assets/home/journey-05.png",
  },
];

const results = [
  {
    title: "經驗值 EXP",
    shortTitle: "EXP",
    description: "累積玩家在 Looper 裡的行動與成長。",
    className: "result-card--exp",
  },
  {
    title: "星星",
    shortTitle: "★",
    description: "完成任務後取得，可以再拿去兌換蔬食。",
    className: "result-card--star",
  },
  {
    title: (
      <>
        減碳量 <Co2eLabel />
      </>
    ),
    shortTitle: <Co2eLabel />,
    description: "記錄真實蔬食行動帶回來的減碳成果。",
    className: "result-card--carbon",
  },
];

export default function HomePage() {
  const playerEntryUrl = process.env.PUBLIC_PLAYER_ENTRY_URL;

  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="home-title">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">WELCOME TO LOOPER</p>
            <h1 id="home-title">把每一次蔬食選擇，帶回一個會成長的世界</h1>
            <div className="hero__body">
              <p>
                在真實生活完成蔬食任務，由合作店家確認後，你會拿到 EXP、星星與
                <Co2eLabel />。
              </p>
              <p>
                成果會回到森林、樹屋、核心樹與居民生活，讓 Looper 世界繼續成長。
              </p>
            </div>
            <div className="button-row">
              <Link className="button button--primary" href="/player">
                認識玩家世界
              </Link>
              <Link className="button button--secondary" href="/partners">
                了解合作店家
              </Link>
            </div>
          </div>

          <div className="hero__visual">
            <picture>
              <source
                media="(max-width: 767px)"
                srcSet="/assets/home/home-hero-mobile.webp"
              />
              <img
                className="hero__image"
                src="/assets/home/home-hero-desktop.webp"
                width="880"
                height="840"
                alt="Looper 森林樹屋前，長尾土撥鼠與兔兔一起向前走"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
        </div>
      </section>

      <section className="journey section" aria-labelledby="journey-title">
        <div className="container">
          <div className="section-intro section-intro--center">
            <p className="eyebrow">FROM ONE CHOICE TO GROWTH</p>
            <h2 id="journey-title">一次真實蔬食行動，會讓世界產生成長</h2>
            <p>
              玩家先在 Looper 看到任務。到合作店家完成蔬食行動後，由店家確認，
              成果就會回到 Looper 世界。
            </p>
          </div>
          <ol className="journey-steps">
            {journeySteps.map((step, index) => (
              <li key={step.title}>
                <span className="journey-steps__number" aria-hidden="true">
                  {index + 1}
                </span>
                <img
                  src={step.image}
                  width="250"
                  height="210"
                  alt=""
                  aria-hidden="true"
                />
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="results section section--fresh"
        aria-labelledby="home-results-title"
      >
        <div className="container results__grid">
          <div className="results__intro">
            <p className="eyebrow">WHAT YOUR ACTION LEAVES BEHIND</p>
            <h2 id="home-results-title">完成任務後，你會拿到三種成果</h2>
            <p>同一次行動，同時留下玩家成長、星星與減碳紀錄。</p>
          </div>
          <dl className="result-list">
            {results.map((result) => (
              <div
                className={`result-card ${result.className}`}
                key={result.className}
              >
                <div className="result-card__icon" aria-hidden="true">
                  {result.shortTitle}
                </div>
                <dt>{result.title}</dt>
                <dd>{result.description}</dd>
              </div>
            ))}
            <div className="result-source">
              <strong>完成蔬食餐點</strong>
              <span aria-hidden="true">→</span>
              <span>合作店家完成確認，成果便會回到 Looper 世界</span>
            </div>
          </dl>
        </div>
      </section>

      <section className="stars section" aria-labelledby="stars-title">
        <div className="container stars__grid">
          <div className="stars__copy">
            <p className="eyebrow">STARS RETURN TO REAL LIFE</p>
            <h2 id="stars-title">星星可以再拿去兌換蔬食</h2>
            <p>完成任務後，你會拿到星星。</p>
            <p>
              星星可以在開放兌換的合作內容中再次使用，讓遊戲裡的成果回到下一次真實蔬食選擇。
            </p>
            <Link className="button button--primary" href="/player">
              認識玩家世界
            </Link>
          </div>
          <div className="stars__visual">
            <img
              src="/assets/home/home-stars-desktop.webp"
              width="880"
              height="680"
              alt="土撥鼠把星星交給兔兔，旁邊顯示可兌換的蔬食餐點"
            />
          </div>
        </div>
      </section>

      <section className="partner section" aria-labelledby="partner-flow-title">
        <div className="container partner__grid">
          <div className="partner__visual">
            <img
              src="/assets/home/home-partner-loop-complete-v4.webp"
              width="1672"
              height="941"
              alt="玩家在蔬食餐廳與店家完成蔬食任務，手機、餐點與桌面完整呈現，成果為 EXP +120、星星 +1、CO2e +0.8 kg"
            />
            <div className="partner-visual-result" aria-label="結果回到 Looper">
              <strong className="partner-visual-result__title">
                結果回到 Looper
              </strong>
              <dl className="partner-visual-result__rows">
                <div className="partner-visual-result__row">
                  <dt>
                    <span
                      className="partner-visual-result__icon"
                      aria-hidden="true"
                    >
                      EXP
                    </span>
                    <span>
                      EXP<small>經驗值</small>
                    </span>
                  </dt>
                  <dd>+120</dd>
                </div>
                <div className="partner-visual-result__row">
                  <dt>
                    <span
                      className="partner-visual-result__icon partner-visual-result__icon--star"
                      aria-hidden="true"
                    >
                      ★
                    </span>
                    <span>星星</span>
                  </dt>
                  <dd>+1</dd>
                </div>
                <div className="partner-visual-result__row">
                  <dt>
                    <span
                      className="partner-visual-result__icon"
                      aria-hidden="true"
                    >
                      <Co2eLabel />
                    </span>
                    <span>
                      <Co2eLabel />
                      <small>減碳量</small>
                    </span>
                  </dt>
                  <dd>+0.8 kg</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="partner__copy">
            <p className="eyebrow">PLAYERS AND PARTNERS, TOGETHER</p>
            <h2 id="partner-flow-title">玩家與店家，一起完成一個行動循環</h2>
            <p>玩家讓任務在真實生活發生，店家接住玩家的蔬食行動並完成確認。</p>
            <p>
              Looper 再把 EXP、星星與 <Co2eLabel /> 帶回遊戲世界。
            </p>
            <div className="partner__result">
              <strong>結果回到 Looper</strong>
              <span>
                EXP +120　星星 +1　
                <Co2eLabel /> +0.8 kg
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="city section section--fresh"
        aria-labelledby="home-city-title"
      >
        <div className="container city__grid">
          <div className="city__content">
            <p className="eyebrow">THE CITY GROWS WITH EVERY PLACE</p>
            <h2 id="home-city-title">
              每加入一間店，城市就多一個可以前往的地方
            </h2>
            <p>一間合作店家加入後，玩家會多一個可以完成任務的真實地點。</p>
            <p>店家與任務逐步增加後，蔬食餐廳區與城市內容也會依序開放。</p>
            <Link className="button button--primary" href="/partners">
              看合作店家
            </Link>
          </div>
          <div className="city__visual">
            <img
              src="/assets/home/home-city.webp"
              width="848"
              height="357"
              alt="綠意街區中的 Green Table 蔬食餐廳"
            />
          </div>
        </div>
      </section>

      <section
        className="routes section section--warm"
        aria-labelledby="routes-title"
      >
        <div className="container routes__grid">
          <div className="routes__intro">
            <p className="eyebrow">CHOOSE YOUR WAY IN</p>
            <h2 id="routes-title">你想先從哪裡進入？</h2>
            <div className="routes__intro-body">
              <p>
                走進森林，開始你的 Looper 生活；
                <br />
                或讓你經營的店，成為世界裡一處新的相遇。
              </p>
            </div>
          </div>

          <div className="route-panel">
            <article className="route-card route-card--player">
              <svg
                className="route-card__icon"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <path d="M32 5C20 15 12 26 12 38c0 12 9 21 20 21s20-9 20-21C52 26 44 15 32 5Z" />
                <path d="M32 19v37M22 32l10 8M42 28l-10 8" />
              </svg>
              <div className="route-card__copy">
                <h3>我是玩家</h3>
                <p>進入 Looper 世界</p>
              </div>
              {playerEntryUrl ? (
                <a
                  className="route-card__action"
                  href={playerEntryUrl}
                  aria-label="進入 Looper 世界"
                >
                  <span aria-hidden="true">→</span>
                </a>
              ) : (
                <span
                  className="route-card__action route-card__action--disabled"
                  role="link"
                  aria-disabled="true"
                  aria-label="玩家入口準備中"
                >
                  <span aria-hidden="true">→</span>
                </span>
              )}
            </article>

            <article className="route-card route-card--partner">
              <svg
                className="route-card__icon"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <path d="M11 24h42l-4-12H15l-4 12Z" />
                <path d="M14 24v28h36V24M9 52h46" />
                <path d="M21 34h10v18H21zM38 34h7v7h-7z" />
                <path d="M11 24c0 4 3 7 7 7s7-3 7-7c0 4 3 7 7 7s7-3 7-7c0 4 3 7 7 7s7-3 7-7" />
              </svg>
              <div className="route-card__copy">
                <h3>我是合作店家</h3>
                <p>讓我的店加入 Looper</p>
              </div>
              <Link
                className="route-card__action"
                href="/apply"
                aria-label="讓我的店加入 Looper"
              >
                <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
