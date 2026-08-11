import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Co2eLabel } from "../../components/co2e-label";

export const metadata: Metadata = {
  title: "合作店家｜Looper",
  description:
    "Looper 透過任務、獎勵與城市內容，帶玩家認識店家、前往門市並完成蔬食消費。",
};

const valueLoop = [
  { label: "任務帶動到店", tone: "green" },
  { label: "到店產生消費", tone: "orange" },
  { label: "行動累積成果", tone: "green" },
  { label: "形成回來理由", tone: "orange" },
  { label: "任務帶動再訪", tone: "green" },
];

const dashboardRows = [
  { task: "完成一餐蔬食體驗", time: "12:30", status: "待確認", action: "確認" },
  { task: "認識本店特色餐點", time: "11:45", status: "待查看", action: "查看" },
  { task: "週末蔬食小任務", time: "昨日", status: "已完成", action: "紀錄" },
];

const results = [
  {
    icon: "sprout",
    title: "成長累積",
    system: "EXP",
    lines: ["讓完成的行動", "變成看得見的成長"],
  },
  {
    icon: "star",
    title: "回來的理由",
    system: "星星",
    lines: ["把今天的體驗留下來", "為下一次到店保留期待"],
  },
  {
    icon: "earth",
    title: "永續足跡",
    system: "co2e",
    lines: ["讓每一次蔬食選擇", "留下清楚可見的減碳紀錄"],
  },
];

function PartnerImage({
  src,
  width,
  height,
  alt,
  sizes = "(max-width: 820px) calc(100vw - 48px), 50vw",
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  sizes?: string;
}) {
  return (
    <div className="partners-photo">
      <Image
        src={src}
        width={width}
        height={height}
        sizes={sizes}
        alt={alt}
        loading="eager"
      />
    </div>
  );
}

