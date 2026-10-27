// Floating, draggable table-of-contents panel pinned beside the article.
import {
  findArticleContainer,
  isExtensionContextAvailable,
  isExtensionContextError
} from './page-utils.js';
import { TocTracker, markActiveItem, renderTocList } from './toc-view.js';

// TOC Panel Class - manages floating pinnable panel
export class TOCPanel {
  // getHeaders: () => the current heading elements; onSelect: (index) => scroll
  // to one; onVisibilityChange: (isVisible) => void after show or hide.
  constructor({ getHeaders, onSelect, onVisibilityChange = () => {} }) {
    this.onSelect = onSelect;
    this.onVisibilityChange = onVisibilityChange;
    this.panel = null;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.defaultPosition = { x: 20, y: 100 };
    this.hasSavedPosition = false;
    this.isCollapsed = false;
    this.collapseLayoutTimeout = null;
    this.layoutResizeObserver = null;
    this.layoutResizeFrame = null;
    this.layoutSignature = null;
    this.tracker = new TocTracker({ getHeaders, onChange: (index) => this.highlight(index) });
    this.handleResize = () => {
      this.syncCurtainHeight();
      this.keepInViewport();
    };
  }

  async init() {
    // Load saved position
    const storage = await chrome.storage.local.get('tocPanelPosition');
    this.hasSavedPosition = Boolean(storage.tocPanelPosition);
    this.position = storage.tocPanelPosition || this.defaultPosition;
    this.create();
  }

