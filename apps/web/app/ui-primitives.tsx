"use client";

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PropsWithChildren,
  useState,
} from "react";
import { type UiAssetId, uiAssetPath } from "./ui-assets";

interface UiIconProps {
  assetId: UiAssetId;
  state?: string;
  className?: string;
  decorative?: boolean;
  label?: string;
}

export function UiIcon({
  assetId,
  state = "default",
  className = "",
  decorative = true,
  label,
}: UiIconProps) {
  return (
    <img
      className={`ui-icon ${className}`.trim()}
      src={uiAssetPath(assetId, state)}
      alt={decorative ? "" : (label ?? "")}
      aria-hidden={decorative || undefined}
      draggable={false}
    />
  );
}

interface AssetSurfaceProps extends PropsWithChildren {
  assetId: UiAssetId;
  state: string;
  className?: string;
  as?: "div" | "section" | "article";
  label?: string;
  labelledBy?: string;
  role?: string;
  ariaModal?: boolean;
}

export function AssetSurface({
  assetId,
  state,
  className = "",
  as: Element = "div",
  label,
  labelledBy,
  role,
  ariaModal,
  children,
}: AssetSurfaceProps) {
  return (
    <Element
      className={`asset-surface ${className}`.trim()}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-modal={ariaModal || undefined}
      role={role}
    >
      <img
        className="asset-surface__art"
        src={uiAssetPath(assetId, state)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <div className="asset-surface__content">{children}</div>
    </Element>
  );
}

type AssetButtonKind =
  "ui_button_primary" | "ui_button_secondary" | "ui_button_tertiary";

interface AssetButtonProps extends PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement>
> {
  assetId?: AssetButtonKind;
  busy?: boolean;
}

export function AssetButton({
  assetId = "ui_button_primary",
  busy = false,
  disabled,
  className = "",
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onFocus,
  onBlur,
  ...props
}: AssetButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const state = disabled
    ? "disabled"
    : busy
      ? "loading"
      : pressed
        ? "pressed"
        : focused
          ? "focused"
          : "default";

  return (
    <button
      {...props}
      className={`asset-button asset-button--${assetId.replace("ui_button_", "")} ui-control ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onPointerDown={(event) => {
        setPressed(true);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setPressed(false);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        setPressed(false);
        onPointerCancel?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setPressed(false);
        setFocused(false);
        onBlur?.(event);
      }}
    >
      <img
        className="asset-button__art"
        src={uiAssetPath(assetId, state)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="asset-button__label">
        {busy ? (
          <UiIcon assetId="ui_icon_loading" className="spinning-icon" />
        ) : null}
        {children}
      </span>
    </button>
  );
}

interface ResourceChipProps extends PropsWithChildren {
  state?: "default" | "gain" | "full" | "insufficient" | "locked";
  icon?: UiAssetId;
  label: string;
}

export function ResourceChip({
  state = "default",
  icon,
  label,
  children,
}: ResourceChipProps) {
  return (
    <AssetSurface
      assetId="ui_resource_chip"
      state={state}
      className="resource-chip"
      label={label}
    >
      {icon ? <UiIcon assetId={icon} /> : null}
      <span>{children}</span>
    </AssetSurface>
  );
}

type ProgressAssetId = "ui_exp_progress" | "ui_carbon_progress";

interface ProgressMeterProps {
  assetId: ProgressAssetId;
  label: string;
  value: number;
  max: number;
  displayValue: string;
  tone: "exp" | "carbon";
  state?: string;
}

export function ProgressMeter({
  assetId,
  label,
  value,
  max,
  displayValue,
  tone,
  state,
}: ProgressMeterProps) {
  const ratio = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0;
  const resolvedState = state ?? (ratio === 0 ? "empty" : "partial");
  const progressStyle = { "--progress": ratio } as CSSProperties;

  return (
    <div
      className={`progress-meter progress-meter--${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${label} ${displayValue}`}
      style={progressStyle}
    >
      <img
        className="progress-meter__art"
        src={uiAssetPath(assetId, resolvedState)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="progress-meter__track" aria-hidden="true">
        <span />
      </span>
      <span className="progress-meter__label">
        <strong>{label}</strong>
        <span>{displayValue}</span>
      </span>
    </div>
  );
}

export function FocusAsset() {
  return (
    <img
      className="focus-asset"
      src={uiAssetPath("ui_focus_ring", "visible")}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
