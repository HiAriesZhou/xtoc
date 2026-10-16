"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent } from "react";
import { siteUrl, viewPaths, viewMeta } from "@/lib/seo";
import {
  ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, ChevronUp, Download,
  FileText, Github, GripVertical, House, List, Play, RotateCcw, Scissors,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocsMain, DocsRail } from "@/components/docs-view";

const chromeStoreUrl = "https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb";
const extensionRepoUrl = "https://github.com/HiAriesZhou/x-toc";

export type View = "home" | "article" | "clips" | "docs";

type Clip = {
  id: string;
  articleId: string;
  text: string;
  tags: string[];
  note: string;
  createdAt: string;
  sample?: boolean;
};

const articleSections = [
  {
    title: "Why long reads are hard",
    lead: "The internet is full of ideas worth sitting with. But reading a long article on X often means losing the thread: you scroll past a heading, follow a thought, and forget where you started.",
    quote: "Good reading isn’t about remembering everything. It’s about knowing where to return.",
    body: "A long article asks for time and attention. A clear structure makes that attention easier to give. Instead of wondering how much is left, you can see the shape of the argument and choose where to begin.",
  },
  {
    title: "Make the structure visible",
    lead: "An outline gives a long read a shape. The opening tells you where you are; the headings tell you where you can go next.",
    quote: "A table of contents is a small map. It gives you the freedom to explore without losing your place.",
    body: "Try the contents panel beside this article. Jump to another section, then return here. The current section stays highlighted as you read. XTOC brings this simple navigation to long-form articles on X.",
  },
  {
    title: "Turn insights into a personal library",
    lead: "Some sentences change how you think about a problem. Those are the ones worth keeping. Select a passage in this article and save it to your demo clips.",
    quote: "Keep the passage that made you pause, along with the context that made it matter.",
    body: "A saved passage is more useful when it stays connected to its source. In Clips, add a short note about why it matters. A deliberate collection can be more useful than hundreds of forgotten bookmarks.",
  },
  {
    title: "A calmer, more focused internet",
    lead: "There is always another post. Reading deliberately means giving one useful idea enough space before moving on.",
    quote: "Read a little slower. Keep a little less. Return to what matters.",
    body: "Take selected passages with you as Markdown or JSON. This playground demonstrates the workflow with sample content. The extension works on X articles; this demo is separate from your extension data.",
  },
];

const tocEntries = [
  { title: "The art of keeping your place.", level: 1 },
  ...articleSections.map((section) => ({ title: section.title, level: 2 })),
];

const demoArticle = {
  id: "the-art-of-keeping-your-place",
  title: "The art of keeping your place.",
  authorName: "XTOC",
  authorHandle: "@xtoc",
};

const sampleClips: Clip[] = [
  {
    id: "sample-reading",
    articleId: demoArticle.id,
    text: articleSections[0].quote,
    tags: ["Reading"],
    note: "A reminder to read with intention.",
    createdAt: "2026-09-15T08:30:00.000Z",
    sample: true,
  },
  {
    id: "sample-structure",
    articleId: demoArticle.id,
    text: `${articleSections[1].quote} ${articleSections[1].body}`,
    tags: ["Structure", "Product"],
    note: "The clearest description of the product’s core value.",
    createdAt: "2026-09-14T14:20:00.000Z",
    sample: true,
  },
];

const SCROLL_OFFSET = 70;
const READING_LINE = 96;
const SCROLL_TOLERANCE = 4;

function clampScrollTarget(target: number) {
  const maximum = document.documentElement.scrollHeight - window.innerHeight;
  return Math.max(0, Math.min(target, Math.max(0, maximum)));
}

function getActiveSectionIndex(tops: number[], isAtPageEnd: boolean) {
  if (isAtPageEnd && tops.length > 0) return tops.length - 1;
  return tops.reduce((activeIndex, top, index) => (top <= READING_LINE ? index : activeIndex), 0);
}

function ProductAuthor() {
  return <div className="feed-author"><strong>XTOC</strong><span>@xtoc · Sep 15</span></div>;
}

