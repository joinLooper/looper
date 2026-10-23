/**
 * V-F1 art-review geometry. Every visible Forest object shares the same
 * cover transform as the 941 x 1672 PASS background.
 *
 * These pixel boxes are placement CANDIDATES traced from the approved full
 * composition, not an art-approval substitute. Keep original sprites intact.
 */
export const F1_SOURCE_CANVAS = { width: 941, height: 1672 } as const;
export type SourceRect = { x: number; y: number; width: number; height: number };

export const F1_VISUAL_FRAMES = {
  knowledge: { x: 92, y: 501, width: 204, height: 216 },
  mission: { x: 10, y: 901, width: 292, height: 353 },
  backpack: { x: 640, y: 1160, width: 290, height: 345 },
  tools: { x: 682, y: 157, width: 253, height: 260 },
  sprout: { x: 416, y: 961, width: 220, height: 238 },
  marmot: { x: 306, y: 592, width: 312, height: 529 },
  rabbit: { x: 655, y: 675, width: 210, height: 310 },
  treehouse: { x: 680, y: 240, width: 239, height: 190 },
  hud: { x: 66, y: 69, width: 568, height: 221 },
} as const satisfies Record<string, SourceRect>;

export function f1CoverTransform(width: number, height: number) {
  const w=Math.max(1,width),h=Math.max(1,height);
  const scale=Math.max(w/F1_SOURCE_CANVAS.width,h/F1_SOURCE_CANVAS.height);
  return {
    scale,
    offsetX:(w-F1_SOURCE_CANVAS.width*scale)/2,
    offsetY:(h-F1_SOURCE_CANVAS.height*scale)/2,
    backgroundWidth:F1_SOURCE_CANVAS.width*scale,
    backgroundHeight:F1_SOURCE_CANVAS.height*scale,
  };
}

export function f1ProjectRect(box: SourceRect, width: number, height: number) {
  const t=f1CoverTransform(width,height);
  return {
    left:t.offsetX+box.x*t.scale,
    top:t.offsetY+box.y*t.scale,
    width:box.width*t.scale,
    height:box.height*t.scale,
  };
}
export function f1Frame(name: keyof typeof F1_VISUAL_FRAMES, width:number, height:number) {
  return f1ProjectRect(F1_VISUAL_FRAMES[name],width,height);
}
/** Keep interactive props fully accessible on taller phones after cover crops
 * the source image horizontally. This is a small safe-edge correction layered
 * on top of the shared background projection, NOT a separate world camera. */
export function f1ViewportFrame(name:keyof typeof F1_VISUAL_FRAMES,width:number,height:number,padding=8) {
  const f=f1Frame(name,width,height);
  const left=Math.max(padding,Math.min(Math.max(padding,width-f.width-padding),f.left));
  const top=Math.max(padding,Math.min(Math.max(padding,height-f.height-padding),f.top));
  return {...f,left,top};
}
/** QA placeholder character has no approved Sprite. Constrain its active tap
 * region to the upper body so it cannot steal taps from the central sprout.
 * This does not change the character art frame, camera, or player progression.
 */
export const F1_MARMOT_TAP_REGION = {xFraction:0.08,yFraction:0.04,widthFraction:0.84,heightFraction:0.50} as const;
export function f1MarmotTapRegion(width:number,height:number) {
  const outer=f1ViewportFrame("marmot",width,height);
  const v=F1_MARMOT_TAP_REGION;
  return {
    left:outer.left+outer.width*v.xFraction,
    top:outer.top+outer.height*v.yFraction,
    width:outer.width*v.widthFraction,
    height:outer.height*v.heightFraction,
  };
}
export function f1RectsOverlap(a:{left:number;top:number;width:number;height:number},
  b:{left:number;top:number;width:number;height:number}) {
  return a.left<b.left+b.width && b.left<a.left+a.width &&
    a.top<b.top+b.height && b.top<a.top+a.height;
}
export function f1InsetImageFrame(frame:{width:number;height:number}) {
  return { left:0,top:0,width:frame.width,height:frame.height };
}
/** Draw the artwork in the same box as its touch area. All main props exceed
 * 48dp on the 360x640 and 390x845 QA canvases. */
export function f1HitboxIsUsable(box: SourceRect,width:number,height:number,min=44) {
  const projected=f1ProjectRect(box,width,height);
  const l=Math.max(0,projected.left),r=Math.min(width,projected.left+projected.width);
  const t=Math.max(0,projected.top),b=Math.min(height,projected.top+projected.height);
  return r-l>=min && b-t>=min;
}
