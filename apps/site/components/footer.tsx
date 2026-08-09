import Link from "next/link";
import { Co2eLabel } from "./co2e-label";

type FooterProps = {
  lineOaUrl?: string;
};

export function Footer({ lineOaUrl }: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="footer-brand">
          <Link
            className="brand-link brand-link--footer"
            href="/"
            aria-label="Looper 首頁"
          >
            <img
              className="brand-logo"
              src="/assets/brand/looper-logo-horizontal-01.png"
              width="1894"
              height="905"
              alt="Looper"
            />
          </Link>
          <p>
            Looper 把真實生活中的蔬食行動帶回遊戲。玩家在合作店家完成任務，拿到
            EXP、星星與 <Co2eLabel />
            ，讓森林、樹屋、核心樹與居民生活逐步成長。
          </p>
        </div>

        <nav className="footer-column" aria-label="認識 Looper">
          <h2>認識 Looper</h2>
          <div className="footer-links">
            <Link href="/" prefetch={false}>
              首頁
            </Link>
            <Link href="/player">玩家世界</Link>
            <Link href="/partners">合作店家</Link>
            <Link href="/apply">合作申請</Link>
          </div>
        </nav>

        <nav className="footer-column" aria-label="支援與法務">
          <h2>支援與法務</h2>
          <div className="footer-links">
            {lineOaUrl ? <a href={lineOaUrl}>聯絡我們</a> : null}
            <Link href="/privacy">隱私權政策</Link>
            <Link href="/terms">服務條款</Link>
            <Link href="/account-data-rights">帳號刪除與資料權利</Link>
          </div>
        </nav>
      </div>
      <div className="site-footer__legal">
        <p>© 2026 蔬事茹愿有限公司 · Looper</p>
      </div>
    </footer>
  );
}