export default function PartnersPage() {
  return (
    <main id="main-content" className="partners-page">
      <section className="partners-hero" aria-labelledby="partners-title">
        <div className="container partners-hero__grid">
          <div className="partners-hero__copy">
            <p className="eyebrow">TURN ATTENTION INTO VISITS</p>
            <h1 id="partners-title">
              把線上流量帶進<span className="partners-no-break">你的店裡</span>
            </h1>
            <p>
              Looper
              透過任務、獎勵與城市內容，帶玩家認識店家，前往門市並完成蔬食消費。
            </p>
            <p>讓線上曝光多一個轉成實際到店與消費的機會。</p>
            <a className="button button--primary" href="#partner-platform">
              了解 Looper 如何導客
            </a>
          </div>
          <div className="partners-hero__visual">
            <Image
              src="/assets/partners/partner-hero.webp"
              width="740"
              height="720"
              sizes="(max-width: 820px) 100vw, 52vw"
              alt="玩家拿著手機抵達一間溫暖明亮的蔬食店"
              priority
            />
          </div>
        </div>
      </section>

      <section
        id="partner-platform"
        className="partners-section partners-platform"
        aria-labelledby="partner-platform-title"
      >
        <div className="container partners-platform__grid">
          <div className="value-loop" aria-label="Looper 店家價值循環">
            <p className="value-loop__eyebrow">LOOPER VALUE LOOP</p>
            <h2>持續帶動到店的價值循環</h2>
            <div className="value-loop__diagram">
              <div className="value-loop__track" aria-hidden="true" />
              {valueLoop.map((item, index) => (
                <span
                  className={`value-loop__node value-loop__node--${index + 1} value-loop__node--${item.tone}`}
                  key={item.label}
                >
                  {item.label}
                </span>
              ))}
              <div className="value-loop__logo">
                <Image
                  src="/assets/brand/Looper Logo_橫式02.png"
                  width="1894"
                  height="904"
                  sizes="160px"
                  alt="Looper"
                />
              </div>
            </div>
          </div>
          <div className="partners-copy">
            <p className="eyebrow">A PLATFORM FOR LOCAL GROWTH</p>
            <h2 id="partner-platform-title">
              加入一個真正帶動到店
              <span className="partners-no-break">行動的平台</span>
            </h2>
            <p>Looper 將店家、餐點與特色體驗安排進玩家任務。</p>
            <p>
              玩家帶著明確的到店目的前來，店家也多一條接觸新客、介紹餐點與創造消費機會的管道。
            </p>
            <p>
              店家加入的是同一套顧客、任務確認與玩家獎勵流程，不需要從頭規劃完整活動。
            </p>
          </div>
        </div>
      </section>

      <section
        className="partners-section partners-new"
        aria-labelledby="partner-new-title"
      >
        <div className="container partners-split">
          <div className="partners-copy">
            <p className="eyebrow">REACH NEW CUSTOMERS</p>
            <h2 id="partner-new-title">
              讓更多新客認識你的店並
              <span className="partners-no-break">實際走進來</span>
            </h2>
            <p>任務會提供清楚的到店理由，幫助玩家開始第一次嘗試。</p>
            <p>
              店家可以透過適合的任務內容，介紹特色餐點、蔬食品項與門市體驗。
            </p>
          </div>
          <PartnerImage
            src="/assets/partners/partner-new-customer.webp"
            width={630}
            height={560}
            alt="新客第一次走進蔬食店，店員在櫃台迎接"
          />
        </div>
      </section>

      <section
        className="partners-section partners-action"
        aria-labelledby="partner-action-title"
      >
        <div className="container partners-split partners-split--image-first">
          <PartnerImage
            src="/assets/partners/partner-real-action.webp"
            width={544}
            height={590}
            alt="店員在餐桌旁協助玩家確認已完成的蔬食任務"
          />
          <div className="partners-copy">
            <p className="eyebrow">DRIVE REAL ACTION</p>
            <h2 id="partner-action-title">
              用任務帶人進店也帶動
              <span className="partners-no-break">餐點消費</span>
            </h2>
            <p>Looper 將餐點與到店體驗安排進任務內容。</p>
            <p>玩家依任務前往店家並完成蔬食消費，再由店員進行簡單確認。</p>
            <p>
              任務成立後，玩家會取得 EXP、星星與 <Co2eLabel />
              紀錄，成果也會回到 Looper 世界。
            </p>
            <dl className="partners-mini-results">
              <div>
                <dt>EXP</dt>
                <dd>經驗值</dd>
              </div>
              <div>
                <dt aria-label="星星">★</dt>
                <dd>星星</dd>
              </div>
              <div>
                <dt>
                  <Co2eLabel />
                </dt>
                <dd>減碳紀錄</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section
        className="partners-section partners-return"
        aria-labelledby="partner-return-title"
      >
        <div className="container partners-split">
          <div className="partners-copy">
            <p className="eyebrow">GIVE THEM A REASON TO RETURN</p>
            <h2 id="partner-return-title">
              讓一次到店延續成下一次
              <span className="partners-no-break">回來的理由</span>
            </h2>
            <p>玩家完成任務後，會繼續累積任務進度、星星與世界成長紀錄。</p>
            <p>
              後續推出的新任務與合作內容，可以再次提供前往店家的理由，也讓店家增加與熟客持續互動的機會。
            </p>
          </div>
          <PartnerImage
            src="/assets/partners/partner-return.webp"
            width={630}
            height={570}
            alt="再次到店的玩家與熟悉的店員自然互動"
          />
        </div>
      </section>

      <section
        className="partners-section partners-manage"
        aria-labelledby="partner-manage-title"
      >
        <div className="container partners-split partners-split--image-first">
          <div
            className="merchant-dashboard"
            aria-label="青禾蔬食任務與確認店家專區示意"
          >
            <header className="merchant-dashboard__header">
              <div>
                <strong>青禾蔬食</strong>
                <span>目前分店｜信義門市</span>
              </div>
              <span className="merchant-dashboard__status">
                ● Looper 任務運作中
              </span>
            </header>
            <h3>任務與確認</h3>
            <div className="merchant-dashboard__tabs" aria-hidden="true">
              <span>任務概況</span>
              <span className="is-active">待確認 2</span>
              <span>完成紀錄</span>
            </div>
            <div className="merchant-dashboard__summary">
              <div>
                <span>本月完成</span>
                <strong>12</strong>
              </div>
              <div>
                <span>待確認</span>
                <strong>2</strong>
              </div>
              <div>
                <span>今日需處理</span>
                <strong>1</strong>
              </div>
            </div>
            <div className="merchant-dashboard__chart">
              <strong>本月任務完成趨勢</strong>
              <svg
                viewBox="0 0 520 92"
                role="img"
                aria-label="任務完成趨勢平穩上升"
              >
                <path d="M10 72 C74 72 94 58 146 61 S232 67 277 45 S352 44 392 50 S461 34 510 22" />
                {["10,72", "146,61", "277,45", "392,50", "510,22"].map(
                  (point) => {
                    const [cx, cy] = point.split(",");
                    return <circle key={point} cx={cx} cy={cy} r="4" />;
                  },
                )}
              </svg>
            </div>
            <div className="merchant-dashboard__records">
              <strong>確認紀錄</strong>
              {dashboardRows.map((row) => (
                <div className="merchant-dashboard__row" key={row.task}>
                  <span>{row.task}</span>
                  <time>{row.time}</time>
                  <em className={`status-${row.status}`}>{row.status}</em>
                  <b>{row.action}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="partners-copy">
            <p className="eyebrow">SIMPLE TO MANAGE</p>
            <h2 id="partner-manage-title">
              用簡單的店家專區掌握任務與
              <span className="partners-no-break">確認進度</span>
            </h2>
            <p>
              店家可以集中查看目前任務、待確認內容與完成紀錄，快速掌握現場需要處理的事項。
            </p>
            <p>
              資訊集中、操作簡單，不需要面對複雜的數據系統，也能完成日常合作流程。
            </p>
            <div className="partners-pills" aria-label="店家專區功能">
              <span>目前任務</span>
              <span>待確認內容</span>
              <span>完成紀錄</span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="partners-section partners-team"
        aria-labelledby="partner-team-title"
      >
        <div className="container partners-split partners-split--image-first">
          <PartnerImage
            src="/assets/partners/partner-team.webp"
            width={544}
            height={500}
            alt="店員維持備餐與服務節奏，同時完成簡單任務確認"
          />
          <div className="partners-copy">
            <p className="eyebrow">EASY FOR YOUR TEAM</p>
            <h2 id="partner-team-title">
              維持原本服務節奏也能
              <span className="partners-no-break">開始導客</span>
            </h2>
            <p>Looper 負責玩家端的任務、獎勵與遊戲體驗。</p>
            <p>玩家完成店內行動後，店員只需依正式流程進行簡單確認。</p>
            <p>
              店家不需要另外建立一套遊戲，也不需要讓現場人員學習繁複的操作流程。
            </p>
            <p>實際任務內容與店內確認方式，會在合作開始前完成說明。</p>
          </div>
        </div>
      </section>

      <section
        className="partners-section partners-listing"
        aria-labelledby="partner-listing-title"
      >
        <div className="container partners-split">
          <div className="partners-copy">
            <p className="eyebrow">MORE THAN A LISTING</p>
            <h2 id="partner-listing-title">
              讓店家不只出現在名單上也成為
              <span className="partners-no-break">玩家前往的理由</span>
            </h2>
            <p>Looper 會將店家特色、餐點與玩家任務放在同一段體驗中。</p>
            <p>
              玩家在出發前就能知道這次為什麼前來、可以完成什麼，以及有哪些值得認識的餐點或店家特色。
            </p>
            <p>清楚的任務內容能幫助玩家建立對店家、餐點與體驗的具體印象。</p>
          </div>
          <PartnerImage
            src="/assets/partners/partner-brand-meal.webp"
            width={630}
            height={520}
            alt="特色蔬食餐點與具有品牌氛圍的店內空間"
          />
        </div>
      </section>

      <section
        className="partners-section partners-world"
        aria-labelledby="partner-world-title"
      >
        <div className="container">
          <div className="partners-world__intro">
            <p className="eyebrow">PART OF THE LOOPER WORLD</p>
            <h2 id="partner-world-title">
              每一次到店都會成為世界繼續
              <span className="partners-no-break">生長的一部分</span>
            </h2>
            <p>玩家在真實店家完成蔬食行動，成果也會回到森林與下一次旅程</p>
            <p>讓一間店與一個選擇，慢慢連成持續發生的循環</p>
          </div>
          <div className="partners-world__visual">
            <Image
              src="/assets/partners/partner-world.webp"
              width="1264"
              height="580"
              sizes="(max-width: 820px) calc(100vw - 48px), 1200px"
              alt="真實店家的蔬食餐桌連結到土撥鼠、兔兔與樹屋所在的 Looper 森林"
              loading="eager"
            />
            <span>真實店家 × Looper 世界</span>
          </div>
          <div className="partners-results">
            {results.map((result) => (
              <article className="partners-result" key={result.title}>
                <span
                  className={`partners-result__icon partners-result__icon--${result.icon}`}
                  aria-hidden="true"
                />
                <div>
                  <h3>{result.title}</h3>
                  <strong>
                    {result.system === "co2e" ? <Co2eLabel /> : result.system}
                  </strong>
                  {result.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="partners-final" aria-labelledby="partner-final-title">
        <div className="partners-final__image" aria-hidden="true" />
        <div className="container partners-final__inner">
          <div className="partners-final__copy">
            <p className="eyebrow">GROW WITH LOOPER</p>
            <h2 id="partner-final-title">
              讓 Looper 為你的店增加
              <span className="partners-no-break">更多到店機會</span>
            </h2>
            <p>
              從新客認識、任務到店、餐點體驗到再次參與，讓線上曝光更接近真實消費與長期互動。
            </p>
            <p>
              填寫合作申請後，Looper
              團隊會依店家狀況、合作內容與開放進度，聯絡確認後續安排。
            </p>
            <Link className="button button--primary" href="/apply">
              申請成為合作店家
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
