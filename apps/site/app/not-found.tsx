import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="not-ready">
      <section aria-labelledby="not-found-title">
        <h1 id="not-found-title">找不到這個頁面</h1>
        <Link className="button button--primary" href="/">
          回首頁
        </Link>
      </section>
    </main>
  );
}
