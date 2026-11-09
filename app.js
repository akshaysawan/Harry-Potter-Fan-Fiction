/**
 * ============================================================================
 * THE HARRY POTTER CHRONICLES — STANDALONE FAN FICTION READER
 * ============================================================================
 * Configurable Defaults (You can edit these directly or via the pencil icon in the UI):
 */
const DEFAULT_TITLES = {
  seriesTitle: "The Harry Potter Chronicles",
  seriesSubtitle: "A Two-Book Alternate Universe Fan Fiction Saga",
  "book-1": {
    title: "Book 1: The Boy Who Was Loved",
    subtitle: "From Privet Drive to the Grand Alliance"
  },
  "book-2": {
    title: "Book 2: The Next Generation",
    subtitle: "The Rise of the Pantheon & The New Era"
  }
};

const STORAGE_KEYS = {
  STATE: "hp_reader_state_v1",
  PREFS: "hp_reader_prefs_v1",
  BOOKMARKS: "hp_reader_bookmarks_v1",
  TITLES: "hp_reader_custom_titles_v1",
  BOOK2_UNLOCKED: "hp_reader_book2_unlocked_v1"
};

// Deterministic hash of the secret Book 2 passcode
const BOOK2_PASSCODE_HASH = "3399f40c487f";

const FONT_STACKS = {
  crimson: "'Crimson Pro', Georgia, serif",
  lora: "'Lora', 'Palatino Linotype', Palatino, serif",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  readable: "Verdana, Geneva, sans-serif"
};

// Application Runtime State
const App = {
  data: window.BOOKS_DATA || { books: [] },
  view: "library", // 'library' | 'reader'
  activeBookId: "book-1",
  activeChapterNum: 1,
  tocBookId: "book-1",
  searchScope: "all",
  pageIndex: 0,
  totalPages: 1,
  book2Unlocked: false,
  pendingUnlockCallback: null,

  prefs: {
    mode: "scroll", // 'scroll' | 'paginated'
    theme: document.documentElement.getAttribute("data-theme") || "dark", // 'parchment' | 'sepia' | 'dark' | 'light'
    font: "crimson",
    fontSize: 20,
    lineHeight: 1.75,
    maxWidth: "740px",
    align: "justify",
    ttsRate: 1.0,
    ttsVoiceURI: ""
  },

  tts: {
    panelOpen: false,
    playing: false,
    paused: false,
    paraIndex: 0,
    voices: [],
    currentUtterance: null,
    sessionToken: 0
  },

  progress: {
    lastBookId: null,
    lastChapterNum: 1,
    lastReadAt: null,
    // Map of "book-1:1" -> { scrollPct: 0..1, completed: bool }
    chapters: {}
  },

  bookmarks: [],
  customTitles: null
};

/* ============================================================================
   1. INITIALIZATION & STORAGE
   ============================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  loadSavedData();
  applyCustomTitles();
  applyPreferences();
  initTtsVoices();
  bindEvents();
  renderLibrary();

  // Check URL hash for direct chapter link (#book-1/chapter-5)
  handleHashNavigation();
  window.addEventListener("hashchange", handleHashNavigation);

  // If served over HTTP/HTTPS (e.g. GitHub Pages), automatically check the .docx files
  // so that pushing an updated .docx file to GitHub updates the live site automatically!
  syncLiveDocxFilesIfHosted();
});

function loadSavedData() {
  try {
    const savedPrefs = localStorage.getItem(STORAGE_KEYS.PREFS);
    if (savedPrefs) Object.assign(App.prefs, JSON.parse(savedPrefs));

    const savedState = localStorage.getItem(STORAGE_KEYS.STATE);
    if (savedState) Object.assign(App.progress, JSON.parse(savedState));

    const savedBookmarks = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    if (savedBookmarks) App.bookmarks = JSON.parse(savedBookmarks);

    const savedTitles = localStorage.getItem(STORAGE_KEYS.TITLES);
    if (savedTitles) App.customTitles = JSON.parse(savedTitles);

    const savedUnlock = localStorage.getItem(STORAGE_KEYS.BOOK2_UNLOCKED);
    if (savedUnlock === BOOK2_PASSCODE_HASH) {
      App.book2Unlocked = true;
    }
  } catch (err) {
    console.warn("Could not read localStorage:", err);
  }
}

function hashPasscode(str) {
  const s = String(str || "").trim();
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0, ch; i < s.length; i++) {
    ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function isBookLocked(bookId) {
  return bookId === "book-2" && !App.book2Unlocked;
}

function promptUnlockBook2(onUnlocked) {
  App.pendingUnlockCallback = onUnlocked || null;
  const modal = document.getElementById("passcode-modal");
  const input = document.getElementById("input-book2-passcode");
  const errEl = document.getElementById("passcode-error-msg");
  errEl.classList.add("hidden");
  input.value = "";
  modal.classList.remove("hidden");
  setTimeout(() => input.focus(), 30);
}

function closePasscodeModal() {
  document.getElementById("passcode-modal").classList.add("hidden");
  App.pendingUnlockCallback = null;
}

function lockBook2() {
  App.book2Unlocked = false;
  try {
    localStorage.removeItem(STORAGE_KEYS.BOOK2_UNLOCKED);
  } catch (e) {}
  if (App.view === "reader" && App.activeBookId === "book-2") {
    showLibraryView();
  } else {
    renderLibrary();
  }
  showToast("Book 2 is now locked");
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(App.progress));
  } catch (e) {}
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(App.prefs));
  } catch (e) {}
}

function saveBookmarks() {
  try {
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(App.bookmarks));
    updateBookmarkBadges();
  } catch (e) {}
}

function applyCustomTitles() {
  const t = App.customTitles || DEFAULT_TITLES;
  App.data.seriesTitle = t.seriesTitle || DEFAULT_TITLES.seriesTitle;
  App.data.seriesSubtitle = t.seriesSubtitle || DEFAULT_TITLES.seriesSubtitle;

  for (const book of App.data.books) {
    if (t[book.id]) {
      book.title = t[book.id].title || DEFAULT_TITLES[book.id].title;
      book.subtitle = t[book.id].subtitle || DEFAULT_TITLES[book.id].subtitle;
    }
  }

  document.getElementById("header-series-title").textContent = App.data.seriesTitle;
  document.getElementById("library-series-title").textContent = App.data.seriesTitle;
  document.getElementById("library-series-subtitle").textContent = App.data.seriesSubtitle;
}

/* ============================================================================
   2. LIVE .DOCX PARSER IN BROWSER (Auto-Sync on GitHub Pages & File Preview)
   ============================================================================ */
async function syncLiveDocxFilesIfHosted() {
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    return; // On file:// protocol, books-data.js is used directly
  }

  let updatedAny = false;
  for (const book of App.data.books) {
    if (!book.sourceFile) continue;
    try {
      const url = encodeURI(book.sourceFile) + "?t=" + Date.now();
      const resp = await fetch(url, { cache: "no-cache" });
      if (!resp.ok) continue;
      const buf = await resp.arrayBuffer();
      // Parse the live .docx if its byte size differs from pre-built books-data.js
      if (buf.byteLength !== book.fileSize) {
        const parsed = await parseDocxArrayBuffer(buf);
        if (parsed && parsed.chapters.length > 0) {
          book.chapters = parsed.chapters;
          book.chapterCount = parsed.chapters.length;
          book.wordCount = parsed.wordCount;
          book.fileSize = buf.byteLength;
          updatedAny = true;
        }
      }
    } catch (err) {
      // Silently keep pre-bundled books-data.js
    }
  }

  if (updatedAny) {
    renderLibrary();
    if (App.view === "reader") {
      renderChapter(App.activeBookId, App.activeChapterNum, false);
    }
    showToast("Synced latest chapters from repository .docx files");
  }
}

/**
 * Pure browser-native .docx extractor using DataView + DecompressionStream('deflate-raw') + DOMParser
 */
