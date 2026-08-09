import Link from "next/link";

type DemoStatusPageProps = {
  title: string;
  description: string;
  eyebrow?: string;
};

export function DemoStatusPage({
  title,
  description,
  eyebrow = "展示版資訊",
}: DemoStatusPageProps) {
  return (
    <main id="main-content" className="status-page">
      <section className="status-page__content" aria-labelledby="status-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="status-title">{title}</h1>
        <p className="status-page__description">{description}</p>
        <Link className="button button--primary" href="/">
          返回首頁
        </Link>
      </section>
    </main>
  );
}
