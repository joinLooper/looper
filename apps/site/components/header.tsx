"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type HeaderProps = {
  playerEntryUrl?: string;
};

const navigation = [
  { href: "/player", label: "玩家世界" },
  { href: "/partners", label: "合作店家" },
  { href: "/apply", label: "合作申請" },
];

export function Header({ playerEntryUrl }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-link" href="/" aria-label="Looper 首頁">
          <img
            className="brand-logo"
            src="/assets/brand/looper-logo-horizontal-01.png"
            width="1418"
            height="355"
            alt="Looper"
          />
        </Link>

        <nav className="desktop-nav" aria-label="主要導覽">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        {playerEntryUrl ? (
          <a
            className="button button--primary header-entry desktop-entry"
            href={playerEntryUrl}
          >
            進入 Looper
          </a>
        ) : (
          <span
            className="button button--disabled header-entry desktop-entry"
            aria-disabled="true"
          >
            玩家入口準備中
          </span>
        )}

        <button
          ref={buttonRef}
          className="menu-button"
          type="button"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? "關閉" : "選單"}
        </button>
      </div>

      <div
        ref={panelRef}
        className="mobile-menu"
        id="mobile-navigation"
        hidden={!isOpen}
      >
        <nav aria-label="行動版主要導覽">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={closeMenu}>
              {item.label}
            </Link>
          ))}
          {playerEntryUrl ? (
            <a
              className="button button--primary"
              href={playerEntryUrl}
              onClick={closeMenu}
            >
              進入 Looper
            </a>
          ) : (
            <span className="button button--disabled" aria-disabled="true">
              玩家入口準備中
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