async function parseDocxArrayBuffer(arrayBuffer) {
  const xmlText = await extractDocumentXmlFromZip(arrayBuffer);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");
  const wNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  const paras = xmlDoc.getElementsByTagNameNS(wNs, "p");
  const chapters = [];
  let currentChapter = null;
  let totalWords = 0;

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const runs = p.getElementsByTagNameNS(wNs, "r");
    if (!runs.length) continue;

    // Check paragraph-level bold/italic
    let pPrBold = false;
    let pPrItalic = false;
    const pPr = p.getElementsByTagNameNS(wNs, "pPr")[0];
    if (pPr) {
      const rPr = pPr.getElementsByTagNameNS(wNs, "rPr")[0];
      if (rPr) {
        pPrBold = rPr.getElementsByTagNameNS(wNs, "b").length > 0;
        pPrItalic = rPr.getElementsByTagNameNS(wNs, "i").length > 0;
      }
    }

    let plainText = "";
    let htmlParts = [];

    for (let j = 0; j < runs.length; j++) {
      const r = runs[j];
      const tNodes = r.getElementsByTagNameNS(wNs, "t");
      let rText = "";
      for (let k = 0; k < tNodes.length; k++) {
        rText += tNodes[k].textContent || "";
      }
      if (!rText) continue;
      plainText += rText;

      const rPr = r.getElementsByTagNameNS(wNs, "rPr")[0];
      const isBold = pPrBold || (rPr && rPr.getElementsByTagNameNS(wNs, "b").length > 0);
      const isItalic = pPrItalic || (rPr && rPr.getElementsByTagNameNS(wNs, "i").length > 0);

      let escaped = escapeHtml(rText).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      if (isBold && isItalic) {
        htmlParts.push(`<strong><em>${escaped}</em></strong>`);
      } else if (isBold) {
        htmlParts.push(`<strong>${escaped}</strong>`);
      } else if (isItalic) {
        htmlParts.push(`<em>${escaped}</em>`);
      } else {
        htmlParts.push(escaped);
      }
    }

    plainText = plainText.trim();
    if (!plainText) continue;

    // Skip document title or LLM meta lines
    if (/^(Harry Potter:\s*Fanfiction|Book 2:\s*The Next Generation)$/i.test(plainText)) continue;
    if (/^(Here is the (next chapter|continuation)|\[END OF CHAPTER\])/i.test(plainText)) continue;

    const chapMatch = plainText.match(/^(?:\*\*|\s)*Chapter\s+(\d+)\s*:\s*(.+?)(?:\*\*|\s)*$/i);
    if (chapMatch) {
      const origNum = parseInt(chapMatch[1], 10);
      const chapTitle = chapMatch[2].trim();
      currentChapter = {
        num: chapters.length + 1,
        origNum,
        title: chapTitle,
        wordCount: 0,
        paragraphs: []
      };
      chapters.push(currentChapter);
      continue;
    }

    if (!currentChapter) {
      currentChapter = {
        num: 1,
        origNum: 1,
        title: "Prologue",
        wordCount: 0,
        paragraphs: []
      };
      chapters.push(currentChapter);
    }

    let paraHtml = htmlParts.join("").trim()
      .replace(/<\/strong><strong>/g, "")
      .replace(/<\/em><em>/g, "");

    const wc = plainText.split(/\s+/).filter(Boolean).length;
    currentChapter.wordCount += wc;
    totalWords += wc;

    if (/^(\*\s*\*\s*\*|---+|\~\~\~+)$/.test(plainText)) {
      currentChapter.paragraphs.push('<hr class="scene-break" />');
    } else {
      currentChapter.paragraphs.push(paraHtml);
    }
  }

  return { chapters, wordCount: totalWords };
}

async function extractDocumentXmlFromZip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Invalid .docx ZIP archive");

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");

  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const fileNameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const fileName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen));
    if (fileName === "word/document.xml") {
      const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
      const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return decoder.decode(compressedData);
      } else if (compressionMethod === 8) {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        writer.write(compressedData);
        writer.close();
        const decompressedBuf = await new Response(ds.readable).arrayBuffer();
        return decoder.decode(decompressedBuf);
      }
    }
    cdOffset += 46 + fileNameLen + extraLen + commentLen;
  }
  throw new Error("word/document.xml not found in .docx");
}

/* ============================================================================
   3. LIBRARY VIEW RENDERING
   ============================================================================ */
function renderLibrary() {
  const books = App.data.books || [];
  const totalChapters = books.reduce((acc, b) => acc + b.chapters.length, 0);
  const totalWords = books.reduce((acc, b) => acc + (b.wordCount || 0), 0);

  document.getElementById("sync-status-text").textContent =
    `${books.length} Books Loaded • ${totalChapters.toLocaleString()} Chapters • ${totalWords.toLocaleString()} Words`;

  // Render Continue Reading Card (hide if last read book is locked)
  const continueCard = document.getElementById("continue-reading-card");
  if (App.progress.lastBookId && !isBookLocked(App.progress.lastBookId)) {
    const lastBook = getBook(App.progress.lastBookId) || books[0];
    const lastChap = getChapter(lastBook.id, App.progress.lastChapterNum) || lastBook.chapters[0];
    if (lastBook && lastChap) {
      continueCard.classList.remove("hidden");
      document.getElementById("continue-book-title").textContent = lastBook.title;
      document.getElementById("continue-chapter-title").textContent =
        `Chapter ${lastChap.num}: ${lastChap.title}`;
      document.getElementById("continue-progress-label").textContent =
        `Chapter ${lastChap.num} of ${lastBook.chapters.length}`;
      document.getElementById("continue-last-read").textContent =
        formatRelativeTime(App.progress.lastReadAt);
    }
  } else {
    continueCard.classList.add("hidden");
  }

  // Render Bookshelf Cards
  const grid = document.getElementById("bookshelf-grid");
  grid.innerHTML = "";

  books.forEach((book, idx) => {
    const locked = isBookLocked(book.id);
    const completedCount = getCompletedChaptersCount(book.id);
    const pct = book.chapters.length > 0
      ? Math.round((completedCount / book.chapters.length) * 100)
      : 0;
    const estHours = Math.max(1, Math.round((book.wordCount || 0) / 225 / 60));

    // Find target chapter to start/resume for this specific book
    const resumeChapNum = getBookResumeChapter(book.id);
    const hasStarted = completedCount > 0 || resumeChapNum > 1 || App.progress.lastBookId === book.id;

    const card = document.createElement("article");
    card.className = "book-card";
    const isWip = (book.badge || "").toLowerCase().includes("progress") || (book.badge || "").toLowerCase().includes("wip");

    if (locked) {
      card.innerHTML = `
        <div>
          <div class="book-card-top">
            <div class="book-cover-art cover-${book.id}" aria-hidden="true">
              <span class="cover-volume">VOLUME ${idx === 0 ? "I" : "II"}</span>
              <span class="cover-emblem">🔒</span>
              <span class="cover-mini-title">${escapeHtml(book.title.replace(/^Book \d+:\s*/i, ""))}</span>
            </div>
            <div class="book-info-col">
              <div class="book-badge-row">
                <span class="status-badge badge-locked">🔒 Author Access Only</span>
                <span class="status-badge ${isWip ? "badge-wip" : "badge-complete"}">${escapeHtml(book.badge || "WIP")}</span>
              </div>
              <h2 class="book-card-title">${escapeHtml(book.title)}</h2>
              <p class="book-card-subtitle">${escapeHtml(book.subtitle || "")}</p>
              <div class="book-stats-grid">
                <span class="stat-item">🔐 Protected Work-in-Progress</span>
              </div>
            </div>
          </div>
        </div>

        <div class="book-progress-box">
          <div class="progress-label-row">
            <span>Enter your access code to unlock chapters</span>
            <span>🔒</span>
          </div>
          <div class="progress-track-mini">
            <div class="progress-fill-mini" style="width: 0%"></div>
          </div>
          <div class="book-card-actions">
            <button class="primary-gold-btn btn-unlock-book" data-book-id="${book.id}" data-chap="${resumeChapNum}">
              <span>🔒 Unlock Book 2</span>
            </button>
          </div>
        </div>
      `;
    } else {
      const lockAgainBtn = book.id === "book-2"
        ? `<button class="lock-toggle-btn btn-relock-book2" title="Lock Book 2 again">🔒 Lock</button>`
        : "";
      card.innerHTML = `
        <div>
          <div class="book-card-top">
            <div class="book-cover-art cover-${book.id}" aria-hidden="true">
              <span class="cover-volume">VOLUME ${idx === 0 ? "I" : "II"}</span>
              <span class="cover-emblem">${idx === 0 ? "⚡" : "🦅"}</span>
              <span class="cover-mini-title">${escapeHtml(book.title.replace(/^Book \d+:\s*/i, ""))}</span>
            </div>
            <div class="book-info-col">
              <div class="book-badge-row">
                <span class="status-badge ${isWip ? "badge-wip" : "badge-complete"}">${escapeHtml(book.badge || "Book")}</span>
                <span class="stat-item">${book.chapters.length} Chapters</span>
                ${lockAgainBtn}
              </div>
              <h2 class="book-card-title">${escapeHtml(book.title)}</h2>
              <p class="book-card-subtitle">${escapeHtml(book.subtitle || "")}</p>
              <div class="book-stats-grid">
                <span class="stat-item">📖 ${(book.wordCount || 0).toLocaleString()} words</span>
                <span class="stat-item">⏱ ~${estHours} hrs read</span>
              </div>
            </div>
          </div>
        </div>

        <div class="book-progress-box">
          <div class="progress-label-row">
            <span>${completedCount} of ${book.chapters.length} chapters completed</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-track-mini">
            <div class="progress-fill-mini" style="width: ${pct}%"></div>
          </div>
          <div class="book-card-actions">
            <button class="primary-gold-btn btn-open-book" data-book-id="${book.id}" data-chap="${resumeChapNum}">
              <span>${hasStarted ? `Continue (Ch. ${resumeChapNum})` : "Start Reading"}</span>
            </button>
            <button class="secondary-btn btn-browse-toc" data-book-id="${book.id}">
              Chapters
            </button>
          </div>
        </div>
      `;
    }
    grid.appendChild(card);
  });

  // Bind dynamic card buttons
  grid.querySelectorAll(".btn-unlock-book").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chap = parseInt(btn.dataset.chap, 10) || 1;
      promptUnlockBook2(() => {
        renderLibrary();
        openReader("book-2", chap);
      });
    });
  });

  grid.querySelectorAll(".btn-relock-book2").forEach((btn) => {
    btn.addEventListener("click", () => {
      lockBook2();
    });
  });

  grid.querySelectorAll(".btn-open-book").forEach((btn) => {
    btn.addEventListener("click", () => {
      openReader(btn.dataset.bookId, parseInt(btn.dataset.chap, 10) || 1);
    });
  });

  grid.querySelectorAll(".btn-browse-toc").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.tocBookId = btn.dataset.bookId;
      openTocDrawer();
    });
  });

  updateBookmarkBadges();
}

