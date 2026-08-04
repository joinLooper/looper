import Link from "next/link";

export function NotReadyPage() {
  return (
    <main id="main-content" className="not-ready">
      <section aria-labelledby="not-ready-title">
        <p className="eyebrow">Looper</p>
        <h1 id="not-ready-title">此頁正在準備中</h1>
        <Link className="button button--primary" href="/">
          回首頁
        </Link>
      </section>
    </main>
  );
}
