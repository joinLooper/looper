import type { Metadata } from "next";
import Image from "next/image";
import { Co2eLabel } from "../../components/co2e-label";

export const metadata: Metadata = {
  title: "玩家世界｜Looper",
  description:
    "和土撥鼠、兔兔一起走進森林、逛逛樹屋，讓每一次停留與真實行動都成為世界裡的新故事。",
};

const invitations = [
  "看看森林今天多了什麼",
  "整理一件想留下的物品",
  "替熟悉的角落添一點細節",
];

const growthStories = [
  {
    title: "陪伴森林裡的日常",
    description: "每一次回來，都有熟悉的陪伴。",
  },
  {
    title: "讓行動留下痕跡",
    description: "生活裡的選擇會回到森林。",
  },
  {
    title: "等待下一段新故事",
    description: "世界會隨著累積慢慢長大。",
  },
];

export default function PlayerPage() {
  return (
    <main id="main-content" className="player-page">
      <section className="player-hero" aria-labelledby="player-title">
        <div className="container player-hero__grid">
          <div className="player-hero__copy">
            <p className="eyebrow">WELCOME TO THE FOREST</p>
            <h1 id="player-title">
              和土撥鼠、兔兔一起，慢慢養成一個屬於你的世界
            </h1>
            <div className="player-hero__body">
              <p>
                在城市生活之外，土撥鼠與兔兔正在森林裡過著自己的日常。你可以陪她們說說話、逛逛樹屋，讓每一次停留都留下痕跡。當你再次回來，熟悉的世界也會因為你，多一點新的故事。
              </p>
            </div>
            <span
              className="button button--primary player-cta player-cta--disabled"
              aria-disabled="true"
            >
              開始你的森林生活
            </span>
          </div>
          <div className="player-hero__visual">
            <Image
              src="/assets/home/home-hero-desktop.webp"
              width="880"
              height="840"
              sizes="(max-width: 820px) 100vw, 56vw"
              alt="長尾土撥鼠與兔兔一起走在森林樹屋前"
              priority
            />
          </div>
        </div>
      </section>

      <section
        className="player-story player-section"
        aria-labelledby="player-story-title"
      >
        <div className="container player-story__grid">
          <div className="player-story__copy">
            <p className="eyebrow">FOREST STORY</p>
            <h2 id="player-story-title">森林裡，今天又多了一點變化</h2>
            <p>土撥鼠與兔兔在森林與樹屋裡，過著屬於她們的日常。</p>
            <p>
              你留下的物品、每一次互動與小小累積，會慢慢成為她們生活的一部分。
            </p>
            <p>
              熟悉的角落會多出新的細節，收納櫃裡會留下曾經取得的物件，樹屋也會隨著每一次回來，變得更有生活的樣子。
            </p>
            <p>有些改變很小，卻會讓下一次回到森林時，看見一點新的故事。</p>
          </div>
          <div className="player-story__visual">
            <Image
              src="/assets/player/player-forest-story.webp"
              width="635"
              height="405"
              sizes="(max-width: 820px) calc(100vw - 48px), 52vw"
              alt="土撥鼠指向森林裡的新芽，兔兔在一旁陪伴"
            />
          </div>
        </div>
      </section>

      <section
        className="player-invitation player-section"
        aria-labelledby="player-invitation-title"
      >
        <div className="container">
          <div className="player-section-intro">
            <p className="eyebrow">A SMALL INVITATION</p>
            <h2 id="player-invitation-title">偶爾，她們會想請你幫一個小忙</h2>
            <p>
              土撥鼠與兔兔有時會留下一個小小邀請，請你陪她們完成一件簡單的事。
            </p>
            <p>
              看看森林的新變化、整理一件物品，或照顧熟悉的角落，都是居民日常裡自然出現的小事。
            </p>
          </div>

          <div className="player-invitation__grid">
            <article className="player-keepsake">
              <Image
                src="/assets/player/player-invitation.webp"
                width="479"
                height="360"
                sizes="(max-width: 820px) calc(100vw - 76px), 540px"
                alt="土撥鼠與兔兔一起整理樹屋裡熟悉的物品"
              />
              <div className="player-keepsake__caption">
                <strong>一起整理熟悉的角落</strong>
                <span>讓取得的物件回到生活裡</span>
              </div>
            </article>

            <article className="player-note">
              <p className="eyebrow">TODAY&apos;S LITTLE NOTE</p>
              <h3>今天的小邀請</h3>
              <ul>
                {invitations.map((invitation) => (
                  <li key={invitation}>{invitation}</li>
                ))}
              </ul>
              <div className="player-note__reply">
                <strong>輕輕回應就好</strong>
                <span>讓生活多一點期待，也保留自己的步調</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        className="player-real-life player-section"
        aria-labelledby="player-real-life-title"
      >
        <div className="container player-real-life__grid">
          <div className="player-real-life__copy">
            <p className="eyebrow">FROM FOREST TO REAL LIFE</p>
            <h2 id="player-real-life-title">有些行動，會帶你走進真實生活</h2>
            <p>有些行動會從森林延伸到合作店家。</p>
            <p>
              完成一份真實生活裡的選擇後，成果會跟著你回到森林，讓森林世界與山下的生活彼此回應。
            </p>
            <div className="player-real-life__meta">
              <p>一份生活裡的選擇，也會成為森林裡的新故事</p>
              <ul aria-label="行動循環">
                <li>合作店家</li>
                <li>蔬食餐點</li>
                <li>成果回到森林</li>
              </ul>
            </div>
          </div>
          <div className="player-real-life__visual">
            <Image
              src="/assets/player/player-real-life.webp"
              width="636"
              height="526"
              sizes="(max-width: 820px) calc(100vw - 48px), 52vw"
              alt="樹屋餐桌上的完整蔬食餐點與任務完成手機畫面"
            />
          </div>
        </div>
      </section>

      <section
        className="player-remembers"
        aria-labelledby="player-remembers-title"
      >
        <div className="player-remembers__image" aria-hidden="true" />
        <div className="container player-remembers__inner">
          <div className="player-remembers__copy">
            <p className="eyebrow">THE FOREST REMEMBERS</p>
            <h2 id="player-remembers-title">當你回來，森林會記得你做過的事</h2>
            <p>土撥鼠與兔兔會看見你的成果</p>
            <p>核心樹也會多一點光與新的生命</p>
            <p>EXP、星星與減碳紀錄會回到世界裡，成為下一段生活的起點</p>
            <dl className="player-remembers__results">
              <div>
                <dt>EXP</dt>
                <dd>世界經驗</dd>
              </div>
              <div>
                <dt>星星</dt>
                <dd>回到生活</dd>
              </div>
              <div>
                <dt>
                  <Co2eLabel />
                </dt>
                <dd>真實影響</dd>
              </div>
            </dl>
            <p className="player-remembers__closing">
              山下的生活亮起來，森林也留下新的故事
            </p>
          </div>
        </div>
      </section>

      <section
        className="player-growth player-section"
        aria-labelledby="player-growth-title"
      >
        <div className="container">
          <div className="player-section-intro">
            <p className="eyebrow">THE STORY KEEPS GROWING</p>
            <h2 id="player-growth-title">
              世界還會繼續長大
              <br />
              新的地方與故事也會慢慢出現
            </h2>
            <p>
              陪土撥鼠與兔兔留下一段生活，讓熟悉的森林一點一點長成你的世界。
            </p>
            <span
              className="button button--primary player-cta player-cta--disabled"
              aria-disabled="true"
            >
              進入森林看看
            </span>
          </div>
          <div className="player-growth__grid">
            {growthStories.map((story) => (
              <article key={story.title}>
                <h3>{story.title}</h3>
                <p>{story.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
