import Link from "next/link";

const journeySteps = [
  "真實蔬食選擇",
  "到合作店家",
  "店家確認",
  "拿到成果",
  "世界成長",
];

const results = [
  { title: "EXP", description: "累積玩家在 Looper 裡的行動與成長。" },
  { title: "星星", description: "完成任務後取得，可以再拿去兌換蔬食。" },
  { title: "CO₂e", description: "記錄真實蔬食行動帶回來的減碳成果。" },
];

const partnerFlow = ["玩家完成行動", "店家確認任務", "成果回到 Looper"];

export default function HomePage() {
  const playerEntryUrl = process.env.PUBLIC_PLAYER_ENTRY_URL;

  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="home-title">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">真實蔬食行動 × 會成長的遊戲世界</p>
            <h1 id="home-title">把每一次蔬食選擇，帶回一個會成長的世界</h1>
            <div className="hero__body">
              <p>
                在真實生活完成蔬食任務，由合作店家確認後，你會拿到 EXP、星星與
                CO₂e。
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
                srcSet="/assets/hero/Looper_Home_Hero_Logical_Mobile_Crop_v002.png"
              />
              <img
                className="hero__image"
                src="/assets/hero/Looper_Home_Hero_Logical_Desktop_Crop_v002.png"
                width="390"
                height="650"
                alt="Looper 森林中的核心樹、樹屋、兔兔與土撥鼠"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
        </div>
      </section>

      <section
        className="journey section section--mist"
        aria-labelledby="journey-title"
      >
        <div className="container">
          <div className="section-intro section-intro--split">
            <h2 id="journey-title">一次真實蔬食行動，會讓世界產生成長</h2>
            <p className="journey__desktop-copy">
              玩家先在 Looper
              看到任務。部分任務會帶玩家前往合作店家。到店完成蔬食行動後，玩家輸入四位任務碼，再由店家確認。任務完成後，成果就會回到
              Looper 世界。
            </p>
            <p className="journey__mobile-copy">
              玩家先在 Looper
              看到任務。到合作店家完成蔬食行動後，輸入四位任務碼，再由店家確認。成果就會回到
              Looper 世界。
            </p>
          </div>
          <ol className="journey-steps">
            {journeySteps.map((step, index) => (
              <li key={step}>
                <span className="journey-steps__number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="results section section--mist"
        aria-labelledby="home-results-title"
      >
        <div className="container">
          <h2 id="home-results-title">完成任務後，你會拿到三種成果</h2>
          <dl className="result-list">
            {results.map((result, index) => (
              <div className="result-item" key={result.title}>
                <dt>
                  <span
                    className={
                      index === 1
                        ? "result-dot result-dot--orange"
                        : "result-dot"
                    }
                    aria-hidden="true"
                  />
                  {result.title}
                </dt>
                <dd>{result.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="stars section" aria-labelledby="stars-title">
        <div className="container stars__grid">
          <div className="stars__visual" aria-hidden="true">
            <span className="stars__orbit stars__orbit--outer" />
            <span className="stars__orbit stars__orbit--inner" />
            <span className="stars__symbol">★</span>
            <span className="stars__label stars__label--top">
              完成任務 · 拿到星星
            </span>
            <span className="stars__label stars__label--bottom">
              兌換蔬食 · 回到下一次行動
            </span>
          </div>
          <div className="stars__copy">
            <h2 id="stars-title">星星可以再拿去兌換蔬食</h2>
            <p>完成任務後，你會拿到星星。</p>
            <p>
              星星可以在開放兌換的合作內容中再次使用，讓遊戲裡的成果回到下一次真實蔬食選擇。
            </p>
            <p>完成、拿到、兌換，再回到下一個任務。</p>
            <Link className="button button--secondary" href="/player">
              認識玩家世界
            </Link>
          </div>
        </div>
      </section>

      <section className="partner section" aria-labelledby="partner-flow-title">
        <div className="container partner__grid">
          <div className="partner__copy">
            <h2 id="partner-flow-title">玩家與店家，完成同一個行動循環</h2>
            <p>玩家讓任務在真實生活發生。</p>
            <p>店家接住玩家到店後的蔬食行動，並完成任務確認。</p>
            <p>
              Looper 將這次行動轉成 EXP、星星與 CO₂e，再把成果帶回遊戲世界。
            </p>
            <Link className="button button--secondary" href="/partners">
              了解合作店家
            </Link>
          </div>
          <div className="partner__flow-wrap">
            <ol className="partner-flow">
              {partnerFlow.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>一筆真實任務，由玩家發生、店家確認，再把成果帶回共同世界。</p>
          </div>
        </div>
      </section>

      <section className="city section" aria-labelledby="home-city-title">
        <div className="container">
          <div className="city__panel">
            <div className="city__content">
              <h2 id="home-city-title">
                每加入一間店，城市就多一個可以前往的地方
              </h2>
              <p>一間合作店家加入後，玩家會多一個可以完成任務的真實地點。</p>
              <p>店家與任務逐步增加後，蔬食餐廳區與城市內容也會依序開放。</p>
              <Link className="button button--light" href="/partners">
                了解合作店家
              </Link>
            </div>
            <span className="city__texture" aria-hidden="true" />
          </div>
        </div>
      </section>

      <section
        className="routes section section--warm"
        aria-labelledby="routes-title"
      >
        <div className="container">
          <h2 id="routes-title">你想先從哪裡進入？</h2>
          <div className="route-panel">
            <article>
              <p className="route-panel__meta">01 · PLAYER</p>
              <h3>我想成為玩家</h3>
              <p>看看今天可以完成什麼、任務如何進行，以及成果會回到哪裡。</p>
              {playerEntryUrl ? (
                <a className="button button--primary" href={playerEntryUrl}>
                  進入玩家世界
                </a>
              ) : (
                <span className="button button--disabled" aria-disabled="true">
                  玩家入口準備中
                </span>
              )}
            </article>
            <article>
              <p className="route-panel__meta">02 · PARTNER</p>
              <h3>我是店家</h3>
              <p>了解店家如何進入玩家任務、接住到店行動並參與城市合作。</p>
              <Link className="button button--secondary" href="/apply">
                申請成為合作店家
              </Link>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
