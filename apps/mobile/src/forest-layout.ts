/** Presentation-only projection; the 1000 × 1000 world keeps its authored anchors.
 * Background may crop. Interactive props never do; sprites retain their aspect. */
export const FOREST_ENTRIES = {
  mission: { x: 220, y: 885, width: 98, height: 80 },
  knowledge: { x: 190, y: 720, width: 64, height: 88 },
  backpack: { x: 820, y: 950, width: 78, height: 68 },
  tools: { x: 870, y: 150, width: 62, height: 58 },
} as const;
export function worldRect(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const w = Math.min(Math.max(48, width), viewportWidth);
  const h = Math.min(Math.max(48, height), viewportHeight);
  return {
    left: Math.max(
      0,
      Math.min(viewportWidth - w, (viewportWidth * x) / 1000 - w / 2),
    ),
    top: Math.max(
      0,
      Math.min(viewportHeight - h, (viewportHeight * y) / 1000 - h / 2),
    ),
    width: w,
    height: h,
  };
}
