import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.css";

const title = "Privacy Policy";
const description = "How XTOC uses permissions, processes article content locally, and stores your clips without telemetry or uploads.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy Policy | XTOC", description, url: "/privacy" },
  twitter: { title: "Privacy Policy | XTOC", description },
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>XTOC<span>TOC & Clips for X Articles</span></Link>
        <Link href="/docs">How it works →</Link>
      </header>
      <main id="main">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>Your reading, on your device</p>
          <h1>Privacy Policy</h1>
          <p className={styles.lead}>Your clips stay in your browser. XTOC has no telemetry, no clip uploads, and no cloud sync.</p>
          <p className={styles.updated}>Last updated: September 17, 2026 · Extension policy</p>
        </div>

        <section className={styles.section} aria-labelledby="scope">
          <h2 id="scope">01 / What this policy covers</h2>
          <p>This policy describes the XTOC browser extension, maintained by Aries (HiAriesZhou). XTOC provides a table of contents and local clips for supported X.com and Twitter.com long-form articles. You do not need a separate XTOC account.</p>
        </section>

        <section className={styles.section} aria-labelledby="content">
          <h2 id="content">02 / What XTOC reads and saves</h2>
          <p>The extension reads article headings and page content to build the table of contents, navigate sections, and let you select a passage. It responds to scrolling, text selection, and clicks locally to operate these features; it does not send an activity log to the developer.</p>
          <p>When you choose to save a passage, XTOC stores the selected text, nearby text for context, the source URL, article title, available author and publication information, and save timestamps. Tags and notes you add are also stored. Panel position, visibility, and clip settings are saved locally.</p>
          <div className={styles.note}><strong>About “User activity” and “Website content”</strong><p>These data categories describe interactions and content that the extension handles to provide its features. Local processing is still data processing. Reading headings or saving a selection does not mean that XTOC uploads your activity or article content.</p></div>
        </section>

        <section className={styles.section} aria-labelledby="permissions">
          <h2 id="permissions">03 / Why these permissions are needed</h2>
          <dl className={styles.permissions}>
            <div><dt><code>storage</code></dt><dd>Saves clips, article metadata, tags, notes, and preferences in <code>chrome.storage.local</code>, in your local browser profile. XTOC does not use Chrome sync storage.</dd></div>
            <div><dt><code>activeTab</code></dt><dd>Lets the popup identify the active tab when you open it, check whether it is an X/Twitter page, and communicate with the article’s content script.</dd></div>
            <div><dt><code>contextMenus</code></dt><dd>Adds the “Show Table of Contents” right-click menu on X.com and Twitter.com.</dd></div>
            <div><dt>X / Twitter access</dt><dd>Host access and content scripts are limited to <code>https://x.com/*</code> and <code>https://twitter.com/*</code>. This lets XTOC read supported articles and display the reading panel. It does not request access to all websites.</dd></div>
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="transmission">
          <h2 id="transmission">04 / No telemetry or uploads</h2>
          <p>The extension includes no analytics, advertising trackers, or remote error reporting. It does not transmit article content, saved clips, tags, notes, or usage activity to the developer or an external server, and it does not sell or share that data. There is no XTOC backend or automatic cross-device synchronization for clips.</p>
          <p>Normal requests made by X/Twitter and Chrome’s extension distribution and update services are separate from XTOC’s local processing.</p>
        </section>

        <section className={styles.section} aria-labelledby="control">
          <h2 id="control">05 / Retention, deletion, and export</h2>
          <p>Saved data stays in your local browser profile until you delete it or remove the extension’s local data. There is no automatic expiry or server-side copy held by XTOC.</p>
          <ul>
            <li><strong>Review or delete:</strong> Open the extension’s Clips / Options page to review, edit, or delete clips. Deleting an article’s last clip also removes its saved article metadata.</li>
            <li><strong>Remove local extension data:</strong> Uninstalling XTOC removes its local extension storage, including settings. Export anything you want to keep first.</li>
            <li><strong>Export:</strong> Markdown and JSON files are generated locally only when you request them. They can include passages, surrounding context, source URLs, author information, timestamps, tags, and notes.</li>
          </ul>
          <p>Downloaded exports are separate files. Deleting clips or uninstalling XTOC does not delete those files or copies you have shared or backed up. You control where they go.</p>
        </section>

        <section className={styles.section} aria-labelledby="website">
          <h2 id="website">06 / This website and external links</h2>
          <p>This website is a product guide and interactive demo. It does not read your extension’s clip library. The demo uses sample content and does not connect to extension storage.</p>
          <p>Visiting the website involves normal network requests to its hosting provider, Vercel; the extension’s local-only statement does not mean website visits are invisible to a hosting provider. Links to X/Twitter, GitHub, and the Chrome Web Store open services with their own privacy practices.</p>
        </section>

        <section className={styles.section} aria-labelledby="contact">
          <h2 id="contact">07 / Questions and policy changes</h2>
          <p>For privacy questions, email <a href="mailto:aries0331.dev@email.com">aries0331.dev@email.com</a>. You can also inspect the <a href="https://github.com/HiAriesZhou/x-toc">extension source on GitHub</a>. Avoid posting private clips or personal data in public issues.</p>
          <p>This policy will be updated when the extension’s data handling changes. The date above identifies the latest revision.</p>
        </section>
      </main>
      <footer className={styles.footer}><Link href="/">← Back to XTOC</Link><Link href="/docs">Documentation</Link></footer>
    </div>
  );
}