function getBookResumeChapter(bookId) {
  if (App.progress.lastBookId === bookId && App.progress.lastChapterNum) {
    return App.progress.lastChapterNum;
  }
  const book = getBook(bookId);
  if (!book) return 1;
  // Find first incomplete chapter if some are completed
  for (const ch of book.chapters) {
    const key = `${bookId}:${ch.num}`;
    if (!App.progress.chapters[key]?.completed) {
      return ch.num;
    }
  }
  return 1;
}

function getCompletedChaptersCount(bookId) {
  const book = getBook(bookId);
  if (!book) return 0;
  let count = 0;
  for (const ch of book.chapters) {
    if (App.progress.chapters[`${bookId}:${ch.num}`]?.completed) count++;
  }
  return count;
}

/* ============================================================================
   4. READER VIEW & CHAPTER RENDERING
   ============================================================================ */
function openReader(bookId, chapterNum, targetParagraphIndex = null, highlightTerm = null) {
  const book = getBook(bookId);
  if (!book) return;
  if (isBookLocked(book.id)) {
    promptUnlockBook2(() => {
      renderLibrary();
      openReader(bookId, chapterNum, targetParagraphIndex, highlightTerm);
    });
    return;
  }
  const chapter = getChapter(bookId, chapterNum) || book.chapters[0];
  if (!chapter) return;

  App.view = "reader";
  App.activeBookId = book.id;
  App.activeChapterNum = chapter.num;
  App.tocBookId = book.id;

  // Record last read state
  App.progress.lastBookId = book.id;
  App.progress.lastChapterNum = chapter.num;
  App.progress.lastReadAt = new Date().toISOString();
  saveProgress();

  // Update URL Hash without re-triggering hashchange loop
  const targetHash = `#${book.id}/chapter-${chapter.num}`;
  if (window.location.hash !== targetHash) {
    history.pushState(null, "", targetHash);
  }

  // Toggle UI Views
  document.getElementById("library-view").classList.add("hidden");
  document.getElementById("reader-view").classList.remove("hidden");
  document.getElementById("btn-home").classList.remove("hidden");
  document.getElementById("reader-nav-center").classList.remove("hidden");
  document.getElementById("btn-tts-toggle").classList.remove("hidden");
  document.getElementById("btn-add-bookmark").classList.remove("hidden");
  document.getElementById("btn-save-bookmark-drawer").classList.remove("hidden");
  document.getElementById("reading-progress-track").classList.remove("hidden");

  const wasPlayingTts = App.tts.playing;
  if (wasPlayingTts) {
    stopTtsSpeechOnly();
  }

  renderChapter(book.id, chapter.num, true, targetParagraphIndex, highlightTerm);

  if (wasPlayingTts) {
    startTtsFromParagraph(targetParagraphIndex !== null ? targetParagraphIndex : 0, true);
  }
}

