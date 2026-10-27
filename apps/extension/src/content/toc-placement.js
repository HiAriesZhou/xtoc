// Pure decisions for the inline article contents: where it goes, how wide the
// Focus mode card is, and which of X's themes and accent colors to match.

// Fewer sections than this would be an almost empty module.
export const MIN_SECTIONS = 2;
export const DEFAULT_ACCENT = 'rgb(29, 155, 240)';

const GUTTER_GAP = 32; // between the article column and the card
const GUTTER_EDGE = 16; // between the card and the viewport edge
const GUTTER_MAX_WIDTH = 300;
const GUTTER_MIN_WIDTH = 220;
const MIN_ACCENT_CHROMA = 80;
// Browser defaults for unstyled, visited and active links in light and dark
// color schemes, which X pages also contain.
const DEFAULT_LINK_COLORS = new Set([
  '0,0,238',
  '85,26,139',
  '238,0,0',
  '158,158,255',
  '208,173,240',
  '255,158,158'
]);

export function countSections(toc) {
  return toc.filter((entry) => entry.level > 1).length;
}

// X's Focus mode reader lives at /<user>/article/<id> and has no right column.
export function isFocusRoute(url) {
  try {
    return /^\/[^/]+\/article\/\d+/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// 'sidebar' joins X's right column; 'gutter' sits in the empty space beside the
// Focus mode column; 'none' leaves the page alone. It never covers the article.
export function chooseTocPlacement({
  pageKind,
  focusRoute,
  hasSidebar,
  gutter,
  sectionCount,
  autoShow,
  poppedOut
}) {
  if (!autoShow || poppedOut || pageKind !== 'article') return 'none';
  if (sectionCount < MIN_SECTIONS) return 'none';
  if (hasSidebar) return 'sidebar';
  if (focusRoute && gutter) return 'gutter';
  return 'none';
}

export function gutterCardGeometry({ columnRight, viewportWidth }) {
  if (!Number.isFinite(columnRight) || !Number.isFinite(viewportWidth)) return null;
  const available = viewportWidth - columnRight - GUTTER_GAP - GUTTER_EDGE;
  if (available < GUTTER_MIN_WIDTH) return null;
  return {
    left: Math.round(columnRight + GUTTER_GAP),
    width: Math.round(Math.min(GUTTER_MAX_WIDTH, available))
  };
}

export function parseRgb(value) {
  const match = String(value || '').match(
    /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/
  );
  if (!match) return null;
  const [, r, g, b, rawAlpha] = match;
  const alpha =
    rawAlpha === undefined
      ? 1
      : Number.parseFloat(rawAlpha) / (rawAlpha.endsWith('%') ? 100 : 1);
  return { r: Number(r), g: Number(g), b: Number(b), alpha };
}

// X sets its theme on the page, independently of the system setting.
export function pickTocTheme({ background, colorScheme }) {
  const color = parseRgb(background);
  if (color && color.alpha > 0) {
    const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
    return luminance < 0.5 ? 'dark' : 'light';
  }
  return /\bdark\b/.test(colorScheme || '') && !/\blight\b/.test(colorScheme || '')
    ? 'dark'
    : 'light';
}

// X's accent is user-selectable; text and borders are grey, so the first
// clearly colored candidate that is not a browser link default is the accent.
export function pickAccentColor(candidates) {
  for (const candidate of candidates) {
    const color = parseRgb(candidate);
    if (!color || color.alpha === 0) continue;
    if (DEFAULT_LINK_COLORS.has(`${color.r},${color.g},${color.b}`)) continue;
    const chroma = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    if (chroma >= MIN_ACCENT_CHROMA) return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
  return DEFAULT_ACCENT;
}
