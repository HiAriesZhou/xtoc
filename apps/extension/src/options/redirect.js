const route = location.hash.slice(1);
const page = route === 'analytics' ? 'analytics' : route === 'settings' ? 'settings' : 'library';
location.replace(chrome.runtime.getURL(`${page}/index.html`) + (page === 'library' ? `#${route === 'bookmarks' ? 'bookmarks' : 'clips'}` : ''));
