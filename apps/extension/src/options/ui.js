// Shared rendering helpers for the Library page. Every dynamic value passes
// through esc() before it reaches innerHTML.
export { icon } from '../ui/icons.js';
import { icon } from '../ui/icons.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

export function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Bookmarks are dated by the X post itself; the save date is only a labeled fallback.
export function bookmarkDate(bookmark) {
  const posted = formatDate(bookmark.publishedAt);
  if (posted) return { text: posted, title: 'Posted on X' };
  const saved = formatDate(bookmark.capturedAt);
  return saved ? { text: `Saved ${saved}`, title: 'Saved to XTOC' } : { text: '', title: '' };
}

export const chips = (tags) =>
  (tags || []).map((tag) => `<span class="chip">${esc(tag)}</span>`).join('');

export const author = (item) => item.authorHandle || item.authorName || '';

export function emptyState(iconName, title, text) {
  return `
    <div class="empty">
      <span class="empty-icon">${icon(iconName, 20)}</span>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
    </div>`;
}

// Options for the tag filter dropdown: "All tags" first, then tags A–Z.
export function tagChoices(tags) {
  const sorted = [...new Set(tags)].sort((a, b) => a.localeCompare(b));
  return [{ value: '', label: 'All tags' }, ...sorted.map((tag) => ({ value: tag, label: tag }))];
}

/**
 * Square icon-only button with a hover background, focus ring and an instant
 * tooltip. Every icon-only control in the Library uses this.
 * @param {{ name: string, label: string, action?: string, size?: 'sm'|'md', attrs?: string }} options
 */
export function iconButton({ name, label, action = '', size = 'md', attrs = '' }) {
  const iconSize = 16;
  return `<button class="icon-btn icon-btn-${size}" type="button" aria-label="${esc(label)}" data-tip="${esc(label)}" ${action ? `data-action="${esc(action)}"` : ''} ${attrs}>${icon(name, iconSize)}</button>`;
}

/**
 * Search field with a leading icon and a clear button that appears only when
 * there is text. Calls onInput with the current query on every change.
 */
export function createSearch(container, { placeholder, value = '', onInput }) {
  container.classList.add('search');
  container.innerHTML = `
    ${icon('search')}
    <input type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" value="${esc(value)}">
    ${iconButton({ name: 'close', label: 'Clear search', size: 'sm', action: 'clear-search' })}`;
  const input = container.querySelector('input');
  const clear = container.querySelector('[data-action="clear-search"]');
  const sync = () => (clear.hidden = !input.value);
  input.addEventListener('input', (event) => {
    event.stopPropagation();
    sync();
    onInput(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      event.stopPropagation();
      clear.click();
    }
  });
  clear.addEventListener('click', (event) => {
    event.stopPropagation();
    input.value = '';
    sync();
    onInput('');
    input.focus();
  });
  sync();
}

// Shown in place of the search and tag filter while items are selected.
export function selectionActions() {
  return `
    <div class="toolbar-selection" role="group" aria-label="Selection">
      <span id="selectionCount" aria-live="polite"></span>
      <button class="btn btn-ghost btn-sm" type="button" data-action="clear-selection">Clear</button>
      <button class="btn btn-danger btn-sm" type="button" data-action="delete-selected">${icon('trash')}Delete</button>
    </div>`;
}

export function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const today = () => new Date().toISOString().slice(0, 10);

// Local Library navigation, shared by both list views.
export function libraryTabs(active) {
  return `<nav class="tabs library-tabs" aria-label="Library sections">${[['bookmarks','Bookmarks'],['clips','Clips']].map(([route,label]) => `<a href="#${route}" data-route="${route}" ${route === active ? 'aria-current="page"' : ''}>${label}<span class="nav-count" id="count-${route}"></span></a>`).join('')}</nav>`;
}
