// Shared by the floating panel and the inline contents: the heading list
// markup, the active-item highlight, and active-section tracking while reading.
import { getActiveSectionIndex, hasReachedScrollTarget } from './navigation-utils.js';

const TOC_READING_LINE = 96;
const TOC_NAVIGATION_TIMEOUT = 2500;
const TOC_NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' '
]);

export function escapeTocHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Every row is one line (the label truncates with an ellipsis), so the bold
// current section never changes a row's height. The title shows the full text.
export function renderTocList(toc) {
  if (!toc || toc.length === 0) {
    return '<div class="toc-empty">No sections found</div>';
  }

  return `
    <ul class="toc-list">
      ${toc
        .map(
          (item, index) => `
        <li class="toc-row level-${item.level}">
          <button class="toc-item" type="button" data-index="${index}" title="${escapeTocHtml(item.text)}"><span class="toc-label">${escapeTocHtml(item.text)}</span></button>
        </li>
      `
        )
        .join('')}
    </ul>
  `;
}

// Highlights item `index` and scrolls it into view inside `scroller` only, so
// the page itself never moves.
export function markActiveItem(root, scroller, index) {
  root.querySelectorAll('.toc-item').forEach((item, itemIndex) => {
    const isActive = itemIndex === index;
    item.classList.toggle('active', isActive);
    if (!isActive) {
      item.removeAttribute('aria-current');
      return;
    }
    item.setAttribute('aria-current', 'location');
    if (!scroller) return;
    const itemRect = item.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    if (itemRect.top < scrollerRect.top) {
      scroller.scrollTop -= scrollerRect.top - itemRect.top;
    } else if (itemRect.bottom > scrollerRect.bottom) {
      scroller.scrollTop += itemRect.bottom - scrollerRect.bottom;
    }
  });
}

// Follows the section under the reading line. During a heading jump it holds
// the target until the scroll arrives or the reader scrolls themselves.
export class TocTracker {
  // getHeaders: () => heading entries with `.element`; onChange: (index) => void.
  constructor({ getHeaders, onChange }) {
    this.getHeaders = getHeaders;
    this.onChange = onChange;
    this.running = false;
    this.activeIndex = -1;
    this.scrollFrame = null;
    this.navigationTargetIndex = null;
    this.navigationTargetScroll = null;
    this.navigationTimeout = null;
    this.handleScroll = () => {
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        if (this.navigationTargetIndex !== null) {
          if (hasReachedScrollTarget(window.scrollY, this.navigationTargetScroll)) {
            this.finishNavigation();
          } else {
            this.setActiveIndex(this.navigationTargetIndex);
          }
          return;
        }
        this.update();
      });
    };
    this.handleUserScrollIntent = (event) => {
      if (this.navigationTargetIndex === null) return;
      if (event.type === 'keydown' && !TOC_NAVIGATION_KEYS.has(event.key)) return;
      this.finishNavigation();
    };
  }

  start() {
    this.reset();
    if (!this.running) {
      this.running = true;
      window.addEventListener('scroll', this.handleScroll, { passive: true });
      window.addEventListener('wheel', this.handleUserScrollIntent, { passive: true });
      window.addEventListener('touchstart', this.handleUserScrollIntent, { passive: true });
      window.addEventListener('keydown', this.handleUserScrollIntent);
    }
    this.update();
  }

  stop() {
    this.running = false;
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('wheel', this.handleUserScrollIntent);
    window.removeEventListener('touchstart', this.handleUserScrollIntent);
    window.removeEventListener('keydown', this.handleUserScrollIntent);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = null;
    this.clearNavigation();
  }

  // Forgets the highlighted index, for example after the list is re-rendered.
  reset() {
    this.clearNavigation();
    this.activeIndex = -1;
  }

  update() {
    const headerElements = this.getHeaders();
    if (!this.running || headerElements.length === 0) return;
    const headerTops = headerElements.map(
      (header) => header.element?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
    );
    const isAtPageEnd =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    this.setActiveIndex(getActiveSectionIndex(headerTops, TOC_READING_LINE, isAtPageEnd));
  }

  startNavigation(index, targetScroll) {
    this.clearNavigation();
    this.navigationTargetIndex = index;
    this.navigationTargetScroll = targetScroll;
    this.setActiveIndex(index);
    this.navigationTimeout = setTimeout(() => this.finishNavigation(), TOC_NAVIGATION_TIMEOUT);
  }

  finishNavigation() {
    if (this.navigationTargetIndex === null) return;
    this.clearNavigation();
    this.update();
  }

  clearNavigation() {
    clearTimeout(this.navigationTimeout);
    this.navigationTimeout = null;
    this.navigationTargetIndex = null;
    this.navigationTargetScroll = null;
  }

  setActiveIndex(index) {
    if (this.activeIndex === index) return;
    this.activeIndex = index;
    this.onChange(index);
  }
}
