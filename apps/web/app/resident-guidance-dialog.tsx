"use client";

import { useEffect, useRef, useState } from "react";
import {
  RESIDENT_GUIDANCE_STEPS,
  residentWelcomeTitle,
  type ResidentGuidanceState,
} from "./resident-guidance";
import { AssetButton, UiIcon } from "./ui-primitives";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function ResidentGuidanceDialog({
  state,
  displayName,
  onAdvance,
  onBack,
  onDismiss,
}: {
  state: ResidentGuidanceState;
  displayName: string | null | undefined;
  onAdvance: () => void;
  onBack: () => void;
  onDismiss: () => void;
}) {
  const step = RESIDENT_GUIDANCE_STEPS[state.stepIndex] ?? RESIDENT_GUIDANCE_STEPS[0];
  const actionsRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    actionsRef.current?.querySelector<HTMLButtonElement>(".asset-button")?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    actionsRef.current?.querySelector<HTMLButtonElement>(".asset-button")?.focus();
  }, [state.stepIndex]);

  useEffect(() => {
    if (!step.target) {
      setSpotlight(null);
      return undefined;
    }

    const updateSpotlight = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-guidance-target="${step.target}"]`,
      );
      if (!target) {
        setSpotlight(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight;
      setSpotlight(
        visible
          ? {
              top: Math.max(8, rect.top - 6),
              left: Math.min(
                Math.max(8, rect.left - 6),
                Math.max(8, window.innerWidth - rect.width - 14),
              ),
              width: Math.min(window.innerWidth - 16, rect.width + 12),
              height: Math.min(window.innerHeight - 16, rect.height + 12),
            }
          : null,
      );
    };

    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);
    return () => {
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [step.target, state.stepIndex]);

  useEffect(() => {
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(actionsRef.current?.closest("section")?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => window.removeEventListener("keydown", handleDialogKeys);
  }, [onDismiss]);

  const title =
    step.id === "welcome" ? residentWelcomeTitle(displayName) : step.title;
  const dismissLabel =
    state.mode === "first_run" && state.stepIndex === 0
      ? "先自己探索"
      : state.mode === "first_run"
        ? "略過引導"
        : "結束重看";

  return (
    <div className="resident-guidance" role="presentation">
      {spotlight ? (
        <div
          className="resident-guidance__spotlight"
          aria-hidden="true"
          style={spotlight}
        />
      ) : (
        <div className="resident-guidance__backdrop" aria-hidden="true" />
      )}
      <section
        className="resident-guidance__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resident-guidance-title"
        aria-describedby="resident-guidance-description"
      >
        <div className="resident-guidance__topline">
          <span aria-label={`第 ${state.stepIndex + 1} 步，共 ${RESIDENT_GUIDANCE_STEPS.length} 步`}>
            {state.stepIndex + 1} / {RESIDENT_GUIDANCE_STEPS.length}
          </span>
          <button
            type="button"
            className="resident-guidance__close ui-control"
            aria-label={state.mode === "first_run" ? "關閉並略過居民引導" : "關閉居民引導"}
            onClick={onDismiss}
          >
            <UiIcon assetId="ui_icon_close" />
          </button>
        </div>
        <div className="resident-guidance__progress" aria-hidden="true">
          {RESIDENT_GUIDANCE_STEPS.map((item, index) => (
            <i key={item.id} data-active={index <= state.stepIndex || undefined} />
          ))}
        </div>
        <h2 id="resident-guidance-title">{title}</h2>
        <p id="resident-guidance-description">{step.description}</p>
        <div className="resident-guidance__actions" ref={actionsRef}>
          <AssetButton onClick={onAdvance}>
            {step.primaryAction}
          </AssetButton>
          <div className="resident-guidance__secondary-actions">
            {state.stepIndex > 0 ? (
              <button
                type="button"
                className="resident-guidance__text-action ui-control"
                onClick={onBack}
              >
                返回
              </button>
            ) : <span />}
            <button
              type="button"
              className="resident-guidance__text-action ui-control"
              onClick={onDismiss}
            >
              {dismissLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