function showLibraryView() {
  stopAndCloseTts();
  App.view = "library";
  document.body.classList.remove("mode-paginated");
  document.getElementById("reader-view").classList.add("hidden");
  document.getElementById("library-view").classList.remove("hidden");
  document.getElementById("btn-home").classList.add("hidden");
  document.getElementById("reader-nav-center").classList.add("hidden");
  document.getElementById("btn-tts-toggle").classList.add("hidden");
  document.getElementById("btn-add-bookmark").classList.add("hidden");
  document.getElementById("btn-save-bookmark-drawer").classList.add("hidden");
  document.getElementById("reading-progress-track").classList.add("hidden");

  if (window.location.hash) {
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
  renderLibrary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderChapter(bookId, chapterNum, restorePosition = true, targetParaIdx = null, highlightTerm = null) {
  const book = getBook(bookId);
  const chapter = getChapter(bookId, chapterNum);
  if (!book || !chapter) return;

  // Update Header Pills
  document.querySelectorAll(".book-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.bookId === book.id);
  });
  document.getElementById("current-chapter-pill-label").textContent =
    `Ch. ${chapter.num}: ${chapter.title}`;
  document.getElementById("header-context-subtitle").textContent = book.title;

  // Update Chapter Header
  document.getElementById("chapter-book-eyebrow").textContent = book.title.toUpperCase();
  document.getElementById("chapter-number-badge").textContent = `CHAPTER ${chapter.num}`;
  document.getElementById("chapter-title").textContent = chapter.title;
  document.getElementById("chapter-word-count").textContent = `${(chapter.wordCount || 0).toLocaleString()} words`;
  const readMins = Math.max(1, Math.round((chapter.wordCount || 0) / 225));
  document.getElementById("chapter-read-time").textContent = `${readMins} min read`;

  // Render Paragraphs with automatic Scene Subheading detection & Drop Cap
  const contentEl = document.getElementById("chapter-content");
  const htmlFragments = [];
  let firstStoryParaMarked = false;

  chapter.paragraphs.forEach((rawHtml, idx) => {
    if (rawHtml.startsWith("<hr")) {
      htmlFragments.push(rawHtml);
      return;
    }

    // Check if this paragraph is a short standalone bold scene subheading
    const stripped = stripHtml(rawHtml).trim();
    const isWholeBold = /^<strong>[^<]+<\/strong>$/i.test(rawHtml) && stripped.length <= 65;
    const isPartHeader = /^Part\s+[IVX]+\s*:/i.test(stripped);
    const endsWithSentencePunct = /[.!?",;:\u201D\u2019]$/.test(stripped) && !isPartHeader;

    if ((isWholeBold && !endsWithSentencePunct) || isPartHeader) {
      htmlFragments.push(`<h3 class="scene-subhead" data-para-idx="${idx}">${escapeHtml(stripped)}</h3>`);
      return;
    }

    let processedHtml = rawHtml;
    if (highlightTerm && highlightTerm.length >= 2) {
      processedHtml = highlightTextInHtml(processedHtml, highlightTerm);
    }

    const classes = [];
    if (!firstStoryParaMarked && stripped.length > 40) {
      classes.push("first-para");
      firstStoryParaMarked = true;
    }
    if (targetParaIdx !== null && idx === targetParaIdx) {
      classes.push("search-target-flash");
    }

    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
    htmlFragments.push(`<p${classAttr} data-para-idx="${idx}">${processedHtml}</p>`);
  });

  contentEl.innerHTML = htmlFragments.join("\n");

  // Update Prev / Next Chapter Buttons
  const prevChap = getChapter(book.id, chapter.num - 1);
  const nextChap = getChapter(book.id, chapter.num + 1);
  const btnPrev = document.getElementById("btn-prev-chapter");
  const btnNext = document.getElementById("btn-next-chapter");

  if (prevChap) {
    btnPrev.disabled = false;
    document.getElementById("prev-chapter-title").textContent = `Ch. ${prevChap.num}: ${prevChap.title}`;
  } else if (book.id === "book-2") {
    const b1 = getBook("book-1");
    const lastB1 = b1.chapters[b1.chapters.length - 1];
    btnPrev.disabled = false;
    document.getElementById("prev-chapter-title").textContent = `Book 1, Ch. ${lastB1.num}: ${lastB1.title}`;
  } else {
    btnPrev.disabled = true;
    document.getElementById("prev-chapter-title").textContent = "Beginning of Book 1";
  }

  if (nextChap) {
    btnNext.disabled = false;
    document.getElementById("next-chapter-title").textContent = `Ch. ${nextChap.num}: ${nextChap.title}`;
  } else if (book.id === "book-1") {
    const b2 = getBook("book-2");
    const firstB2 = b2.chapters[0];
    btnNext.disabled = false;
    document.getElementById("next-chapter-title").textContent = `Start Book 2: Ch. 1 — ${firstB2.title}`;
  } else {
    btnNext.disabled = true;
    document.getElementById("next-chapter-title").textContent = "End of Available Chapters (WIP)";
  }

  updateChapterCompletionUI();
  updateBookmarkButtonState();
  document.getElementById("bottom-book-chapter").textContent =
    `${book.id === "book-1" ? "Book 1" : "Book 2"} • Ch. ${chapter.num} of ${book.chapters.length}`;

  // Apply Scroll vs Paginated Mode positioning
  applyReadingModeLayout(restorePosition, targetParaIdx);
}

/* ============================================================================
   5. SCROLL MODE & PAGINATED (PAGE-FLIP) MODE ENGINE
   ============================================================================ */
function applyReadingModeLayout(restorePosition = true, targetParaIdx = null) {
  const isPaginated = App.prefs.mode === "paginated";
  document.body.classList.toggle("mode-paginated", isPaginated);
  document.getElementById("page-prev-zone").classList.toggle("hidden", !isPaginated);
  document.getElementById("page-next-zone").classList.toggle("hidden", !isPaginated);
  document.getElementById("paginated-controls").classList.toggle("hidden", !isPaginated);
  document.getElementById("chapter-footer").classList.toggle("hidden", isPaginated);

  const contentEl = document.getElementById("chapter-content");
  const headerEl = document.getElementById("chapter-header");

  if (isPaginated) {
    window.scrollTo(0, 0);
    App.pageIndex = 0;
    requestAnimationFrame(() => {
      recalculatePagination(targetParaIdx);
    });
  } else {
    contentEl.style.transform = "";
    contentEl.style.columnWidth = "";
    contentEl.style.columnGap = "";
    headerEl.classList.remove("hidden");

    if (targetParaIdx !== null) {
      requestAnimationFrame(() => {
        const el = contentEl.querySelector(`[data-para-idx="${targetParaIdx}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } else if (restorePosition) {
      const savedPct = App.progress.chapters[`${App.activeBookId}:${App.activeChapterNum}`]?.scrollPct || 0;
      if (savedPct > 0.02 && savedPct < 0.96) {
        requestAnimationFrame(() => {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({ top: maxScroll * savedPct, behavior: "auto" });
        });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    updateScrollProgress();
  }
}

function recalculatePagination(targetParaIdx = null) {
  if (App.view !== "reader" || App.prefs.mode !== "paginated") return;

  const paperEl = document.getElementById("reader-paper");
  const contentEl = document.getElementById("chapter-content");
  const headerEl = document.getElementById("chapter-header");

  // Show chapter header only on Page 0
  headerEl.classList.toggle("hidden", App.pageIndex > 0);

  const gap = 80; // 5rem gap in px
  const innerWidth = paperEl.clientWidth - 80; // 2.5rem left + 2.5rem right padding
  contentEl.style.columnWidth = `${innerWidth}px`;
  contentEl.style.columnGap = `${gap}px`;

  const totalScrollWidth = contentEl.scrollWidth;
  const pageStride = innerWidth + gap;
  App.totalPages = Math.max(1, Math.round((totalScrollWidth + gap) / pageStride));

  if (targetParaIdx !== null) {
    const targetEl = contentEl.querySelector(`[data-para-idx="${targetParaIdx}"]`);
    if (targetEl) {
      const offsetLeft = targetEl.offsetLeft;
      App.pageIndex = Math.min(App.totalPages - 1, Math.max(0, Math.floor(offsetLeft / pageStride)));
      headerEl.classList.toggle("hidden", App.pageIndex > 0);
    }
  }

  if (App.pageIndex >= App.totalPages) {
    App.pageIndex = App.totalPages - 1;
  }

  const translateX = -(App.pageIndex * pageStride);
  contentEl.style.transform = `translateX(${translateX}px)`;

  // Update footer & progress bar
  const pct = App.totalPages > 1 ? Math.round(((App.pageIndex + 1) / App.totalPages) * 100) : 100;
  document.getElementById("page-counter-text").textContent = `Page ${App.pageIndex + 1} of ${App.totalPages}`;
  document.getElementById("bottom-progress-pct").textContent = `${pct}% of Chapter`;
  document.getElementById("reading-progress-bar").style.width = `${pct}%`;

  if (App.pageIndex === App.totalPages - 1) {
    markChapterCompleted(App.activeBookId, App.activeChapterNum, true);
  }
}

function flipPage(delta) {
  if (App.view !== "reader" || App.prefs.mode !== "paginated") return;

  const nextIdx = App.pageIndex + delta;
  if (nextIdx < 0) {
    // Go to previous chapter
    navigateAdjacentChapter(-1);
    return;
  }
  if (nextIdx >= App.totalPages) {
    // Mark current chapter completed and advance to next chapter
    markChapterCompleted(App.activeBookId, App.activeChapterNum, true);
    navigateAdjacentChapter(1);
    return;
  }

  App.pageIndex = nextIdx;
  recalculatePagination();
}

function navigateAdjacentChapter(dir) {
  const book = getBook(App.activeBookId);
  if (!book) return;
  const targetNum = App.activeChapterNum + dir;
  const targetChap = getChapter(book.id, targetNum);

  if (targetChap) {
    openReader(book.id, targetChap.num, null);
  } else if (dir > 0 && book.id === "book-1") {
    openReader("book-2", 1, null);
  } else if (dir < 0 && book.id === "book-2") {
    const b1 = getBook("book-1");
    openReader("book-1", b1.chapters.length, null);
  }
}

function updateScrollProgress() {
  if (App.view !== "reader" || App.prefs.mode !== "scroll") return;

  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const pct = Math.min(1, Math.max(0, scrollTop / maxScroll));
  const displayPct = Math.round(pct * 100);

  document.getElementById("reading-progress-bar").style.width = `${displayPct}%`;
  document.getElementById("bottom-progress-pct").textContent = `${displayPct}% of Chapter`;

  const key = `${App.activeBookId}:${App.activeChapterNum}`;
  if (!App.progress.chapters[key]) {
    App.progress.chapters[key] = { scrollPct: 0, completed: false };
  }
  App.progress.chapters[key].scrollPct = Number(pct.toFixed(3));

  // Auto-mark completed when scrolling past 92% of the chapter
  if (pct >= 0.92 && !App.progress.chapters[key].completed) {
    markChapterCompleted(App.activeBookId, App.activeChapterNum, true);
  } else {
    saveProgress();
  }
}

/* ============================================================================
   6. CHAPTER COMPLETION & BOOKMARKS
   ============================================================================ */
function markChapterCompleted(bookId, chapterNum, completed) {
  const key = `${bookId}:${chapterNum}`;
  if (!App.progress.chapters[key]) {
    App.progress.chapters[key] = { scrollPct: 0, completed: false };
  }
  App.progress.chapters[key].completed = completed;
  saveProgress();
  if (bookId === App.activeBookId && chapterNum === App.activeChapterNum) {
    updateChapterCompletionUI();
  }
}

function updateChapterCompletionUI() {
  const key = `${App.activeBookId}:${App.activeChapterNum}`;
  const isDone = !!App.progress.chapters[key]?.completed;

  const topBtn = document.getElementById("btn-toggle-complete");
  topBtn.classList.toggle("completed", isDone);
  document.getElementById("chapter-complete-icon").textContent = isDone ? "✓" : "○";
  document.getElementById("chapter-complete-text").textContent = isDone ? "Completed" : "Mark Completed";

  const footerBtn = document.getElementById("btn-footer-complete");
  footerBtn.classList.toggle("completed", isDone);
  document.getElementById("footer-complete-label").textContent = isDone
    ? "Chapter Completed ✓"
    : "Mark Chapter as Completed";
}

function toggleBookmarkCurrentPosition() {
  if (App.view !== "reader") return;
  const book = getBook(App.activeBookId);
  const chapter = getChapter(App.activeBookId, App.activeChapterNum);
  if (!book || !chapter) return;

  // Check if chapter already has a bookmark
  const existingIdx = App.bookmarks.findIndex(
    (b) => b.bookId === book.id && b.chapterNum === chapter.num
  );

  if (existingIdx !== -1) {
    App.bookmarks.splice(existingIdx, 1);
    saveBookmarks();
    updateBookmarkButtonState();
    renderBookmarksList();
    showToast("Bookmark removed");
    return;
  }

  // Capture visible paragraph snippet
  const snippet = getCurrentVisibleSnippet(chapter);
  const scrollPct = App.progress.chapters[`${book.id}:${chapter.num}`]?.scrollPct || 0;

  App.bookmarks.unshift({
    id: "bm_" + Date.now(),
    bookId: book.id,
    bookTitle: book.title,
    chapterNum: chapter.num,
    chapterTitle: chapter.title,
    scrollPct,
    snippet,
    createdAt: new Date().toISOString()
  });

  saveBookmarks();
  updateBookmarkButtonState();
  renderBookmarksList();
  showToast(`Bookmarked ${book.id === "book-1" ? "Book 1" : "Book 2"}, Chapter ${chapter.num}`);
}

function getCurrentVisibleSnippet(chapter) {
  const paras = document.querySelectorAll("#chapter-content p");
  for (const p of paras) {
    const rect = p.getBoundingClientRect();
    if (rect.top >= 60 && rect.top <= window.innerHeight * 0.7) {
      return p.textContent.trim().slice(0, 140);
    }
  }
  return stripHtml(chapter.paragraphs[0] || "").slice(0, 140);
}

function updateBookmarkButtonState() {
  const btn = document.getElementById("btn-add-bookmark");
  const isBookmarked = App.bookmarks.some(
    (b) => b.bookId === App.activeBookId && b.chapterNum === App.activeChapterNum
  );
  btn.classList.toggle("bookmarked", isBookmarked);
}

function updateBookmarkBadges() {
  const badge = document.getElementById("bookmark-count-badge");
  if (App.bookmarks.length > 0) {
    badge.textContent = App.bookmarks.length;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function renderBookmarksList() {
  const listEl = document.getElementById("bookmarks-list");
  if (App.bookmarks.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.88rem;">
        <p style="margin-bottom:0.5rem;">No bookmarks saved yet.</p>
        <p style="font-size:0.78rem; color: var(--text-faint);">Click the ribbon icon in the top bar while reading any chapter to save your spot.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = "";
  App.bookmarks.forEach((bm) => {
    const item = document.createElement("div");
    item.className = "bookmark-card";
    item.innerHTML = `
      <div class="bookmark-top">
        <span class="bookmark-book-chap">${bm.bookId === "book-1" ? "BOOK 1" : "BOOK 2"} • CHAPTER ${bm.chapterNum}</span>
        <button class="bookmark-del-btn" data-id="${bm.id}" title="Delete Bookmark">✕</button>
      </div>
      <div class="bookmark-chap-title">${escapeHtml(bm.chapterTitle)}</div>
      <div class="bookmark-snippet">“${escapeHtml(bm.snippet)}…”</div>
      <div class="bookmark-date">Saved ${formatRelativeTime(bm.createdAt)}</div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest(".bookmark-del-btn")) return;
      closeAllDrawers();
      openReader(bm.bookId, bm.chapterNum);
      if (bm.scrollPct && App.prefs.mode === "scroll") {
        setTimeout(() => {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({ top: maxScroll * bm.scrollPct, behavior: "smooth" });
        }, 80);
      }
    });

    item.querySelector(".bookmark-del-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      App.bookmarks = App.bookmarks.filter((x) => x.id !== bm.id);
      saveBookmarks();
      updateBookmarkButtonState();
      renderBookmarksList();
    });

    listEl.appendChild(item);
  });
}

/* ============================================================================
   7. TABLE OF CONTENTS DRAWER
   ============================================================================ */
function openTocDrawer() {
  if (isBookLocked(App.tocBookId)) {
    App.tocBookId = "book-1";
  }
  closeAllDrawers();
  document.getElementById("drawer-backdrop").classList.remove("hidden");
  document.getElementById("toc-drawer").classList.remove("hidden");
  renderTocList();

  // Scroll active chapter into view
  requestAnimationFrame(() => {
    const activeEl = document.querySelector("#toc-list .toc-item.active");
    if (activeEl) activeEl.scrollIntoView({ block: "center" });
  });
}

function renderTocList() {
  const book = getBook(App.tocBookId) || App.data.books[0];
  if (!book) return;

  // Update tabs
  document.querySelectorAll(".toc-book-tab").forEach((tab) => {
    const b = getBook(tab.dataset.bookId);
    if (b) {
      const lockedSuffix = isBookLocked(b.id) ? " 🔒" : ` (${b.chapters.length})`;
      tab.textContent = `${b.id === "book-1" ? "Book 1" : "Book 2"}${lockedSuffix}`;
    }
    tab.classList.toggle("active", tab.dataset.bookId === book.id);
  });

  const completedCount = getCompletedChaptersCount(book.id);
  document.getElementById("toc-book-title").textContent = book.title;
  document.getElementById("toc-progress-summary").textContent =
    `${completedCount} of ${book.chapters.length} chapters completed`;

  const filterQuery = (document.getElementById("toc-search-input").value || "").trim().toLowerCase();
  const listEl = document.getElementById("toc-list");
  listEl.innerHTML = "";

  book.chapters.forEach((ch) => {
    const fullLabel = `chapter ${ch.num} ${ch.title}`.toLowerCase();
    if (filterQuery && !fullLabel.includes(filterQuery)) return;

    const isCurrent = App.view === "reader" && App.activeBookId === book.id && App.activeChapterNum === ch.num;
    const isDone = !!App.progress.chapters[`${book.id}:${ch.num}`]?.completed;
    const mins = Math.max(1, Math.round((ch.wordCount || 0) / 225));

    const row = document.createElement("div");
    row.className = `toc-item${isCurrent ? " active" : ""}`;
    row.innerHTML = `
      <div class="toc-item-left">
        <div class="toc-chap-num">Chapter ${ch.num}</div>
        <div class="toc-chap-name">${escapeHtml(ch.title)}</div>
        <div class="toc-chap-meta">${(ch.wordCount || 0).toLocaleString()} words • ~${mins} min</div>
      </div>
      <button class="toc-check-btn${isDone ? " done" : ""}" title="Toggle chapter completed">✓</button>
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".toc-check-btn")) return;
      closeAllDrawers();
      openReader(book.id, ch.num, null);
    });

    row.querySelector(".toc-check-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const nextState = !App.progress.chapters[`${book.id}:${ch.num}`]?.completed;
      markChapterCompleted(book.id, ch.num, nextState);
      renderTocList();
      if (App.view === "library") renderLibrary();
    });

    listEl.appendChild(row);
  });
}

/* ============================================================================
   8. FULL-TEXT SEARCH ACROSS BOTH BOOKS
   ============================================================================ */
function openSearchModal() {
  closeAllDrawers();
  const modal = document.getElementById("search-modal");
  modal.classList.remove("hidden");
  const input = document.getElementById("global-search-input");
  input.focus();
  input.select();
}

function closeSearchModal() {
  document.getElementById("search-modal").classList.add("hidden");
}

function executeFullTextSearch() {
  const query = (document.getElementById("global-search-input").value || "").trim();
  const resultsEl = document.getElementById("search-results-list");
  const statsEl = document.getElementById("search-stats-text");

  if (query.length < 2) {
    resultsEl.innerHTML = "";
    statsEl.textContent = "Type at least 2 characters to search across 253,060 words";
    return;
  }

  const qLower = query.toLowerCase();
  const matches = [];
  const maxResults = 120;

  for (const book of App.data.books) {
    if (isBookLocked(book.id)) continue;
    if (App.searchScope !== "all" && App.searchScope !== book.id) continue;

    for (const ch of book.chapters) {
      // Check chapter title match too
      if (ch.title.toLowerCase().includes(qLower)) {
        matches.push({
          bookId: book.id,
          bookLabel: book.id === "book-1" ? "Book 1" : "Book 2",
          chapterNum: ch.num,
          chapterTitle: ch.title,
          paraIdx: 0,
          snippetHtml: `<strong>Chapter Title Match:</strong> ${highlightTextInHtml(escapeHtml(ch.title), query)}`
        });
      }

      for (let pIdx = 0; pIdx < ch.paragraphs.length; pIdx++) {
        const plain = stripHtml(ch.paragraphs[pIdx]);
        const pos = plain.toLowerCase().indexOf(qLower);
        if (pos !== -1) {
          const start = Math.max(0, pos - 65);
          const end = Math.min(plain.length, pos + query.length + 85);
          let excerpt = plain.slice(start, end);
          if (start > 0) excerpt = "…" + excerpt;
          if (end < plain.length) excerpt = excerpt + "…";

          matches.push({
            bookId: book.id,
            bookLabel: book.id === "book-1" ? "Book 1" : "Book 2",
            chapterNum: ch.num,
            chapterTitle: ch.title,
            paraIdx: pIdx,
            snippetHtml: highlightTextInHtml(escapeHtml(excerpt), query)
          });

          if (matches.length >= maxResults) break;
        }
      }
      if (matches.length >= maxResults) break;
    }
  }

  statsEl.textContent = matches.length >= maxResults
    ? `Showing top ${maxResults}+ matches for “${query}”`
    : `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for “${query}”`;

  resultsEl.innerHTML = "";
  matches.forEach((m) => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.innerHTML = `
      <div class="search-res-meta">${m.bookLabel} • Chapter ${m.chapterNum}: ${escapeHtml(m.chapterTitle)}</div>
      <div class="search-res-snippet">${m.snippetHtml}</div>
    `;
    item.addEventListener("click", () => {
      closeSearchModal();
      openReader(m.bookId, m.chapterNum, m.paraIdx, query);
    });
    resultsEl.appendChild(item);
  });
}

/* ============================================================================
   9. APPEARANCE & TYPOGRAPHY PREFERENCES
   ============================================================================ */
function applyPreferences() {
  const p = App.prefs;
  document.documentElement.setAttribute("data-theme", p.theme);
  document.documentElement.style.setProperty("--reader-font-family", FONT_STACKS[p.font] || FONT_STACKS.crimson);
  document.documentElement.style.setProperty("--reader-font-size", `${p.fontSize}px`);
  document.documentElement.style.setProperty("--reader-line-height", String(p.lineHeight));
  document.documentElement.style.setProperty("--reader-max-width", p.maxWidth);
  document.documentElement.style.setProperty("--reader-text-align", p.align);

  // Sync Settings Drawer Controls
  document.getElementById("mode-scroll").classList.toggle("active", p.mode === "scroll");
  document.getElementById("mode-paginated").classList.toggle("active", p.mode === "paginated");

  document.querySelectorAll(".theme-swatch").forEach((el) => {
    el.classList.toggle("active", el.dataset.themeVal === p.theme);
  });

  document.querySelectorAll(".font-option").forEach((el) => {
    el.classList.toggle("active", el.dataset.font === p.font);
  });

  document.getElementById("font-size-slider").value = p.fontSize;
  document.getElementById("font-size-display").textContent = `${p.fontSize}px`;
  document.getElementById("line-height-display").textContent = String(p.lineHeight);

  document.querySelectorAll(".line-height-btn").forEach((el) => {
    el.classList.toggle("active", parseFloat(el.dataset.lh) === Number(p.lineHeight));
  });

  const widthNames = { "600px": "Narrow", "740px": "Medium", "900px": "Wide", "1080px": "Full" };
  document.getElementById("page-width-display").textContent = widthNames[p.maxWidth] || "Medium";
  document.querySelectorAll(".width-btn").forEach((el) => {
    el.classList.toggle("active", el.dataset.width === p.maxWidth);
  });

  document.querySelectorAll(".align-btn").forEach((el) => {
    el.classList.toggle("active", el.dataset.align === p.align);
  });

  if (App.view === "reader") {
    applyReadingModeLayout(false);
  }
}

/* ============================================================================
   9B. READ-ALOUD (TEXT-TO-SPEECH / AUDIOBOOK) ENGINE
   ============================================================================ */
function initTtsVoices() {
  if (!("speechSynthesis" in window)) return;

  const rateSelect = document.getElementById("tts-rate-select");
  if (rateSelect && App.prefs.ttsRate) {
    rateSelect.value = String(App.prefs.ttsRate);
  }

  const populateVoices = () => {
    const rawVoices = window.speechSynthesis.getVoices() || [];
    if (!rawVoices.length) return;

    // Prioritize English voices, especially UK English (en-GB) & Natural/Online neural voices
    const englishVoices = rawVoices.filter((v) => /^en(-|_|$)/i.test(v.lang));
    const pool = englishVoices.length ? englishVoices : rawVoices;

    const scoreVoice = (v) => {
      let score = 0;
      const name = (v.name || "").toLowerCase();
      const lang = (v.lang || "").toLowerCase();
      if (lang.includes("gb") || lang.includes("uk")) score += 40;
      else if (lang.startsWith("en")) score += 20;
      if (name.includes("natural") || name.includes("online")) score += 50;
      if (name.includes("ryan") || name.includes("sonia") || name.includes("libby") || name.includes("daniel") || name.includes("arthur")) score += 15;
      if (name.includes("enhanced") || name.includes("premium") || name.includes("google")) score += 10;
      return score;
    };

    App.tts.voices = [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a));

    const selectEl = document.getElementById("tts-voice-select");
    if (!selectEl) return;
    selectEl.innerHTML = "";

    App.tts.voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      const cleanName = v.name.replace(/Microsoft |Online \(Natural\) - /g, "");
      opt.textContent = `${cleanName} (${v.lang})`;
      selectEl.appendChild(opt);
    });

    // Restore saved voice or default to top-scored UK/Natural voice
    const savedURI = App.prefs.ttsVoiceURI;
    const matched = App.tts.voices.find((v) => v.voiceURI === savedURI) || App.tts.voices[0];
    if (matched) {
      selectEl.value = matched.voiceURI;
      App.prefs.ttsVoiceURI = matched.voiceURI;
    }
  };

  populateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
}

function toggleTtsPlayer() {
  if (!("speechSynthesis" in window)) {
    showToast("Speech synthesis is not supported in this browser");
    return;
  }
  if (App.tts.panelOpen) {
    stopAndCloseTts();
  } else {
    openTtsPlayerAndStart();
  }
}

function openTtsPlayerAndStart() {
  App.tts.panelOpen = true;
  document.body.classList.add("tts-active");
  document.getElementById("tts-player-bar").classList.remove("hidden");
  document.getElementById("btn-tts-toggle").classList.add("tts-running");

  const startIdx = findFirstVisibleParagraphIndex();
  startTtsFromParagraph(startIdx, startIdx === 0);
}

function findFirstVisibleParagraphIndex() {
  if (App.prefs.mode === "paginated") {
    const paperEl = document.getElementById("reader-paper");
    const gap = 80;
    const innerWidth = paperEl.clientWidth - 80;
    const pageStride = innerWidth + gap;
    const targetLeft = App.pageIndex * pageStride;
    const nodes = document.querySelectorAll("#chapter-content [data-para-idx]");
    for (const node of nodes) {
      if (node.offsetLeft >= targetLeft - 20) {
        return parseInt(node.dataset.paraIdx, 10) || 0;
      }
    }
    return 0;
  }

  const nodes = document.querySelectorAll("#chapter-content [data-para-idx]");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom > 90 && rect.top < window.innerHeight * 0.75) {
      return parseInt(node.dataset.paraIdx, 10) || 0;
    }
  }
  return 0;
}

function startTtsFromParagraph(paraIdx, announceChapterTitle = false) {
  const chapter = getChapter(App.activeBookId, App.activeChapterNum);
  if (!chapter || !chapter.paragraphs.length) return;

  stopTtsSpeechOnly();

  const safeIdx = Math.max(0, Math.min(chapter.paragraphs.length - 1, paraIdx));
  App.tts.paraIndex = safeIdx;
  App.tts.playing = true;
  App.tts.paused = false;
  const token = ++App.tts.sessionToken;

  updateTtsPlayerUI();
  speakCurrentParagraph(token, announceChapterTitle);
}

function speakCurrentParagraph(token, includeChapterHeader = false) {
  if (token !== App.tts.sessionToken || !App.tts.playing) return;

  const chapter = getChapter(App.activeBookId, App.activeChapterNum);
  if (!chapter) return;

  // Skip scene break HRs automatically
  while (
    App.tts.paraIndex < chapter.paragraphs.length &&
    chapter.paragraphs[App.tts.paraIndex].startsWith("<hr")
  ) {
    App.tts.paraIndex++;
  }

  if (App.tts.paraIndex >= chapter.paragraphs.length) {
    // Reached end of chapter! Mark completed & auto-advance to next chapter
    markChapterCompleted(App.activeBookId, App.activeChapterNum, true);
    const book = getBook(App.activeBookId);
    const hasNextInBook = !!getChapter(App.activeBookId, App.activeChapterNum + 1);
    const hasBook2 = App.activeBookId === "book-1" && getBook("book-2")?.chapters.length > 0;

    if (hasNextInBook || hasBook2) {
      showToast("Chapter finished — continuing Read Aloud to next chapter");
      navigateAdjacentChapter(1);
    } else {
      stopTtsSpeechOnly();
      updateTtsPlayerUI("FINISHED", "Reached the end of the book");
    }
    return;
  }

  const idx = App.tts.paraIndex;
  const rawPara = chapter.paragraphs[idx] || "";
  const plainPara = stripHtml(rawPara).trim();
  if (!plainPara) {
    App.tts.paraIndex++;
    speakCurrentParagraph(token, false);
    return;
  }

  const spokenText = includeChapterHeader
    ? `Chapter ${chapter.num}: ${chapter.title}. ${plainPara}`
    : plainPara;

  highlightAndScrollToTtsParagraph(idx);
  updateTtsPlayerUI("SPEAKING", `Paragraph ${idx + 1} of ${chapter.paragraphs.length}`, plainPara);

  const utterance = new SpeechSynthesisUtterance(spokenText);
  App.tts.currentUtterance = utterance; // Prevent garbage collection bug in Chrome/Safari

  const chosenVoice = App.tts.voices.find((v) => v.voiceURI === App.prefs.ttsVoiceURI);
  if (chosenVoice) {
    utterance.voice = chosenVoice;
    utterance.lang = chosenVoice.lang;
  }
  utterance.rate = Number(App.prefs.ttsRate) || 1.0;

  utterance.onend = () => {
    if (token !== App.tts.sessionToken || !App.tts.playing) return;
    App.tts.paraIndex++;
    speakCurrentParagraph(token, false);
  };

  utterance.onerror = (ev) => {
    if (ev.error === "canceled" || ev.error === "interrupted") return;
    if (token !== App.tts.sessionToken || !App.tts.playing) return;
    App.tts.paraIndex++;
    speakCurrentParagraph(token, false);
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function highlightAndScrollToTtsParagraph(paraIdx) {
  document.querySelectorAll("#chapter-content .tts-speaking-para").forEach((el) => {
    el.classList.remove("tts-speaking-para");
  });

  const targetEl = document.querySelector(`#chapter-content [data-para-idx="${paraIdx}"]`);
  if (!targetEl) return;

  targetEl.classList.add("tts-speaking-para");

  if (App.prefs.mode === "paginated") {
    const paperEl = document.getElementById("reader-paper");
    const gap = 80;
    const innerWidth = paperEl.clientWidth - 80;
    const pageStride = innerWidth + gap;
    const targetPage = Math.min(
      App.totalPages - 1,
      Math.max(0, Math.floor(targetEl.offsetLeft / pageStride))
    );
    if (targetPage !== App.pageIndex) {
      App.pageIndex = targetPage;
      recalculatePagination();
    }
  } else {
    const rect = targetEl.getBoundingClientRect();
    if (rect.top < 100 || rect.bottom > window.innerHeight - 130) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function toggleTtsPlayPause() {
  if (!("speechSynthesis" in window)) return;

  if (!App.tts.playing) {
    startTtsFromParagraph(App.tts.paraIndex || findFirstVisibleParagraphIndex(), false);
    return;
  }

  if (App.tts.paused) {
    App.tts.paused = false;
    window.speechSynthesis.resume();
    // Fallback if browser cleared queue while paused
    if (!window.speechSynthesis.speaking) {
      startTtsFromParagraph(App.tts.paraIndex, false);
      return;
    }
    updateTtsPlayerUI("SPEAKING");
  } else {
    App.tts.paused = true;
    window.speechSynthesis.pause();
    updateTtsPlayerUI("PAUSED");
  }
}

function stepTtsParagraph(delta) {
  const chapter = getChapter(App.activeBookId, App.activeChapterNum);
  if (!chapter) return;
  let nextIdx = (App.tts.paraIndex || 0) + delta;

  // Skip scene breaks in that direction
  while (
    nextIdx >= 0 &&
    nextIdx < chapter.paragraphs.length &&
    chapter.paragraphs[nextIdx].startsWith("<hr")
  ) {
    nextIdx += delta >= 0 ? 1 : -1;
  }

  if (nextIdx < 0) nextIdx = 0;
  if (nextIdx >= chapter.paragraphs.length) nextIdx = chapter.paragraphs.length - 1;
  startTtsFromParagraph(nextIdx, false);
}

function stopTtsSpeechOnly() {
  App.tts.sessionToken++;
  App.tts.playing = false;
  App.tts.paused = false;
  App.tts.currentUtterance = null;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  document.querySelectorAll("#chapter-content .tts-speaking-para").forEach((el) => {
    el.classList.remove("tts-speaking-para");
  });
}

function stopAndCloseTts() {
  stopTtsSpeechOnly();
  App.tts.panelOpen = false;
  document.body.classList.remove("tts-active");
  document.getElementById("tts-player-bar")?.classList.add("hidden");
  document.getElementById("btn-tts-toggle")?.classList.remove("tts-running");
}

function updateTtsPlayerUI(stateLabel, counterText, previewText) {
  const isPlayingActive = App.tts.playing && !App.tts.paused;
  document.getElementById("tts-icon-play").classList.toggle("hidden", isPlayingActive);
  document.getElementById("tts-icon-pause").classList.toggle("hidden", !isPlayingActive);

  if (stateLabel) {
    document.getElementById("tts-badge-state").textContent = stateLabel;
  } else {
    document.getElementById("tts-badge-state").textContent = isPlayingActive
      ? "SPEAKING"
      : App.tts.paused
      ? "PAUSED"
      : "READY";
  }

  if (counterText) {
    document.getElementById("tts-para-counter").textContent = counterText;
  }
  if (previewText) {
    document.getElementById("tts-spoken-preview").textContent = `“${previewText}”`;
  }
}

/* ============================================================================
   10. EVENT LISTENERS & KEYBOARD SHORTCUTS
   ============================================================================ */
function bindEvents() {
  // Navigation Header
  document.getElementById("btn-home").addEventListener("click", showLibraryView);
  document.getElementById("brand-logo").addEventListener("click", showLibraryView);

  // Book Switcher Pills in Reader Header
  document.querySelectorAll(".book-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetBookId = pill.dataset.bookId;
      if (targetBookId === App.activeBookId) return;
      const targetChap = getBookResumeChapter(targetBookId);
      openReader(targetBookId, targetChap);
    });
  });

  // Continue Reading Hero Button
  document.getElementById("btn-resume-reading").addEventListener("click", () => {
    const bookId = App.progress.lastBookId || "book-1";
    const chapNum = App.progress.lastChapterNum || 1;
    openReader(bookId, chapNum);
  });

  // Drawers Triggers
  document.getElementById("btn-toc").addEventListener("click", openTocDrawer);
  document.getElementById("btn-close-toc").addEventListener("click", closeAllDrawers);

  document.getElementById("btn-settings").addEventListener("click", () => {
    closeAllDrawers();
    document.getElementById("drawer-backdrop").classList.remove("hidden");
    document.getElementById("settings-drawer").classList.remove("hidden");
  });
  document.getElementById("btn-close-settings").addEventListener("click", closeAllDrawers);

  document.getElementById("btn-bookmarks").addEventListener("click", () => {
    closeAllDrawers();
    renderBookmarksList();
    document.getElementById("drawer-backdrop").classList.remove("hidden");
    document.getElementById("bookmarks-drawer").classList.remove("hidden");
  });
  document.getElementById("btn-close-bookmarks").addEventListener("click", closeAllDrawers);

  document.getElementById("drawer-backdrop").addEventListener("click", closeAllDrawers);

  // Bookmark Actions
  document.getElementById("btn-add-bookmark").addEventListener("click", toggleBookmarkCurrentPosition);
  document.getElementById("btn-save-bookmark-drawer").addEventListener("click", toggleBookmarkCurrentPosition);

  // Read-Aloud (TTS) Controls
  document.getElementById("btn-tts-toggle").addEventListener("click", toggleTtsPlayer);
  document.getElementById("btn-tts-play").addEventListener("click", toggleTtsPlayPause);
  document.getElementById("btn-tts-prev").addEventListener("click", () => stepTtsParagraph(-1));
  document.getElementById("btn-tts-next").addEventListener("click", () => stepTtsParagraph(1));
  document.getElementById("btn-tts-close").addEventListener("click", stopAndCloseTts);

  document.getElementById("tts-rate-select").addEventListener("change", (e) => {
    App.prefs.ttsRate = parseFloat(e.target.value) || 1.0;
    savePreferences();
    if (App.tts.playing && !App.tts.paused) {
      startTtsFromParagraph(App.tts.paraIndex, false);
    }
  });

  document.getElementById("tts-voice-select").addEventListener("change", (e) => {
    App.prefs.ttsVoiceURI = e.target.value;
    savePreferences();
    if (App.tts.playing && !App.tts.paused) {
      startTtsFromParagraph(App.tts.paraIndex, false);
    }
  });

  // Click any paragraph in the chapter while Read Aloud bar is open to jump narrator there
  document.getElementById("chapter-content").addEventListener("click", (e) => {
    if (!App.tts.panelOpen) return;
    const paraEl = e.target.closest("[data-para-idx]");
    if (!paraEl) return;
    const idx = parseInt(paraEl.dataset.paraIdx, 10);
    if (!isNaN(idx)) {
      startTtsFromParagraph(idx, false);
    }
  });

  window.addEventListener("beforeunload", () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  });

  // TOC Tabs & Filter
  document.querySelectorAll(".toc-book-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetBookId = tab.dataset.bookId;
      if (isBookLocked(targetBookId)) {
        closeAllDrawers();
        promptUnlockBook2(() => {
          App.tocBookId = targetBookId;
          renderLibrary();
          openTocDrawer();
        });
        return;
      }
      App.tocBookId = targetBookId;
      renderTocList();
    });
  });
  document.getElementById("toc-search-input").addEventListener("input", renderTocList);

  // Chapter Completion & Prev/Next
  const toggleCurrentComplete = () => {
    const key = `${App.activeBookId}:${App.activeChapterNum}`;
    const nextVal = !App.progress.chapters[key]?.completed;
    markChapterCompleted(App.activeBookId, App.activeChapterNum, nextVal);
    showToast(nextVal ? "Marked chapter as completed" : "Chapter marked as unread");
  };
  document.getElementById("btn-toggle-complete").addEventListener("click", toggleCurrentComplete);
  document.getElementById("btn-footer-complete").addEventListener("click", toggleCurrentComplete);

  document.getElementById("btn-prev-chapter").addEventListener("click", () => navigateAdjacentChapter(-1));
  document.getElementById("btn-next-chapter").addEventListener("click", () => {
    markChapterCompleted(App.activeBookId, App.activeChapterNum, true);
    navigateAdjacentChapter(1);
  });

  // Paginated Mode Click Zones & Buttons
  document.getElementById("page-prev-zone").addEventListener("click", () => flipPage(-1));
  document.getElementById("page-next-zone").addEventListener("click", () => flipPage(1));
  document.getElementById("btn-page-prev").addEventListener("click", () => flipPage(-1));
  document.getElementById("btn-page-next").addEventListener("click", () => flipPage(1));

  // Touch Swipe Support for Paginated Mode
  let touchStartX = null;
  let touchStartY = null;
  document.getElementById("reader-view").addEventListener("touchstart", (e) => {
    if (App.prefs.mode !== "paginated" || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.getElementById("reader-view").addEventListener("touchend", (e) => {
    if (App.prefs.mode !== "paginated" || touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      flipPage(dx < 0 ? 1 : -1);
    }
    touchStartX = null;
  }, { passive: true });

  // Settings Controls
  document.getElementById("mode-scroll").addEventListener("click", () => {
    App.prefs.mode = "scroll";
    savePreferences();
    applyPreferences();
  });
  document.getElementById("mode-paginated").addEventListener("click", () => {
    App.prefs.mode = "paginated";
    savePreferences();
    applyPreferences();
  });

  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.prefs.theme = btn.dataset.themeVal;
      savePreferences();
      applyPreferences();
    });
  });

  document.querySelectorAll(".font-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.prefs.font = btn.dataset.font;
      savePreferences();
      applyPreferences();
    });
  });

  document.getElementById("font-size-slider").addEventListener("input", (e) => {
    App.prefs.fontSize = parseInt(e.target.value, 10);
    savePreferences();
    applyPreferences();
  });
  document.getElementById("btn-font-smaller").addEventListener("click", () => {
    App.prefs.fontSize = Math.max(15, App.prefs.fontSize - 1);
    savePreferences();
    applyPreferences();
  });
  document.getElementById("btn-font-larger").addEventListener("click", () => {
    App.prefs.fontSize = Math.min(28, App.prefs.fontSize + 1);
    savePreferences();
    applyPreferences();
  });

  document.querySelectorAll(".line-height-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.prefs.lineHeight = parseFloat(btn.dataset.lh);
      savePreferences();
      applyPreferences();
    });
  });

  document.querySelectorAll(".width-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.prefs.maxWidth = btn.dataset.width;
      savePreferences();
      applyPreferences();
    });
  });

  document.querySelectorAll(".align-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.prefs.align = btn.dataset.align;
      savePreferences();
      applyPreferences();
    });
  });

  // Search Modal
  document.getElementById("btn-search").addEventListener("click", openSearchModal);
  document.getElementById("btn-close-search").addEventListener("click", closeSearchModal);
  document.getElementById("search-modal").addEventListener("click", (e) => {
    if (e.target.id === "search-modal") closeSearchModal();
  });

  let searchTimer = null;
  document.getElementById("global-search-input").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(executeFullTextSearch, 140);
  });

  document.querySelectorAll(".scope-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      if (pill.dataset.scope === "book-2" && isBookLocked("book-2")) {
        closeSearchModal();
        promptUnlockBook2(() => {
          App.searchScope = "book-2";
          document.querySelectorAll(".scope-pill").forEach((p) =>
            p.classList.toggle("active", p.dataset.scope === App.searchScope)
          );
          renderLibrary();
          openSearchModal();
          executeFullTextSearch();
        });
        return;
      }
      App.searchScope = pill.dataset.scope;
      document.querySelectorAll(".scope-pill").forEach((p) =>
        p.classList.toggle("active", p.dataset.scope === App.searchScope)
      );
      executeFullTextSearch();
    });
  });

  // Book 2 Passcode Modal Events
  document.getElementById("btn-close-passcode").addEventListener("click", closePasscodeModal);
  document.getElementById("btn-cancel-passcode").addEventListener("click", closePasscodeModal);
  document.getElementById("passcode-modal").addEventListener("click", (e) => {
    if (e.target.id === "passcode-modal") closePasscodeModal();
  });

  document.getElementById("passcode-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("input-book2-passcode");
    const errEl = document.getElementById("passcode-error-msg");
    const enteredHash = hashPasscode(input.value);

    if (enteredHash === BOOK2_PASSCODE_HASH) {
      App.book2Unlocked = true;
      try {
        localStorage.setItem(STORAGE_KEYS.BOOK2_UNLOCKED, BOOK2_PASSCODE_HASH);
      } catch (err) {}
      const cb = App.pendingUnlockCallback;
      closePasscodeModal();
      showToast("Book 2 unlocked!");
      if (typeof cb === "function") {
        cb();
      } else {
        renderLibrary();
      }
    } else {
      errEl.classList.remove("hidden");
      input.select();
    }
  });

  // Edit Titles Modal
  document.getElementById("btn-edit-titles").addEventListener("click", openEditTitlesModal);
  document.getElementById("btn-close-titles-modal").addEventListener("click", () => {
    document.getElementById("edit-titles-modal").classList.add("hidden");
  });
  document.getElementById("btn-save-titles").addEventListener("click", saveCustomTitlesFromModal);
  document.getElementById("btn-reset-titles").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.TITLES);
    App.customTitles = null;
    applyCustomTitles();
    renderLibrary();
    document.getElementById("edit-titles-modal").classList.add("hidden");
    showToast("Restored default titles");
  });

  // Local .docx Upload / Preview Input
  document.getElementById("docx-file-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast(`Reading ${file.name}...`);
      const buf = await file.arrayBuffer();
      const parsed = await parseDocxArrayBuffer(buf);
      if (!parsed.chapters.length) throw new Error("No chapters detected in .docx");

      const isBook1 = /book\s*1/i.test(file.name);
      const targetBook = getBook(isBook1 ? "book-1" : "book-2");
      targetBook.chapters = parsed.chapters;
      targetBook.chapterCount = parsed.chapters.length;
      targetBook.wordCount = parsed.wordCount;
      renderLibrary();
      showToast(`Updated ${targetBook.title} (${parsed.chapters.length} chapters loaded!)`);
    } catch (err) {
      showToast(`Error loading .docx: ${err.message}`);
    }
    e.target.value = "";
  });

  // Export / Import Progress JSON
  document.getElementById("btn-export-data").addEventListener("click", () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      progress: App.progress,
      bookmarks: App.bookmarks,
      prefs: App.prefs,
      customTitles: App.customTitles
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hp-chronicles-reading-progress.json";
    a.click();
    showToast("Exported reading progress & bookmarks");
  });

  document.getElementById("import-progress-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.progress) {
        App.progress = data.progress;
        saveProgress();
      }
      if (data.bookmarks) {
        App.bookmarks = data.bookmarks;
        saveBookmarks();
      }
      if (data.prefs) {
        Object.assign(App.prefs, data.prefs);
        savePreferences();
        applyPreferences();
      }
      renderLibrary();
      showToast("Restored reading progress & bookmarks!");
    } catch (err) {
      showToast("Invalid progress backup file");
    }
    e.target.value = "";
  });

  // Window Scroll & Resize
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", () => {
    if (App.view === "reader" && App.prefs.mode === "paginated") {
      recalculatePagination();
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    const isInput = tag === "input" || tag === "textarea";

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearchModal();
      return;
    }

    if (e.key === "Escape") {
      closeSearchModal();
      closePasscodeModal();
      closeAllDrawers();
      document.getElementById("edit-titles-modal").classList.add("hidden");
      return;
    }

    if (isInput) return;

    if (e.key === "/") {
      e.preventDefault();
      openSearchModal();
    } else if (App.view === "reader") {
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        openTocDrawer();
      } else if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleBookmarkCurrentPosition();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        toggleTtsPlayer();
      } else if (App.prefs.mode === "paginated") {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          flipPage(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          flipPage(-1);
        }
      } else if (App.prefs.mode === "scroll") {
        if (e.altKey && e.key === "ArrowRight") {
          e.preventDefault();
          navigateAdjacentChapter(1);
        } else if (e.altKey && e.key === "ArrowLeft") {
          e.preventDefault();
          navigateAdjacentChapter(-1);
        }
      }
    }
  });
}

