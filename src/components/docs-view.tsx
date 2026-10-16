import { Download, FileDown, Github, Highlighter, Library, LockKeyhole, Search, BookOpenText } from "lucide-react";

const chromeStoreUrl = "https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb";
const extensionRepoUrl = "https://github.com/HiAriesZhou/x-toc";
const websiteRepoUrl = "https://github.com/HiAriesZhou/x-toc-landing-page";

const steps = [
  { icon: BookOpenText, title: "1. Open a supported article", body: "Visit a long-form article on X.com or Twitter.com. XTOC detects headings when the article provides them." },
  { icon: BookOpenText, title: "2. Navigate its headings", body: "Open the extension popup for the current outline. Pin the floating contents panel when you want the structure beside the article; drag or resize it to fit your reading space." },
  { icon: Highlighter, title: "3. Save a passage", body: "Select useful article text and choose Save to XTOC. The passage is stored with its article, timestamp, surrounding context, and author when available." },
  { icon: Library, title: "4. Open Saved clips", body: "Choose Saved clips in the extension popup. Search your library, add tags or notes, delete clips, and select the passages you want to export." },
];

const docSections = [
  ["start", "Start here"],
  ["workflow", "Use the extension"],
  ["library", "Organize and export"],
  ["boundaries", "Current boundaries"],
  ["questions", "Common questions"],
  ["links", "Project links"],
];

export function DocsMain() {
  return <div className="docs-view">
    <section className="docs-hero" id="start">
      <div className="docs-shell">
        <p className="eyebrow">How XTOC works</p>
        <h1>Read with structure. Keep useful context.</h1>
        <p>XTOC is an open-source browser extension for X (Twitter) Articles. It adds a table of contents and lets you save passages locally with tags and notes, then export them as Markdown or JSON.</p>
        <div className="button-row"><a className="primary-button" href={chromeStoreUrl} target="_blank" rel="noopener noreferrer" aria-label="View XTOC in the Chrome Web Store; installation requires desktop Chrome"><span className="desktop-cta-copy">Add to Chrome</span><span className="mobile-cta-copy">Available for desktop Chrome</span><Download aria-hidden="true" /></a></div>
      </div>
    </section>

    <section className="docs-section" id="workflow">
      <div className="docs-shell">
        <p className="eyebrow">Use the extension</p>
        <h2>From article to saved clip</h2>
        <div className="docs-grid">
          {steps.map((step) => { const Icon = step.icon; return <article className="doc-card" key={step.title}><Icon aria-hidden="true" /><h3>{step.title}</h3><p>{step.body}</p></article>; })}
        </div>
      </div>
    </section>

    <section className="docs-section" id="library">
      <div className="docs-shell">
        <p className="eyebrow">Organize and export</p>
        <h2>A small library, built for useful passages</h2>
        <div className="docs-grid">
          <article className="doc-card"><Search aria-hidden="true" /><h3>Search what you saved</h3><p>Search across clip text, article titles, authors, tags, and notes. Clips stay grouped with their source article.</p></article>
          <article className="doc-card"><Highlighter aria-hidden="true" /><h3>Add tags and notes</h3><p>Attach tags for retrieval and a note for the reason the passage mattered. Older clips without these optional fields remain supported.</p></article>
          <article className="doc-card"><FileDown aria-hidden="true" /><h3>Export Markdown or JSON</h3><p>Export every clip or select only the passages you need. Exports are local, user-triggered downloads.</p></article>
          <article className="doc-card"><LockKeyhole aria-hidden="true" /><h3>Keep clip data local</h3><p>Saved clips, tags, notes, and settings remain in browser extension storage. XTOC does not upload saved clips.</p></article>
        </div>
      </div>
    </section>

    <section className="docs-section" id="boundaries">
      <div className="docs-shell">
        <p className="eyebrow">Current boundaries</p>
        <h2>What XTOC does today</h2>
        <p>XTOC works on supported X.com and Twitter.com long-form articles. Heading navigation depends on headings being present in the article.</p>
        <div className="doc-note">Saved passages are available in the extension’s Saved clips page. XTOC does not restore highlights inside the original article, sync clips to a cloud service, or capture arbitrary web pages.</div>
      </div>
    </section>

    <section className="docs-section" id="questions">
      <div className="docs-shell">
        <p className="eyebrow">Common questions</p>
        <h2>Before you start</h2>
        <div className="docs-grid">
          <article className="doc-card"><h3>Does it work on every X post?</h3><p>No. XTOC works on supported long-form X/Twitter articles. A table of contents needs headings in the article; it does not turn ordinary posts into structured articles.</p></article>
          <article className="doc-card"><h3>How do I open the table of contents?</h3><p>Open an article, then select XTOC in Chrome’s extensions menu. Open the outline in the popup and pin the floating panel to keep it beside the article.</p></article>
          <article className="doc-card"><h3>Where do my clips go?</h3><p>The extension keeps clips, tags, and notes in local browser storage. It does not upload saved clips or sync them between devices. Use Markdown or JSON export to keep a separate copy.</p></article>
          <article className="doc-card"><h3>Is this website my clip library?</h3><p>No. This website uses sample content for its interactive demo. Your actual library is in the extension’s Saved clips page.</p></article>
        </div>
      </div>
    </section>

    <section className="docs-section" id="links">
      <div className="docs-shell">
        <p className="eyebrow">Project links</p>
        <h2>Source and maintenance</h2>
        <div className="docs-links"><a href="/privacy">Privacy Policy</a><a href={extensionRepoUrl} target="_blank" rel="noopener noreferrer">Extension source</a><a href={websiteRepoUrl} target="_blank" rel="noopener noreferrer">Website source</a><a href={chromeStoreUrl} target="_blank" rel="noopener noreferrer">Chrome Web Store</a></div>
      </div>
    </section>
  </div>;
}

export function DocsRail() {
  return <>
    <p className="rail-label">DOCUMENTATION</p>
    <p className="docs-rail-number">06</p>
    <h2>Use XTOC.</h2>
    <p className="docs-rail-intro">A short guide to reading, clipping, and exporting.</p>
    <nav>
      {docSections.map(([id, label], index) => <a href={`#${id}`} key={id}><b>0{index + 1}</b><span>{label}</span></a>)}
    </nav>
    <div className="docs-rail-source"><Github aria-hidden="true" /><p>Built in public.<br /><a href={extensionRepoUrl} target="_blank" rel="noopener noreferrer">View the source</a></p></div>
  </>;
}