  create() {
    // Remove existing panel if any
    if (this.panel) {
      this.layoutResizeObserver?.disconnect();
      if (this.layoutResizeFrame) cancelAnimationFrame(this.layoutResizeFrame);
      this.panel.remove();
    }
    this.layoutResizeObserver = null;
    this.layoutResizeFrame = null;
    this.layoutSignature = null;

    // Create panel element
    this.panel = document.createElement('div');
    this.panel.id = 'twitter-toc-panel';
    this.panel.className = 'twitter-toc-panel';
    this.panel.setAttribute('role', 'complementary');
    this.panel.setAttribute('aria-label', 'XTOC article contents');
    this.panel.style.cssText = `
      position: fixed;
      z-index: 999999;
      width: clamp(340px, 34vw, 560px);
      min-width: 320px;
      max-width: calc(100vw - 20px);
      max-height: 60vh;
      background: var(--bg-primary, #ffffff);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      resize: horizontal;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    // Apply saved position
    this.panel.style.left = this.position.x + 'px';
    this.panel.style.top = this.position.y + 'px';

    // Create header with drag handle and close button
    const header = document.createElement('div');
    header.className = 'toc-panel-header';
    header.innerHTML = `
      <span class="drag-handle" title="Drag to move" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/>
          <circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/>
          <circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/>
          <circle cx="15" cy="18" r="1.5"/>
        </svg>
      </span>
      <span class="panel-title"><span class="panel-brand">XTOC</span><span class="panel-title-separator" aria-hidden="true"> · </span>Contents</span>
      <span class="panel-actions">
        <button class="clips-btn" type="button" title="Open clips" aria-label="Open clips">
          <svg class="panel-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="clips-label">Library</span>
        </button>
        <button class="collapse-btn" type="button" title="Collapse panel" aria-label="Collapse table of contents" aria-expanded="true">
          <svg class="panel-action-icon collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 15 6-6 6 6"/>
          </svg>
        </button>
        <button class="close-btn" type="button" title="Hide panel" aria-label="Hide table of contents">
          <svg class="panel-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </span>
    `;

    // Create body with TOC list
    const body = document.createElement('div');
    body.className = 'toc-panel-body';

    const curtain = document.createElement('div');
    curtain.className = 'toc-panel-curtain';
    const curtainInner = document.createElement('div');
    curtainInner.className = 'toc-panel-curtain-inner';
    curtainInner.appendChild(body);
    curtain.appendChild(curtainInner);

    this.panel.appendChild(header);
    this.panel.appendChild(curtain);

    document.body.appendChild(this.panel);

    // Add event listeners
    this.setupEventListeners(header);
    this.setupLayoutObserver(header, body);
  }

  setupLayoutObserver(header, body) {
    if (typeof ResizeObserver !== 'function') return;

    this.layoutResizeObserver = new ResizeObserver(() => {
      const panelWidth = Math.round(this.panel?.getBoundingClientRect().width || 0);
      const headerHeight = Math.round(header.getBoundingClientRect().height);
      const bodyHeight = Math.round(body.scrollHeight);
      const signature = `${panelWidth}:${headerHeight}:${bodyHeight}`;
      if (signature === this.layoutSignature) return;
      this.layoutSignature = signature;
      if (this.layoutResizeFrame) return;

      this.layoutResizeFrame = requestAnimationFrame(() => {
        this.layoutResizeFrame = null;
        this.syncCurtainHeight();
        this.keepInViewport();
      });
    });
    this.layoutResizeObserver.observe(this.panel);
    this.layoutResizeObserver.observe(header);
    this.layoutResizeObserver.observe(body);
  }

  setupEventListeners(header) {
    const clipsBtn = header.querySelector('.clips-btn');
    const collapseBtn = header.querySelector('.collapse-btn');
    const closeBtn = header.querySelector('.close-btn');

    // Drag functionality
    header.addEventListener('mousedown', (event) => {
      if (!event.target.closest('button')) this.startDrag(event);
    });
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.endDrag());

    clipsBtn.addEventListener('click', () => this.openClips());
    collapseBtn.addEventListener('click', () => this.toggleCollapsed(collapseBtn));
    closeBtn.addEventListener('click', () => this.hide());
    this.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.hide();
    });
    window.addEventListener('resize', this.handleResize);
  }

  toggleCollapsed(button) {
    this.setCollapsed(!this.isCollapsed, button);
    this.keepInViewport();
    clearTimeout(this.collapseLayoutTimeout);
    this.collapseLayoutTimeout = setTimeout(() => this.keepInViewport(), 280);
  }

  syncCurtainHeight() {
    const curtain = this.panel?.querySelector('.toc-panel-curtain');
    const body = this.panel?.querySelector('.toc-panel-body');
    const header = this.panel?.querySelector('.toc-panel-header');
    if (!curtain || !body || !header) return;

    const availableHeight = Math.max(
      0,
      window.innerHeight * 0.6 - header.getBoundingClientRect().height
    );
    const expandedHeight = Math.min(body.scrollHeight, availableHeight);
    curtain.style.setProperty('--toc-curtain-height', `${expandedHeight}px`);
  }

  setCollapsed(isCollapsed, button = this.panel?.querySelector('.collapse-btn')) {
    this.isCollapsed = isCollapsed;
    this.syncCurtainHeight();
    this.panel?.classList.toggle('collapsed', isCollapsed);
    const body = this.panel?.querySelector('.toc-panel-body');
    const curtain = this.panel?.querySelector('.toc-panel-curtain');
    body?.toggleAttribute('inert', isCollapsed);
    curtain?.setAttribute('aria-hidden', String(isCollapsed));
    if (!button) return;

    button.setAttribute('aria-expanded', String(!isCollapsed));
    button.setAttribute(
      'aria-label',
      isCollapsed ? 'Expand table of contents' : 'Collapse table of contents'
    );
    button.setAttribute('title', isCollapsed ? 'Expand panel' : 'Collapse panel');
  }

  openClips() {
    if (!isExtensionContextAvailable()) {
      this.showReconnectMessage();
      return;
    }

    try {
      const pendingMessage = chrome.runtime.sendMessage({ action: 'openClips' });
      pendingMessage?.catch((error) => this.handleExtensionError(error));
    } catch (error) {
      this.handleExtensionError(error);
    }
  }

  persistLocalState(values) {
    if (!isExtensionContextAvailable()) {
      this.showReconnectMessage();
      return;
    }

    try {
      const pendingWrite = chrome.storage.local.set(values);
      pendingWrite?.catch((error) => this.handleExtensionError(error));
    } catch (error) {
      this.handleExtensionError(error);
    }
  }

  handleExtensionError(error) {
    if (isExtensionContextError(error) || !isExtensionContextAvailable()) {
      this.showReconnectMessage();
      return;
    }

    console.error('[XTOC] Extension action failed:', error);
  }

  showReconnectMessage() {
    const title = this.panel?.querySelector('.panel-title');
    const clipsButton = this.panel?.querySelector('.clips-btn');
    if (title) {
      title.textContent = 'Reload page to reconnect XTOC';
      title.classList.add('context-invalid');
    }
    if (clipsButton) {
      clipsButton.disabled = true;
      clipsButton.setAttribute('title', 'Reload this page to reconnect XTOC');
      clipsButton.setAttribute('aria-label', 'Reload this page to reconnect XTOC');
    }
  }

  startDrag(e) {
    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    this.panel.classList.add('dragging');
    e.preventDefault();
  }

  drag(e) {
    if (!this.isDragging) return;

    let newX = e.clientX - this.dragOffset.x;
    let newY = e.clientY - this.dragOffset.y;

    // Keep within viewport bounds
    const maxX = window.innerWidth - this.panel.offsetWidth - 10;
    const maxY = window.innerHeight - this.panel.offsetHeight - 10;
    newX = Math.max(10, Math.min(newX, maxX));
    newY = Math.max(10, Math.min(newY, maxY));

    this.panel.style.left = newX + 'px';
    this.panel.style.top = newY + 'px';
  }

  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.panel.classList.remove('dragging');

    // Save position
    this.position = {
      x: parseInt(this.panel.style.left),
      y: parseInt(this.panel.style.top)
    };
    this.hasSavedPosition = true;
    this.persistLocalState({ tocPanelPosition: this.position });
  }

  show(toc) {
    if (!this.panel) {
      this.create();
    }

    // Update TOC content
    const body = this.panel.querySelector('.toc-panel-body');
    body.innerHTML = renderTocList(toc);
    if (!this.hasSavedPosition) {
      const placement = this.getArticleSidePlacement();
      this.position = { x: placement.x, y: placement.y };
      this.panel.style.width = `${placement.width}px`;
      this.panel.style.left = `${this.position.x}px`;
      this.panel.style.top = `${this.position.y}px`;
      this.setCollapsed(placement.collapsed);
    }
    this.panel.style.display = 'flex';
    this.syncCurtainHeight();
    this.isVisible = true;
    this.keepInViewport();

    // Add click handlers to TOC items
    body.querySelectorAll('.toc-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.onSelect(index);
      });
    });
    this.tracker.start();
    this.onVisibilityChange(true);
  }

  getArticleSidePlacement() {
    const viewportPadding = 10;
    const articleGap = 18;
    const minimumExpandedWidth = 320;
    const preferredWidth = Math.min(560, Math.max(340, window.innerWidth * 0.34));
    const articleRect = findArticleContainer()?.getBoundingClientRect();
    const availableRight = articleRect
      ? window.innerWidth - articleRect.right - articleGap - viewportPadding
      : preferredWidth;
    const hasExpandedSpace = availableRight >= minimumExpandedWidth;
    const width = hasExpandedSpace ? Math.min(preferredWidth, availableRight) : preferredWidth;
    const preferredX = articleRect
      ? articleRect.right + articleGap
      : window.innerWidth - width - 20;
    const x = Math.max(
      viewportPadding,
      Math.min(preferredX, window.innerWidth - width - viewportPadding)
    );
    const y = Math.max(72, Math.min(articleRect?.top || 100, window.innerHeight - 180));
    return { x, y, width, collapsed: !hasExpandedSpace };
  }

  startNavigation(index, targetScroll) {
    this.tracker.startNavigation(index, targetScroll);
  }

  // Moves keyboard focus into the panel, on the current section when known.
  focusCurrent() {
    const item =
      this.panel?.querySelector('.toc-item.active') || this.panel?.querySelector('.toc-item');
    item?.focus();
  }

  highlight(index) {
    if (!this.panel) return;
    markActiveItem(this.panel, this.panel.querySelector('.toc-panel-body'), index);
  }

  hide() {
    if (this.panel) {
      this.panel.style.display = 'none';
    }
    this.isVisible = false;
    this.tracker.stop();
    this.persistLocalState({ tocPanelVisible: false });
    this.onVisibilityChange(false);
  }

  keepInViewport() {
    if (!this.panel || !this.isVisible) return;
    const rect = this.panel.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 10;
    const maxY = window.innerHeight - rect.height - 10;
    const nextX = Math.max(10, Math.min(rect.left, maxX));
    const nextY = Math.max(10, Math.min(rect.top, maxY));

    this.panel.style.left = nextX + 'px';
    this.panel.style.top = nextY + 'px';
  }

  toggle(toc) {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(toc);
      this.persistLocalState({ tocPanelVisible: true });
    }
  }

  destroy() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    window.removeEventListener('resize', this.handleResize);
    this.tracker.stop();
    if (this.layoutResizeFrame) cancelAnimationFrame(this.layoutResizeFrame);
    this.layoutResizeObserver?.disconnect();
    this.layoutResizeFrame = null;
    this.layoutResizeObserver = null;
    this.layoutSignature = null;
    clearTimeout(this.collapseLayoutTimeout);
  }
}