function openEditTitlesModal() {
  const b1 = getBook("book-1");
  const b2 = getBook("book-2");
  document.getElementById("input-series-title").value = App.data.seriesTitle || "";
  document.getElementById("input-series-subtitle").value = App.data.seriesSubtitle || "";
  document.getElementById("input-book1-title").value = b1?.title || "";
  document.getElementById("input-book1-subtitle").value = b1?.subtitle || "";
  document.getElementById("input-book2-title").value = b2?.title || "";
  document.getElementById("input-book2-subtitle").value = b2?.subtitle || "";
  document.getElementById("edit-titles-modal").classList.remove("hidden");
}

function saveCustomTitlesFromModal() {
  App.customTitles = {
    seriesTitle: document.getElementById("input-series-title").value.trim() || DEFAULT_TITLES.seriesTitle,
    seriesSubtitle: document.getElementById("input-series-subtitle").value.trim() || DEFAULT_TITLES.seriesSubtitle,
    "book-1": {
      title: document.getElementById("input-book1-title").value.trim() || DEFAULT_TITLES["book-1"].title,
      subtitle: document.getElementById("input-book1-subtitle").value.trim() || DEFAULT_TITLES["book-1"].subtitle
    },
    "book-2": {
      title: document.getElementById("input-book2-title").value.trim() || DEFAULT_TITLES["book-2"].title,
      subtitle: document.getElementById("input-book2-subtitle").value.trim() || DEFAULT_TITLES["book-2"].subtitle
    }
  };
  localStorage.setItem(STORAGE_KEYS.TITLES, JSON.stringify(App.customTitles));
  applyCustomTitles();
  renderLibrary();
  document.getElementById("edit-titles-modal").classList.add("hidden");
  showToast("Updated series & book titles");
}

