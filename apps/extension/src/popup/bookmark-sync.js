// Bookmark import controls for the popup on X's Bookmarks pages. The content
// script owns the import and reports its status line and the commands that
// apply; this only maps them to buttons, so the popup and the page control agree.
const BUTTONS = {
  start: { label: 'Import bookmarks', icon: 'import' },
  continue: { label: 'Continue', icon: 'play' },
  resume: { label: 'Resume', icon: 'play' },
  pause: { label: 'Pause', icon: 'pause' },
  stop: { label: 'Stop', icon: 'stop' },
  full: { label: 'Scan all bookmarks', icon: null }
};

const VISIBLE_HINT = 'Keep this tab visible.'; // background tabs pause the import

/**
 * @param {{ phase: string, tone: string, text: string, commands: string[] }} status
 */
export function syncView({ phase, tone, text, commands = [] }) {
  const buttons = commands
    .filter((command) => BUTTONS[command])
    .map((command, index) => ({
      command,
      ...BUTTONS[command],
      ...(command === 'start' && phase === 'done' ? { label: 'Import again' } : {}),
      variant: command === 'full' ? 'link' : index === 0 ? 'primary' : 'secondary'
    }));
  return {
    tone: phase === 'idle' ? 'info' : tone,
    text: phase === 'idle' ? '' : text,
    busy: phase === 'running',
    buttons,
    hint: phase === 'running' ? VISIBLE_HINT : ''
  };
}