function ArticleCover({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="article-cover" onClick={onOpen} aria-label="Open the demo article">
      <span className="cover-meta"><b>X ARTICLE</b><span>5 min read</span></span>
      <span className="cover-title">The art of<br />keeping your place.</span>
      <span className="cover-deck">How structure turns long reads into a calmer,<br />more focused experience.</span>
      <span className="cover-index" aria-hidden="true">
        {articleSections.map((section, index) => <span key={section.title}><b>0{index + 1}</b><em>{section.title}</em><small>0{index + 1}</small></span>)}
      </span>
      <span className="cover-action">Open & try the contents <ArrowRight aria-hidden="true" /></span>
    </button>
  );
}

function RealTocPanel({ activeIndex, collapsed, onCollapse, onClose, onOpenClips, onSelect }: {
  activeIndex: number; collapsed: boolean; onCollapse: () => void; onClose: () => void;
  onOpenClips: () => void; onSelect: (index: number) => void;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const width = Math.min(560, Math.max(340, window.innerWidth * 0.34));
      setPosition({
        x: Math.max(10, Math.min(event.clientX - drag.current.x, window.innerWidth - width - 10)),
        y: Math.max(10, Math.min(event.clientY - drag.current.y, window.innerHeight - 100)),
      });
    };
    const stop = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  return (
    <section className={`real-toc-panel${collapsed ? " collapsed" : ""}${position ? " dragged" : ""}`} aria-label="XTOC article contents" style={position ? { left: position.x, top: position.y } : undefined}>
      <header className="toc-panel-header" onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        const rect = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!rect) return;
        drag.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setPosition({ x: rect.left, y: rect.top });
      }}>
        <GripVertical className="drag-handle" aria-hidden="true" />
        <span className="toc-panel-title"><b>XTOC</b><span aria-hidden="true"> · </span>Contents</span>
        <span className="toc-panel-actions">
          <button type="button" onClick={onOpenClips} aria-label="Open clips" title="Open clips"><Bookmark aria-hidden="true" /><span>Clips</span></button>
          <button type="button" onClick={onCollapse} aria-label={collapsed ? "Expand table of contents" : "Collapse table of contents"} aria-expanded={!collapsed}><ChevronUp className="collapse-icon" aria-hidden="true" /></button>
          <button type="button" onClick={onClose} aria-label="Hide table of contents"><X aria-hidden="true" /></button>
        </span>
      </header>
      <div className="toc-panel-curtain" aria-hidden={collapsed}>
        <div className="toc-panel-body">
          <ul>
            {tocEntries.map((entry, index) => (
              <li className={`level-${entry.level}`} key={entry.title}>
                <button className={activeIndex === index ? "active" : ""} type="button" onClick={() => onSelect(index)} aria-current={activeIndex === index ? "location" : undefined}>{entry.title}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function XtocExperience({ initialView }: { initialView: View }) {
  const [view, setView] = useState<View>(initialView);
  const [clips, setClips] = useState<Clip[]>(sampleClips);
  const [query, setQuery] = useState("");
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [expandedClipIds, setExpandedClipIds] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [editorClipId, setEditorClipId] = useState<string | null>(null);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftTag, setDraftTag] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [editorStatus, setEditorStatus] = useState("");
  const [selection, setSelection] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [tocVisible, setTocVisible] = useState(true);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const previewClose = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState("");
  const navigationTarget = useRef<{ index: number; scroll: number } | null>(null);
  const scrollFrame = useRef<number | null>(null);

  const applyView = useCallback((nextView: View) => {
    document.title = viewMeta[nextView].title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", viewMeta[nextView].description);
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", siteUrl + viewPaths[nextView]);
    document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.setAttribute("content", nextView === "home" || nextView === "docs" ? "index, follow" : "noindex, follow");
    for (const [selector, content] of [
      ['meta[property="og:title"]', viewMeta[nextView].title],
      ['meta[property="og:description"]', viewMeta[nextView].description],
      ['meta[property="og:url"]', siteUrl + viewPaths[nextView]],
      ['meta[name="twitter:title"]', viewMeta[nextView].title],
      ['meta[name="twitter:description"]', viewMeta[nextView].description],
    ]) document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
    setView(nextView);
    setSelection("");
    setActiveIndex(0);
    setExportOpen(false);
    if (nextView !== "clips") setEditorClipId(null);
    if (nextView === "article") setTocVisible(window.innerWidth > 960);
    navigationTarget.current = null;
  }, []);

  const openView = useCallback((nextView: View, updateHistory = true) => {
    if (updateHistory && (window.location.pathname !== viewPaths[nextView] || window.location.hash)) {
      window.history.pushState({ view: nextView }, "", viewPaths[nextView]);
    }
    if (nextView === view) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    applyView(nextView);
    window.scrollTo({ top: 0 });
  }, [applyView, view]);

  const navigateLink = (event: MouseEvent<HTMLAnchorElement>, nextView: View) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openView(nextView);
  };

  useEffect(() => {
    const handleHistory = () => {
      const nextView = (Object.entries(viewPaths).find(([, path]) => path === window.location.pathname)?.[0] ?? "home") as View;
      if (nextView !== view) openView(nextView, false);
    };
    window.addEventListener("popstate", handleHistory);
    return () => window.removeEventListener("popstate", handleHistory);
  }, [openView, view]);

  const updateActiveSection = useCallback(() => {
    const elements = tocEntries.map((_, index) => document.querySelector<HTMLElement>(`[data-toc-index="${index}"]`));
    if (elements.some((element) => !element)) return;
    const tops = elements.map((element) => element?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
    const atPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    setActiveIndex(getActiveSectionIndex(tops, atPageEnd));
  }, []);

  useEffect(() => {
    if (view !== "article") return;
    const handleScroll = () => {
      if (scrollFrame.current !== null) return;
      scrollFrame.current = window.requestAnimationFrame(() => {
        scrollFrame.current = null;
        const target = navigationTarget.current;
        if (target) {
          const reached = Math.abs(window.scrollY - target.scroll) <= SCROLL_TOLERANCE;
          const atPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
          if (reached || atPageEnd) { navigationTarget.current = null; updateActiveSection(); }
          else setActiveIndex(target.index);
          return;
        }
        updateActiveSection();
      });
    };
    const cancelNavigation = (event: Event) => {
      if (event instanceof KeyboardEvent && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      navigationTarget.current = null;
      updateActiveSection();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", cancelNavigation, { passive: true });
    window.addEventListener("touchstart", cancelNavigation, { passive: true });
    window.addEventListener("keydown", cancelNavigation);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", cancelNavigation);
      window.removeEventListener("touchstart", cancelNavigation);
      window.removeEventListener("keydown", cancelNavigation);
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
    };
  }, [updateActiveSection, view]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!demoOpen) return;
    const trigger = previewTrigger.current;
    previewClose.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDemoOpen(false); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
      trigger?.focus({ preventScroll: true });
    };
  }, [demoOpen]);

  const jumpToSection = (index: number) => {
    const jump = () => {
      const element = document.querySelector<HTMLElement>(`[data-toc-index="${index}"]`);
      if (!element) return;
      const targetScroll = clampScrollTarget(element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET);
      navigationTarget.current = { index, scroll: targetScroll };
      setActiveIndex(index);
      setTocVisible(window.innerWidth > 960);
      window.scrollTo({ top: targetScroll, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      element.classList.add("toc-target-flash");
      window.setTimeout(() => element.classList.remove("toc-target-flash"), 2000);
    };
    if (view !== "article") { openView("article"); window.setTimeout(jump, 50); }
    else jump();
  };

  const captureSelection = () => {
    const selected = window.getSelection();
    const text = selected?.toString().trim() ?? "";
    const anchor = selected?.anchorNode instanceof Element ? selected.anchorNode : selected?.anchorNode?.parentElement;
    const focus = selected?.focusNode instanceof Element ? selected.focusNode : selected?.focusNode?.parentElement;
    setSelection(text && anchor?.closest(".demo-article") && focus?.closest(".demo-article") ? text : "");
  };

  const saveSelection = () => {
    if (!selection) return;
    setClips((current) => [{
      id: crypto.randomUUID(),
      articleId: demoArticle.id,
      text: selection,
      tags: [],
      note: "",
      createdAt: new Date().toISOString(),
    }, ...current]);
    setSelection("");
    window.getSelection()?.removeAllRanges();
    setToast("Passage saved to Clips");
  };

  const exportClips = (format: "markdown" | "json") => {
    const chosen = selectedClipIds.length ? clips.filter((clip) => selectedClipIds.includes(clip.id)) : clips;
    if (!chosen.length) return;
    const content = format === "json"
      ? JSON.stringify({ demo: true, article: "The art of keeping your place.", clips: chosen }, null, 2)
      : `# The art of keeping your place.\n\nXTOC website demo · sample article\n\n${chosen.map((clip) => `> ${clip.text}\n\n${clip.note ? `Note: ${clip.note}\n` : ""}${clip.tags.length ? `Tags: ${clip.tags.join(", ")}\n` : ""}`).join("\n---\n\n")}`;
    const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    const date = new Date().toISOString().slice(0, 10);
    const prefix = selectedClipIds.length ? "x-twitter-selected-clips" : "x-twitter-clips";
    anchor.download = `${prefix}-${date}.${format === "json" ? "json" : "md"}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportOpen(false);
    setToast("Demo clips exported");
  };

  const userClipCount = useMemo(() => clips.filter((clip) => !clip.sample).length, [clips]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleClips = useMemo(() => clips.filter((clip) => `${clip.text} ${clip.tags.join(" ")} ${clip.note} ${demoArticle.title} ${demoArticle.authorName} ${demoArticle.authorHandle}`.toLowerCase().includes(normalizedQuery)), [clips, normalizedQuery]);
  const visibleClipIds = useMemo(() => visibleClips.map((clip) => clip.id), [visibleClips]);
  const selectedVisibleCount = visibleClipIds.filter((id) => selectedClipIds.includes(id)).length;
  const hiddenSelectedCount = selectedClipIds.length - selectedVisibleCount;
  const allVisibleSelected = visibleClipIds.length > 0 && selectedVisibleCount === visibleClipIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const activeEditorClip = clips.find((clip) => clip.id === editorClipId) ?? null;
  const isEditorDirty = Boolean(activeEditorClip && (
    JSON.stringify(activeEditorClip.tags) !== JSON.stringify(draftTags)
    || activeEditorClip.note !== draftNote.trim()
    || draftTag.trim()
  ));

  const toggleClipSelection = (id: string, checked: boolean) => {
    setSelectedClipIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((clipId) => clipId !== id));
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedClipIds((current) => checked
      ? Array.from(new Set([...current, ...visibleClipIds]))
      : current.filter((id) => !visibleClipIds.includes(id)));
  };

  const deleteSelectedClips = () => {
    if (!selectedClipIds.length || !window.confirm(`Delete ${selectedClipIds.length} selected clip${selectedClipIds.length === 1 ? "" : "s"}?`)) return;
    setClips((current) => current.filter((clip) => !selectedClipIds.includes(clip.id)));
    if (editorClipId && selectedClipIds.includes(editorClipId)) setEditorClipId(null);
    setSelectedClipIds([]);
    setToast("Selected clips deleted");
  };

  const openClipEditor = (clip: Clip) => {
    if (editorClipId && editorClipId !== clip.id && isEditorDirty) {
      setEditorStatus("Save or cancel your current changes first.");
      return;
    }
    setEditorClipId(clip.id);
    setDraftTags(clip.tags);
    setDraftTag("");
    setDraftNote(clip.note);
    setEditorStatus("");
  };

  const addDraftTags = (value = draftTag) => {
    const candidates = value.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean);
    if (!candidates.length) return;
    const currentKeys = new Set(draftTags.map((tag) => tag.toLowerCase()));
    const added = candidates.filter((tag) => {
      const key = tag.toLowerCase();
      if (currentKeys.has(key)) return false;
      currentKeys.add(key);
      return true;
    });
    setDraftTags((current) => [...current, ...added]);
    setDraftTag("");
    setEditorStatus(added.length < candidates.length ? "That tag is already added." : "");
  };

  const requestCloseClipEditor = () => {
    if (isEditorDirty) {
      setEditorStatus("Save or cancel your changes first.");
      return;
    }
    setEditorClipId(null);
  };

  const saveClipEditor = () => {
    if (!activeEditorClip) return;
    const pending = draftTag.trim();
    const finalTags = pending && !draftTags.some((tag) => tag.toLowerCase() === pending.toLowerCase()) ? [...draftTags, pending] : draftTags;
    setClips((current) => current.map((clip) => clip.id === activeEditorClip.id ? { ...clip, tags: finalTags, note: draftNote.trim() } : clip));
    setEditorClipId(null);
    setToast("Clip updated");
  };

  return (
    <div className={`playground-shell view-shell${view === "clips" ? " clips-mode" : ""}${view === "docs" ? " docs-mode" : ""}`}>
      <aside className="site-sidebar">
        <button className="site-brand" onClick={() => openView("home")}><Image src="/wordmark.svg" alt="XTOC" width={132} height={32} priority /><small>TOC & Clips for X Articles</small></button>
        <nav aria-label="Primary navigation">
          <a href={viewPaths.home} aria-current={view === "home" ? "page" : undefined} className={view === "home" ? "active" : ""} onClick={(event) => navigateLink(event, "home")}><House aria-hidden="true" /><span>Home</span></a>
          <a href={viewPaths.article} aria-current={view === "article" ? "page" : undefined} className={view === "article" ? "active" : ""} onClick={(event) => navigateLink(event, "article")}><FileText aria-hidden="true" /><span>Article</span></a>
          <a href={viewPaths.clips} aria-current={view === "clips" ? "page" : undefined} className={view === "clips" ? "active" : ""} onClick={(event) => navigateLink(event, "clips")}><Scissors aria-hidden="true" /><span>Clips</span>{userClipCount > 0 && <small>{userClipCount}</small>}</a>
          <a href={viewPaths.docs} aria-current={view === "docs" ? "page" : undefined} className={view === "docs" ? "active" : ""} onClick={(event) => navigateLink(event, "docs")}><BookOpen aria-hidden="true" /><span>Docs</span></a>
        </nav>
        <a className="chrome-cta" href={chromeStoreUrl} target="_blank" rel="noopener noreferrer"><Download aria-hidden="true" />Add to Chrome</a>
        <div className="sidebar-foot"><p>A more focused internet<br />for longer thinking.</p><small>Independent project. Not affiliated with X.</small><a href={extensionRepoUrl} target="_blank" rel="noopener noreferrer"><Github aria-hidden="true" /> Source on GitHub</a></div>
      </aside>

      <main className={`playground-main view-content${view === "docs" ? " docs-main" : ""}`} key={view}>
        {view !== "docs" && (
          <header className={`playground-header${view !== "home" ? " detail-header" : ""}`}>
            {view !== "home" && <Link prefetch={false} className="header-back" href="/" onClick={(event) => navigateLink(event, "home")} aria-label="Back to timeline" title="Back to timeline"><ArrowLeft aria-hidden="true" /></Link>}
            <div className="page-heading"><h1>{view === "home" ? "A timeline for better reading." : view === "clips" ? "Saved Clips" : "Article"}</h1>{view === "home" && <p>Interactive demo</p>}</div>
            {view === "clips" && <p className="page-header-note">Stored in this browser. Export anytime.</p>}
            {view === "article" && <button className="mobile-toc-toggle" onClick={() => setTocVisible((current) => !current)} aria-label="Toggle contents panel"><List aria-hidden="true" /></button>}
          </header>
        )}

        {view === "docs" && <DocsMain />}

        {view === "home" && <div className="timeline">
          <article className="feed-post pinned-post"><p className="pinned-label"><Bookmark aria-hidden="true" /> Pinned</p><Image className="post-avatar" src="/logo.png" alt="" width={38} height={38} /><ProductAuthor /><p className="feed-copy">A map for the long reads you never finish.</p><p className="feed-muted">XTOC adds a table of contents to X Articles. Save passages locally with tags and notes, then export them as Markdown or JSON.</p><button ref={previewTrigger} className="product-film" onClick={() => setDemoOpen(true)} aria-label="Play the 40-second XTOC product film"><Image src="/videos/x-toc-poster.jpg" alt="An X article with the XTOC contents panel open" width={1920} height={1240} priority /><span className="film-play"><Play aria-hidden="true" /></span><span className="film-label">Watch XTOC in action · 0:40</span></button></article>
          <article className="feed-post"><Image className="post-avatar" src="/logo.png" alt="" width={38} height={38} /><ProductAuthor /><p className="feed-copy">A new article on reading with structure.</p><ArticleCover onOpen={() => openView("article")} /></article>
          <article className="feed-post excerpt-post"><span className="post-avatar excerpt-avatar"><Scissors aria-hidden="true" /></span><p className="excerpt-meta">{userClipCount ? "You saved a clip" : "An excerpt worth keeping"} · Demo</p><blockquote>{clips[0]?.text ?? sampleClips[0].text}</blockquote><button className="text-action" onClick={() => openView("clips")}>Open in Clips <ArrowRight aria-hidden="true" /></button></article>
          <article className="feed-post final-post"><Image className="post-avatar" src="/logo.png" alt="" width={38} height={38} /><ProductAuthor /><p className="feed-copy">A small tool for the moments when a long read deserves your full attention.</p><p className="feed-muted">An outline beside the article. Useful passages within reach. That’s XTOC.</p><a className="text-action" href={chromeStoreUrl} target="_blank" rel="noopener noreferrer">Take it to X <ArrowRight aria-hidden="true" /></a></article>
        </div>}

        {view === "article" && <article className="demo-article" onMouseUp={captureSelection} onKeyUp={captureSelection}>
          <header className="article-lead" data-toc-index="0"><p>THE READING SERIES / 01</p><h2>The art of<br />keeping your place.</h2><div>How structure turns long reads into a calmer, more focused experience.</div><span className="article-byline"><Image src="/logo.png" alt="" width={36} height={36} /><span><b>XTOC</b><small>Sep 15, 2026 · 5 min read · Demo article</small></span></span><aside>Try the contents panel, then select a sentence to save it.</aside></header>
          {articleSections.map((section, index) => <section className="article-section" data-toc-index={index + 1} key={section.title}><span>0{index + 1}</span><h3>{section.title}</h3><p>{section.lead}</p><blockquote>{section.quote}</blockquote><p>{section.body}</p></section>)}
          <footer className="article-finish"><Scissors aria-hidden="true" /><h3>A good line is worth keeping.</h3><button onClick={() => openView("clips")}>Visit your Clips <ArrowRight aria-hidden="true" /></button></footer>
        </article>}

        {view === "clips" && <section className="clips-view">
          <section className="clip-library" aria-label="Saved clip library">
            <header className="clip-library-header">
              <div className="clip-library-title">
                <h2>Your library</h2>
                <div className="clip-library-stats" aria-label="Saved clip stats">
                  <span><strong>{visibleClips.length ? 1 : 0}</strong> article{visibleClips.length ? "" : "s"}</span>
                  <span><strong>{visibleClips.length}</strong> clip{visibleClips.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="clip-library-actions">
                {selectedClipIds.length > 0 && <button className="selection-summary" type="button" title="Clear selection" onClick={() => setSelectedClipIds([])}><span aria-hidden="true">×</span><strong>{selectedClipIds.length} selected{hiddenSelectedCount > 0 ? ` · ${hiddenSelectedCount} hidden` : ""}</strong></button>}
                <div className={`clip-export-dropdown${exportOpen ? " open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExportOpen(false); }}>
                  <button className="clip-compact-button" type="button" disabled={!clips.length} aria-expanded={exportOpen} aria-haspopup="true" onClick={() => setExportOpen((current) => !current)}>{selectedClipIds.length ? `Export ${selectedClipIds.length} clip${selectedClipIds.length === 1 ? "" : "s"}` : "Export all"}</button>
                  <div className="clip-export-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => exportClips("markdown")}>{selectedClipIds.length ? "Markdown" : "All clips as Markdown"}</button>
                    <button type="button" role="menuitem" onClick={() => exportClips("json")}>{selectedClipIds.length ? "JSON" : "All clips as JSON"}</button>
                  </div>
                </div>
                {selectedClipIds.length > 0 && <button className="clip-compact-button danger" type="button" onClick={deleteSelectedClips}>Delete selected</button>}
              </div>
            </header>

            <div className="clip-search-row">
              <label className="clip-select-all">
                <input className={`clip-checkbox${someVisibleSelected ? " partial" : ""}`} type="checkbox" checked={allVisibleSelected} disabled={!visibleClipIds.length} onChange={(event) => toggleVisibleSelection(event.target.checked)} />
                <span>{normalizedQuery ? "Select results" : "Select all"}</span>
              </label>
              <div className="clip-search" role="search"><input type="search" autoComplete="off" aria-label="Search clips" placeholder="Search text, title, author, tags, or notes" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            </div>

            <div className="clip-manager">
              {visibleClips.length ? <article className="article-clip-group">
                <div className="article-group-header">
                  {visibleClips.length > 1 ? <label className="group-select" title="Select clips in this article"><input className={`clip-checkbox${someVisibleSelected ? " partial" : ""}`} type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisibleSelection(event.target.checked)} aria-label={`Select clips in ${demoArticle.title}`} /></label> : <span className="group-select-placeholder" aria-hidden="true" />}
                  <div className="article-title-block">
                    <div className="article-title-row">
                      <h3><button className="article-title-link" type="button" onClick={() => openView("article")}><span>{demoArticle.title}</span><span className="external-link-mark" aria-hidden="true">↗</span></button></h3>
                      <div className="article-meta-row"><span className="article-meta-pill">{demoArticle.authorName} ({demoArticle.authorHandle})</span><span className="article-meta-pill">{visibleClips.length} clip{visibleClips.length === 1 ? "" : "s"}</span></div>
                    </div>
                  </div>
                </div>
                <ul className="clip-list">
                  {visibleClips.map((clip) => {
                    const isSelected = selectedClipIds.includes(clip.id);
                    const isExpanded = expandedClipIds.includes(clip.id);
                    const canExpand = clip.text.length > 180 || clip.text.split("\n").length > 3;
                    return <li className={`clip-item${isSelected ? " is-selected" : ""}${editorClipId === clip.id ? " is-editing" : ""}${isExpanded ? " is-expanded" : ""}`} key={clip.id}>
                      <label className="clip-select" title="Select clip"><input className="clip-checkbox" type="checkbox" checked={isSelected} onChange={(event) => toggleClipSelection(clip.id, event.target.checked)} aria-label="Select clip" /></label>
                      <div className="clip-content">
                        <div className="clip-primary-row">
                          <blockquote>{clip.text}</blockquote>
                          <div className="clip-primary-actions">
                            <time dateTime={clip.createdAt} title={`Saved ${new Date(clip.createdAt).toLocaleString("en-US")}`}>{new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(clip.createdAt))}</time>
                            {canExpand && <button className="clip-text-action" type="button" aria-expanded={isExpanded} onClick={() => setExpandedClipIds((current) => isExpanded ? current.filter((id) => id !== clip.id) : [...current, clip.id])}>{isExpanded ? "Show less" : "Show full clip"}</button>}
                            <button className="edit-clip-button" type="button" aria-expanded={editorClipId === clip.id} onClick={() => openClipEditor(clip)}>Edit</button>
                          </div>
                        </div>
                        {(clip.tags.length > 0 || clip.note) && <div className="clip-meta">
                          {clip.tags.length > 0 && <div className="clip-tag-list">{clip.tags.map((tag) => <span className="clip-tag" key={tag}>{tag}</span>)}</div>}
                          {clip.note && <div className="clip-note">{clip.note}</div>}
                        </div>}
                      </div>
                    </li>;
                  })}
                </ul>
              </article> : <div className="clip-empty-state"><strong>{clips.length ? "No matching clips" : "No clips saved yet"}</strong><span>{clips.length ? "Try a different search term." : "Select text in a supported X Article and save your first clip."}</span></div>}
            </div>
          </section>
          <button className="reset-demo" onClick={() => { setClips(sampleClips); setSelectedClipIds([]); setExpandedClipIds([]); setQuery(""); setEditorClipId(null); setToast("Demo reset"); }}><RotateCcw aria-hidden="true" /> Reset demo collection</button>
          <p className="demo-boundary">Demo only. Refreshing resets this collection. Exports contain sample content and are separate from the extension’s export contract.</p>
        </section>}
      <footer className="site-policy-footer"><Link href="/privacy">Privacy Policy</Link><span>Local clips · No telemetry · No uploads</span></footer>
      </main>

      <aside className={`context-rail view-rail${view === "home" ? " home-context" : ""}${view === "article" && tocVisible ? " toc-open" : ""}${view === "clips" ? " clips-context" : ""}${view === "docs" ? " docs-rail" : ""}`} key={`${view}-rail`}>
        {view === "docs" ? <DocsRail /> : view === "clips" ? null : view === "article" ? (tocVisible ? <RealTocPanel activeIndex={activeIndex} collapsed={tocCollapsed} onCollapse={() => setTocCollapsed((current) => !current)} onClose={() => setTocVisible(false)} onOpenClips={() => openView("clips")} onSelect={jumpToSection} /> : <button className="restore-toc" onClick={() => setTocVisible(true)}><List aria-hidden="true" /> Show contents</button>) : <><p className="rail-label">GET STARTED</p><p className="rail-number">01</p><h2>Read, with<br />an outline.</h2><p className="rail-lede">Open the article, choose a section,<br />save a sentence.</p><div className="rail-steps">{[["Start with the reader", "See how the outline appears next to the article."], ["Jump between sections", "Click a heading and go deeper instantly."], ["Save what matters", "Keep a sentence, build your own library."]].map(([title, body], index) => <button key={title} onClick={() => jumpToSection(index + 1)}><b>{index + 1}</b><span><strong>{title}</strong><p>{body}</p></span></button>)}</div><button className="rail-clips" onClick={() => openView("clips")}><span>YOUR DEMO CLIPS</span><div><b>{userClipCount}</b><p>{userClipCount ? "Your good lines are waiting." : "Save your first clip to see it here."}</p></div></button><blockquote className="rail-quote">“A well-structured read<br />goes further.”<cite>— XTOC</cite></blockquote><p className="rail-note">An interactive playground.<br />No installation needed to try.</p></>}
      </aside>

      {activeEditorClip && <aside className="clip-editor-popover" role="dialog" aria-modal="false" aria-labelledby="clip-editor-heading">
        <div className="clip-editor-header">
          <div className="clip-editor-heading"><span id="clip-editor-heading">Edit clip</span><p>{activeEditorClip.text}</p></div>
          <button className="clip-icon-button" type="button" aria-label="Close editor" title="Close editor" onClick={requestCloseClipEditor}><X aria-hidden="true" /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); saveClipEditor(); }}>
          <div className="clip-editor-field clip-editor-tags-field">
            <div className="clip-editor-field-label"><label htmlFor="clip-tag-input">Tags</label><span>Enter or comma to add</span></div>
            <input id="clip-tag-input" className="clip-tag-input" type="text" autoComplete="off" placeholder="Type a tag" value={draftTag} onChange={(event) => { const value = event.target.value; if (/[,，\n]/.test(value)) addDraftTags(value); else setDraftTag(value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addDraftTags(event.currentTarget.value); } }} autoFocus />
            <div className="clip-editor-tags" aria-label="Added tags">{draftTags.length ? draftTags.map((tag) => <button className="clip-tag editor-tag" type="button" title="Remove tag" key={tag} onClick={() => { setDraftTags((current) => current.filter((value) => value !== tag)); setEditorStatus(""); }}><span>{tag}</span><span aria-hidden="true">×</span></button>) : <span className="clip-editor-empty-tags">No tags yet</span>}</div>
          </div>
          <div className="clip-editor-field"><label htmlFor="clip-note-input">Note</label><textarea id="clip-note-input" rows={2} placeholder="Add a short note" value={draftNote} onChange={(event) => { setDraftNote(event.target.value); setEditorStatus(""); }} /></div>
          <p className="clip-editor-status" role="status" aria-live="polite">{editorStatus}</p>
          <div className="clip-editor-footer"><button type="button" onClick={() => setEditorClipId(null)}>Cancel</button><button className="clip-editor-save" type="submit">Save</button></div>
        </form>
      </aside>}

      {selection && <div className="selection-action"><span>{selection.length} characters selected</span><button onMouseDown={(event) => event.preventDefault()} onClick={saveSelection}><Scissors aria-hidden="true" /> Save to XTOC</button></div>}
      {toast && <div className="site-toast" role="status"><Check aria-hidden="true" />{toast}{toast.includes("saved") && <button onClick={() => openView("clips")}>View Clips</button>}</div>}
      {demoOpen && <div className="demo-dialog-backdrop" onMouseDown={() => setDemoOpen(false)}><section className="product-film-dialog" role="dialog" aria-modal="true" aria-label="XTOC product film" onMouseDown={(event) => event.stopPropagation()}><header><span>XTOC / IN PRACTICE</span><button ref={previewClose} onClick={() => setDemoOpen(false)} aria-label="Close video"><X aria-hidden="true" /></button></header><video controls autoPlay playsInline preload="metadata" poster="/videos/x-toc-poster.jpg" aria-label="XTOC demonstration: article navigation, clipping, tags, notes, and export"><source src="/videos/x-toc-demo.mp4" type="video/mp4" /><track kind="captions" src="/videos/x-toc-demo.vtt" srcLang="en" label="English" />Your browser does not support video playback.</video><footer><a href={chromeStoreUrl} target="_blank" rel="noopener noreferrer">Get XTOC for desktop Chrome <Download aria-hidden="true" /></a><button onClick={() => { setDemoOpen(false); openView("article"); }}>Try it yourself <ArrowRight aria-hidden="true" /></button></footer></section></div>}
    </div>
  );
}