function closeAllDrawers() {
  document.getElementById("drawer-backdrop").classList.add("hidden");
  document.getElementById("toc-drawer").classList.add("hidden");
  document.getElementById("settings-drawer").classList.add("hidden");
  document.getElementById("bookmarks-drawer").classList.add("hidden");
}

function handleHashNavigation() {
  const hash = window.location.hash || "";
  const match = hash.match(/^#(book-[12])\/chapter-(\d+)$/i);
  if (match) {
    const bookId = match[1].toLowerCase();
    const chapNum = parseInt(match[2], 10);
    if (App.view !== "reader" || App.activeBookId !== bookId || App.activeChapterNum !== chapNum) {
      openReader(bookId, chapNum);
    }
  }
}

/* ============================================================================
   11. HELPER UTILITIES
   ============================================================================ */
function getBook(bookId) {
  return (App.data.books || []).find((b) => b.id === bookId);
}

function getChapter(bookId, chapterNum) {
  const book = getBook(bookId);
  if (!book) return null;
  return book.chapters.find((c) => c.num === Number(chapterNum));
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function highlightTextInHtml(html, term) {
  if (!term) return html;
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedTerm})(?![^<]*>)`, "gi");
  return html.replace(regex, '<mark class="inline-search-mark">$1</mark>');
}

function formatRelativeTime(isoString) {
  if (!isoString) return "Recently";
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

let toastTimer = null;
function showToast(message) {
  const el = document.getElementById("toast-notification");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("hidden");
  }, 2600);
}

