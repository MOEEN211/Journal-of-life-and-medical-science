// Journal of Life and Medical Science - Main Application Controller
import {
  supabase,
  getJournalSettings,
  getEditorialMembers,
  getJournalPolicies,
  getJournalIndexing,
  getCurrentIssue,
  getIssueArticles,
  getAllIssues,
  getArticleDetails,
  recordMetric,
  submitManuscript,
  uploadManuscriptFile,
  getAuthorSubmissions,
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  EMAILJS_CONFIG
} from './supabase.js';

// Application State
const state = {
  settings: null,
  currentIssue: null,
  articles: [],
  filteredArticles: [],
  allIssues: [],
  editorialMembers: [],
  policies: [],
  indexingAgencies: [],
  currentArticle: null,
  activeFilter: 'all',
  searchQuery: '',
  currentUser: null,
  currentCitationStyle: 'apa'
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupEventListeners();
  setupAuthListener();
  
  // Initialize EmailJS if loaded
  if (window.emailjs && EMAILJS_CONFIG.publicKey) {
    try {
      window.emailjs.init(EMAILJS_CONFIG.publicKey);
    } catch (e) {
      console.warn('EmailJS init warning:', e);
    }
  }

  // Parallel loading of all dynamic database entities
  await Promise.allSettled([
    checkAuthSession(),
    loadDynamicSettings(),
    loadDynamicIndexing(),
    loadCurrentIssueAndArticles()
  ]);
});

// ==========================================================================
// REAL-TIME AUTH STATE LISTENER (INSTANT UI SWITCH ON SIGNUP / LOGIN / LOGOUT)
// ==========================================================================
function setupAuthListener() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    state.currentUser = session?.user || null;
    renderAuthUI(state.currentUser);

    if (event === 'SIGNED_IN') {
      showToast(`Welcome, ${session.user.user_metadata?.full_name || session.user.email}!`, 'success');
    } else if (event === 'SIGNED_OUT') {
      showToast('You have been signed out.', 'info');
    }
  });
}

async function checkAuthSession() {
  const user = await getCurrentUser();
  state.currentUser = user;
  renderAuthUI(user);
}

function renderAuthUI(user) {
  const authContainer = document.getElementById('authStatusContainer');
  if (!authContainer) return;

  if (user) {
    const meta = user.user_metadata || {};
    const fullName = meta.full_name || user.email.split('@')[0];
    const role = meta.role || 'Author';
    
    // Extract initials
    const names = fullName.trim().split(' ');
    const initials = names.length > 1 
      ? (names[0][0] + names[names.length - 1][0]).toUpperCase() 
      : fullName.slice(0, 2).toUpperCase();

    authContainer.innerHTML = `
      <div class="user-logged-box">
        <div class="user-avatar-badge" title="${escapeHtml(fullName)}">
          ${escapeHtml(initials)}
        </div>
        <div class="user-meta-info">
          <span class="user-display-name">${escapeHtml(fullName)}</span>
          <span class="user-role-badge">${escapeHtml(role)}</span>
        </div>
        <button class="btn btn-secondary btn-sm dash-btn" id="userDashboardBtn" title="View Submitted Manuscripts">
          <i class="fa-solid fa-folder-open"></i> <span class="btn-label">Dashboard</span>
        </button>
        <button class="btn btn-logout" id="logoutBtn" title="Sign out of account">
          <i class="fa-solid fa-right-from-bracket"></i><span class="btn-label"> Logout</span>
        </button>
      </div>
    `;

    document.getElementById('userDashboardBtn')?.addEventListener('click', openDashboardModal);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
  } else {
    authContainer.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="openLoginBtn">
        <i class="fa-solid fa-user-lock"></i> Sign In / Register
      </button>
    `;
    document.getElementById('openLoginBtn')?.addEventListener('click', openAuthModal);
  }
}

async function handleLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    logoutBtn.disabled = true;
  }
  await logoutUser();
  state.currentUser = null;
  renderAuthUI(null);
}

// ==========================================================================
// DYNAMIC SETTINGS & BRANDING (FROM SUPABASE journal_settings)
// ==========================================================================
async function loadDynamicSettings() {
  try {
    const settings = await getJournalSettings();
    if (!settings) return;
    state.settings = settings;

    // Header branding
    const journalName = settings.journal_name || 'Journal of Life and Medical Science';
    const formattedTitle = journalName.replace(/(Life & Medical|Life and Medical|Medical & Health)/i, '<span>$1</span>');
    document.getElementById('headerJournalTitle').innerHTML = formattedTitle;
    document.getElementById('footerJournalTitle').innerHTML = formattedTitle;
    document.getElementById('pageTitle').textContent = `${journalName} | International Open Access Journal`;
    if (settings.journal_tagline) {
      document.getElementById('headerJournalTagline').textContent = settings.journal_tagline;
    }
    if (settings.issn_online) {
      document.getElementById('headerIssnOnline').textContent = settings.issn_online;
      document.getElementById('footerIssnOnline').textContent = settings.issn_online;
    }
    if (settings.issn_print) {
      document.getElementById('headerIssnPrint').textContent = settings.issn_print;
      document.getElementById('footerIssnPrint').textContent = settings.issn_print;
    }
    if (settings.publisher_short || settings.publisher) {
      document.getElementById('headerPublisher').textContent = settings.publisher_short || settings.publisher;
      document.getElementById('footerPublisher').textContent = settings.publisher;
    }

    // Hero Section
    if (settings.hero_title_prefix && settings.hero_title_highlight) {
      document.getElementById('heroTitlePrefix').textContent = settings.hero_title_prefix;
      document.getElementById('heroTitleHighlight').textContent = settings.hero_title_highlight;
    }
    if (settings.hero_description) {
      document.getElementById('heroDescription').textContent = settings.hero_description;
    }

    // Performance Metrics
    if (settings.metrics) {
      if (settings.metrics.impact_factor) document.getElementById('statImpactFactor').textContent = settings.metrics.impact_factor;
      if (settings.metrics.first_decision_days) document.getElementById('statDecisionDays').textContent = settings.metrics.first_decision_days;
      if (settings.metrics.acceptance_rate) document.getElementById('statAcceptanceRate').textContent = settings.metrics.acceptance_rate;
      if (settings.metrics.citescore) document.getElementById('statCiteScore').textContent = settings.metrics.citescore;
    }

    // Footer info
    if (settings.office_address) document.getElementById('footerOfficeAddress').textContent = settings.office_address;
    if (settings.contact_email) document.getElementById('footerContactEmail').textContent = settings.contact_email;

  } catch (err) {
    console.warn('Dynamic settings error:', err);
  }
}

// ==========================================================================
// DYNAMIC INDEXING & DATABASES (FROM SUPABASE journal_indexing)
// ==========================================================================
async function loadDynamicIndexing() {
  const container = document.getElementById('sidebarIndexingList');
  if (!container) return;

  try {
    const list = await getJournalIndexing();
    state.indexingAgencies = list;

    if (list.length > 0) {
      container.innerHTML = list.map(item => `
        <div class="indexing-item">
          <span><i class="fa-solid fa-check" style="color:${item.badge_color || '#16a34a'}; margin-right:6px;"></i> ${escapeHtml(item.name)}</span>
          <span class="status" style="background:${item.badge_color ? item.badge_color + '22' : 'rgba(34,197,94,0.12)'}; color:${item.badge_color || '#16a34a'};">${escapeHtml(item.status)}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.warn('Indexing error:', err);
  }
}

// ==========================================================================
// DYNAMIC CURRENT ISSUE & ARTICLES (FROM SUPABASE issues & articles)
// ==========================================================================
async function loadCurrentIssueAndArticles() {
  const container = document.getElementById('articlesListContainer');
  
  try {
    const issue = await getCurrentIssue();
    state.currentIssue = issue;

    if (issue) {
      document.getElementById('currentIssueTitle').textContent = issue.title;
      const pubDate = new Date(issue.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      document.getElementById('currentIssueDate').innerHTML = `
        <i class="fa-regular fa-clock"></i> Published ${pubDate} • Vol. ${issue.volume} No. ${issue.number} (${issue.year})
      `;

      // Fetch articles
      const articles = await getIssueArticles(issue.id);
      state.articles = articles;
      state.filteredArticles = articles;
      
      // Update counts for all section tabs dynamically
      const countAll = document.getElementById('countAll');
      if (countAll) countAll.textContent = articles.length;
      const countOrig = document.getElementById('countOriginal');
      if (countOrig) countOrig.textContent = articles.filter(a => (a.sections?.title || '').toLowerCase().includes('original')).length;
      const countRev = document.getElementById('countReviews');
      if (countRev) countRev.textContent = articles.filter(a => (a.sections?.title || '').toLowerCase().includes('review')).length;
      const countClin = document.getElementById('countClinical');
      if (countClin) countClin.textContent = articles.filter(a => (a.sections?.title || '').toLowerCase().includes('clinical')).length;
      const countPersp = document.getElementById('countPerspectives');
      if (countPersp) countPersp.textContent = articles.filter(a => (a.sections?.title || '').toLowerCase().includes('perspective')).length;

      renderArticles(articles);
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <p>No published articles found for current issue.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to load issue data:', err);
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:#ef4444;">
        <i class="fa-solid fa-triangle-exclamation fa-2x" style="margin-bottom:12px;"></i>
        <p>Error connecting to database. Please check Supabase project status.</p>
      </div>
    `;
  }
}

// ==========================================================================
// ARTICLE CARD RENDERING
// ==========================================================================
function renderArticles(articlesList) {
  const container = document.getElementById('articlesListContainer');
  if (!container) return;

  if (articlesList.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; background:var(--bg-surface); border-radius:var(--radius-lg); border:1px solid var(--border-light);">
        <i class="fa-solid fa-magnifying-glass fa-2x" style="color:var(--gold-500); margin-bottom:12px;"></i>
        <h4 style="font-family:var(--font-serif); font-size:1.2rem; margin-bottom:6px;">No Publications Found</h4>
        <p style="color:var(--text-muted); font-size:0.9rem;">Try adjusting your keyword search query or selecting a different section filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = articlesList.map(art => {
    const authors = art.article_authors || [];
    const authorStringFull = authors.map(a => a.name).join(', ') || 'Editorial Staff';
    // Truncate long author lists so they don't overflow on mobile
    const authorString = authorStringFull.length > 80 
      ? authorStringFull.slice(0, 77) + '...' 
      : authorStringFull;
    const sectionName = art.sections?.title || 'Articles';
    const pageRange = art.first_page && art.last_page ? `pp. ${art.first_page}-${art.last_page}` : 'Early Access';
    const keywords = Array.isArray(art.keywords) ? art.keywords : [];
    // Mark as newly published if created within 14 days or published recently
    const isRecent = art.created_at && (Date.now() - new Date(art.created_at).getTime() < 14 * 24 * 60 * 60 * 1000);

    return `
      <article class="article-card" data-id="${art.id}">
        <div class="article-card-header">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="section-badge">${escapeHtml(sectionName)}</span>
            ${isRecent ? `<span style="background:rgba(34,197,94,0.15); color:var(--green-500); border:1px solid rgba(34,197,94,0.35); font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-sparkles"></i> Published</span>` : ''}
          </div>
          <span class="article-pages">${pageRange}</span>
        </div>

        <h3 class="article-title" data-action="open-article" data-id="${art.id}">
          ${escapeHtml(art.title)}
        </h3>

        <div class="article-authors">
          <i class="fa-solid fa-user-pen" style="color:var(--gold-500); font-size:0.85rem; margin-right:4px;"></i>
          ${escapeHtml(authorString)}
        </div>

        <p class="article-abstract-preview">
          ${escapeHtml(art.abstract)}
        </p>

        <div class="keywords-row">
          ${keywords.map(kw => `<span class="keyword-tag">#${escapeHtml(kw)}</span>`).join('')}
        </div>

        <div class="article-card-footer">
          <div class="article-actions">
            <button class="btn btn-outline btn-sm" data-action="open-article" data-id="${art.id}">
              <i class="fa-regular fa-file-lines"></i> View Abstract
            </button>
            <a href="${art.pdf_url || '#'}" target="_blank" class="btn btn-pdf btn-sm" data-action="download-pdf" data-id="${art.id}">
              <i class="fa-solid fa-file-pdf"></i> Download PDF
            </a>
            <button class="btn btn-outline btn-sm" data-action="open-citation" data-id="${art.id}">
              <i class="fa-solid fa-quote-left"></i> Cite
            </button>
          </div>

          <div class="article-metrics">
            <span class="metric-item" title="Abstract Views">
              <i class="fa-regular fa-eye"></i> ${art.views_count || 0}
            </span>
            <span class="metric-item" title="PDF Downloads">
              <i class="fa-solid fa-download"></i> ${art.downloads_count || 0}
            </span>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Card interaction events
  container.querySelectorAll('[data-action="open-article"]').forEach(el => {
    el.addEventListener('click', () => openArticleModal(el.dataset.id));
  });

  container.querySelectorAll('[data-action="download-pdf"]').forEach(el => {
    el.addEventListener('click', () => {
      recordMetric(el.dataset.id, 'downloads_count');
      showToast('Downloading official PDF galley...', 'info');
    });
  });

  container.querySelectorAll('[data-action="open-citation"]').forEach(el => {
    el.addEventListener('click', () => openArticleModal(el.dataset.id, true));
  });
}

// ==========================================================================
// ARTICLE MODAL & CITATIONS
// ==========================================================================
async function openArticleModal(articleId, scrollToCitation = false) {
  const modal = document.getElementById('articleReaderModal');
  const article = state.articles.find(a => a.id === articleId) || await getArticleDetails(articleId);
  if (!article) return;

  state.currentArticle = article;
  recordMetric(article.id, 'views_count');

  const issue = state.currentIssue || article.issues;
  document.getElementById('modalIssueBreadcrumb').textContent = 
    issue ? `Vol. ${issue.volume} No. ${issue.number} (${issue.year}) • ${article.sections?.title || 'Articles'}` : 'Current Issue';
  
  document.getElementById('modalArticleTitle').textContent = article.title;
  
  // Format structured authors
  const authorsList = article.article_authors || [];
  const authorsHtml = authorsList.map(a => `
    <div style="display:inline-block; margin-right:20px; margin-bottom:8px;">
      <strong style="color:var(--text-primary); font-size:0.95rem;">${escapeHtml(a.name)}</strong>
      ${a.orcid ? `<a href="https://orcid.org/${a.orcid}" target="_blank" style="color:#a6ce39; margin-left:4px;" title="ORCID iD: ${a.orcid}"><i class="fa-brands fa-orcid"></i></a>` : ''}
      ${a.affiliation ? `<div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(a.affiliation)}</div>` : ''}
    </div>
  `).join('');
  document.getElementById('modalAuthorsBlock').innerHTML = authorsHtml;

  // DOI link
  const doiLink = document.getElementById('modalDoiLink');
  if (article.doi) {
    doiLink.textContent = `https://doi.org/${article.doi}`;
    doiLink.href = `https://doi.org/${article.doi}`;
  } else {
    doiLink.textContent = '10.59823/jlms.v4i7.' + article.id.slice(0, 4);
    doiLink.href = '#';
  }

  document.getElementById('modalViews').innerHTML = `<i class="fa-solid fa-eye"></i> ${article.views_count || 142} Views`;
  document.getElementById('modalDownloads').innerHTML = `<i class="fa-solid fa-download"></i> ${article.downloads_count || 38} Downloads`;

  // Abstract highlighting
  let formattedAbstract = article.abstract
    .replace(/(Background:)/g, '<strong style="color:var(--gold-600);">$1</strong>')
    .replace(/(Objective:)/g, '<strong style="color:var(--gold-600);">$1</strong>')
    .replace(/(Method:)/g, '<strong style="color:var(--gold-600);">$1</strong>')
    .replace(/(Results:)/g, '<strong style="color:var(--gold-600);">$1</strong>')
    .replace(/(Conclusion:)/g, '<strong style="color:var(--gold-600);">$1</strong>');
  document.getElementById('modalAbstractBody').innerHTML = formattedAbstract;

  // Keywords
  const kwContainer = document.getElementById('modalKeywordsList');
  const kw = Array.isArray(article.keywords) ? article.keywords : [];
  kwContainer.innerHTML = kw.map(k => `<span class="keyword-tag" style="padding:6px 12px; font-size:0.82rem;">${escapeHtml(k)}</span>`).join('');

  // PDF
  const pdfBtn = document.getElementById('modalDownloadPdfBtn');
  pdfBtn.href = article.pdf_url || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

  updateCitationBox(state.currentCitationStyle);

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  if (scrollToCitation) {
    setTimeout(() => {
      document.getElementById('citationBoxText').scrollIntoView({ behavior: 'smooth' });
    }, 200);
  }
}

function updateCitationBox(style) {
  const art = state.currentArticle;
  if (!art) return;

  const authors = art.article_authors || [];
  const authorNames = authors.map(a => a.name);
  const firstAuthor = authorNames[0] || 'Author';
  const year = state.currentIssue?.year || 2026;
  const vol = state.currentIssue?.volume || 4;
  const num = state.currentIssue?.number || 7;
  const pages = art.first_page && art.last_page ? `${art.first_page}-${art.last_page}` : '1-14';
  const doi = art.doi || '10.59823/jlms.v4i7.3432';

  let text = '';
  switch (style) {
    case 'apa':
      text = `${authorNames.join(', ')} (${year}). ${art.title}. Journal of Life and Medical Science, ${vol}(${num}), ${pages}. https://doi.org/${doi}`;
      break;
    case 'mla':
      text = `${firstAuthor}, et al. "${art.title}." Journal of Life and Medical Science, vol. ${vol}, no. ${num}, ${year}, pp. ${pages}.`;
      break;
    case 'chicago':
      text = `${authorNames.join(', ')}. ${year}. "${art.title}." Journal of Life and Medical Science ${vol} (${num}): ${pages}. https://doi.org/${doi}.`;
      break;
    case 'harvard':
      text = `${authorNames.join(', ')}, ${year}. ${art.title}. Journal of Life and Medical Science, ${vol}(${num}), pp.${pages}.`;
      break;
    case 'ieee':
      text = `${authorNames.map(a => `${a}`).join(', ')}, "${art.title}," J. Life Med. Sci., vol. ${vol}, no. ${num}, pp. ${pages}, ${year}.`;
      break;
    case 'vancouver':
      text = `${authorNames.join(', ')}. ${art.title}. J Life Med Sci. ${year};${vol}(${num}):${pages}.`;
      break;
    default:
      text = `${firstAuthor} et al. (${year}). ${art.title}. J Life Med Sci.`;
  }

  document.getElementById('citationBoxText').textContent = text;
}

function downloadRisCitation() {
  const art = state.currentArticle;
  if (!art) return;

  const authors = art.article_authors || [];
  const year = state.currentIssue?.year || 2026;
  const vol = state.currentIssue?.volume || 4;
  const num = state.currentIssue?.number || 7;
  const doi = art.doi || '10.59823/jlms.v4i7.3432';

  let ris = `TY  - JOUR\n`;
  ris += `TI  - ${art.title}\n`;
  authors.forEach(a => { ris += `AU  - ${a.name}\n`; });
  ris += `T2  - Journal of Life and Medical Science\n`;
  ris += `PY  - ${year}\n`;
  ris += `VL  - ${vol}\n`;
  ris += `IS  - ${num}\n`;
  ris += `SP  - ${art.first_page || 1}\n`;
  ris += `EP  - ${art.last_page || 14}\n`;
  ris += `DO  - ${doi}\n`;
  ris += `UR  - https://jlms-journal.org/article/view/${art.id}\n`;
  ris += `ER  - \n`;

  triggerFileDownload(ris, `citation-${art.id.slice(0, 6)}.ris`, 'application/x-research-info-systems');
}

function downloadBibtexCitation() {
  const art = state.currentArticle;
  if (!art) return;

  const authors = (art.article_authors || []).map(a => a.name).join(' and ');
  const year = state.currentIssue?.year || 2026;
  const vol = state.currentIssue?.volume || 4;
  const num = state.currentIssue?.number || 7;
  const doi = art.doi || '10.59823/jlms.v4i7.3432';

  const bibtex = `@article{jlms_${art.id.slice(0, 6)},\n  title={${art.title}},\n  author={${authors}},\n  journal={Journal of Life and Medical Science},\n  volume={${vol}},\n  number={${num}},\n  pages={${art.first_page || 1}--${art.last_page || 14}},\n  year={${year}},\n  doi={${doi}}\n}`;

  triggerFileDownload(bibtex, `citation-${art.id.slice(0, 6)}.bib`, 'text/plain');
}

function triggerFileDownload(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`, 'success');
}

// ==========================================================================
// DYNAMIC ARCHIVES VIEW (FROM SUPABASE issues)
// ==========================================================================
async function loadArchivesView() {
  const container = document.getElementById('archivesListContainer');
  container.innerHTML = `<div style="text-align:center; grid-column:1/-1; padding:40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--gold-500);"></i></div>`;

  const issues = await getAllIssues();
  state.allIssues = issues;

  if (issues.length === 0) {
    container.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">No archived volumes found.</p>`;
    return;
  }

  container.innerHTML = issues.map(iss => {
    const isCurrent = iss.is_current ? `<span style="position:absolute; top:12px; right:12px; background:var(--gold-500); color:#070d18; padding:4px 10px; border-radius:999px; font-size:0.75rem; font-weight:700;">CURRENT</span>` : '';
    const cover = iss.cover_image_url || 'assets/hero-banner.jpg';
    
    return `
      <div class="archive-card" style="position:relative; background:var(--bg-surface); border:1px solid var(--border-light); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--card-shadow); transition:transform var(--transition-base);">
        ${isCurrent}
        <div style="height:160px; overflow:hidden;">
          <img src="${cover}" alt="Volume Cover" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <div style="padding:20px;">
          <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--teal-600); font-weight:600;">Volume ${iss.volume}, Issue ${iss.number} (${iss.year})</span>
          <h4 style="font-family:var(--font-serif); font-size:1.15rem; margin:8px 0 10px; line-height:1.35; color:var(--navy-900);">${escapeHtml(iss.title)}</h4>
          <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5; margin-bottom:16px;">${escapeHtml(iss.description || '')}</p>
          <button class="btn btn-outline btn-sm" style="width:100%;" data-archive-id="${iss.id}">
            <i class="fa-solid fa-book-open"></i> Browse Table of Contents
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-archive-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const issueId = btn.dataset.archiveId;
      const targetIssue = state.allIssues.find(i => i.id === issueId);
      if (targetIssue) {
        state.currentIssue = targetIssue;
        switchView('home');
        document.getElementById('currentIssueTitle').textContent = targetIssue.title;
        const articles = await getIssueArticles(issueId);
        state.articles = articles;
        state.filteredArticles = articles;
        renderArticles(articles);
      }
    });
  });
}

// ==========================================================================
// DYNAMIC EDITORIAL BOARD VIEW (FROM SUPABASE editorial_members)
// ==========================================================================
async function loadEditorialView() {
  const container = document.getElementById('editorialContainer');
  container.innerHTML = `<div style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--gold-500);"></i></div>`;

  const members = await getEditorialMembers();
  state.editorialMembers = members;

  const chief = members.filter(m => m.category === 'editor_in_chief');
  const associates = members.filter(m => m.category === 'associate_editor');
  const advisory = members.filter(m => m.category === 'advisory_board');

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:36px;">
      <!-- Editor in Chief -->
      <div>
        <h3 style="font-family:var(--font-serif); font-size:1.4rem; color:var(--gold-600); margin-bottom:16px; border-bottom:2px solid var(--gold-500); padding-bottom:8px;">
          <i class="fa-solid fa-crown" style="margin-right:8px;"></i> Editor-in-Chief
        </h3>
        ${chief.map(c => `
          <div style="background:var(--bg-surface); padding:24px; border-radius:var(--radius-lg); border:1px solid var(--border-light); display:flex; gap:20px; align-items:center; flex-wrap:wrap; box-shadow:var(--card-shadow);">
            <img src="${c.image_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}" alt="${escapeHtml(c.name)}" style="width:90px; height:90px; border-radius:50%; object-fit:cover; border:3px solid var(--gold-500);">
            <div>
              <h4 style="font-family:var(--font-serif); font-size:1.25rem; color:var(--navy-900);">${escapeHtml(c.name)}</h4>
              <p style="color:var(--text-secondary); font-size:0.9rem;">${escapeHtml(c.title_role)}</p>
              <p style="font-size:0.85rem; color:var(--gold-600); font-weight:600;">${escapeHtml(c.affiliation)}</p>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-top:4px;">
                ${c.email ? `<i class="fa-solid fa-envelope"></i> ${escapeHtml(c.email)}` : ''} 
                ${c.orcid ? `• <i class="fa-brands fa-orcid" style="color:#a6ce39;"></i> ORCID: ${escapeHtml(c.orcid)}` : ''}
              </p>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Associate Editors -->
      <div>
        <h3 style="font-family:var(--font-serif); font-size:1.4rem; color:var(--gold-600); margin-bottom:16px; border-bottom:2px solid var(--gold-500); padding-bottom:8px;">
          <i class="fa-solid fa-user-doctor" style="margin-right:8px;"></i> Associate Editors & Section Heads
        </h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
          ${associates.map(a => `
            <div style="background:var(--bg-surface); padding:20px; border-radius:var(--radius-md); border:1px solid var(--border-light); box-shadow:var(--card-shadow);">
              <h4 style="font-size:1.05rem; color:var(--navy-900);">${escapeHtml(a.name)}</h4>
              <p style="font-size:0.85rem; color:var(--gold-600); font-weight:600;">Section: ${escapeHtml(a.section || a.title_role)}</p>
              <p style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(a.affiliation)}</p>
              ${a.email ? `<p style="font-size:0.78rem; color:var(--text-muted); margin-top:6px;"><i class="fa-solid fa-envelope"></i> ${escapeHtml(a.email)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Advisory Council -->
      <div>
        <h3 style="font-family:var(--font-serif); font-size:1.4rem; color:var(--gold-600); margin-bottom:16px; border-bottom:2px solid var(--gold-500); padding-bottom:8px;">
          <i class="fa-solid fa-graduation-cap" style="margin-right:8px;"></i> International Advisory Board
        </h3>
        <ul style="list-style:none; display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
          ${advisory.map(ad => `
            <li style="padding:14px; background:var(--bg-surface); border-radius:var(--radius-sm); border:1px solid var(--border-light); font-size:0.88rem; box-shadow:var(--card-shadow);">
              <strong>${escapeHtml(ad.name)}</strong>
              ${ad.section ? `<div style="font-size:0.8rem; color:var(--gold-600);">${escapeHtml(ad.section)}</div>` : ''}
              <div style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(ad.affiliation)}</div>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
}

// ==========================================================================
// DYNAMIC POLICIES & GUIDELINES VIEW (FROM SUPABASE journal_policies)
// ==========================================================================
async function loadPoliciesView() {
  const container = document.getElementById('policiesContentArea');
  container.innerHTML = `<div style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--gold-500);"></i></div>`;

  const policies = await getJournalPolicies();
  state.policies = policies;

  if (policies.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:var(--text-muted);">No policies found in database.</p>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:28px; background:var(--bg-surface); padding:32px; border-radius:var(--radius-xl); border:1px solid var(--border-light); box-shadow:var(--card-shadow);">
      ${policies.map((p, idx) => `
        <div>
          <h3 style="font-family:var(--font-serif); font-size:1.3rem; color:var(--navy-900); margin-bottom:10px;">
            <i class="fa-solid ${escapeHtml(p.icon || 'fa-circle-info')}" style="color:var(--gold-500); margin-right:8px;"></i> ${idx + 1}. ${escapeHtml(p.title)}
          </h3>
          <p style="color:var(--text-secondary); line-height:1.75; font-size:0.92rem;">
            ${escapeHtml(p.content)}
          </p>
        </div>
      `).join('')}
    </div>
  `;
}

// ==========================================================================
// VIEW ROUTER
// ==========================================================================
function switchView(viewName) {
  const views = {
    home: document.getElementById('view-current-issue'),
    issues: document.getElementById('view-current-issue'),
    archives: document.getElementById('view-archives'),
    editorial: document.getElementById('view-editorial'),
    submit: document.getElementById('view-submission-portal'),
    policies: document.getElementById('view-policies'),
    guidelines: document.getElementById('view-policies'),
    charges: document.getElementById('view-policies'),
    about: document.getElementById('view-policies'),
    aims: document.getElementById('view-policies'),
    indexing: document.getElementById('view-policies'),
    contact: document.getElementById('view-editorial')
  };

  Object.values(views).forEach(el => {
    if (el) el.style.display = 'none';
  });

  const target = views[viewName] || views.home;
  if (target) {
    target.style.display = 'block';
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (viewName === 'archives') loadArchivesView();
  if (viewName === 'editorial' || viewName === 'contact') loadEditorialView();
  if (['policies', 'guidelines', 'charges', 'about', 'aims', 'indexing'].includes(viewName)) {
    loadPoliciesView();
  }

  window.scrollTo({ top: document.querySelector('.main-articles-area').offsetTop - 100, behavior: 'smooth' });
}

// ==========================================================================
// EVENT LISTENERS & INTERACTION
// ==========================================================================
function setupEventListeners() {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(el.dataset.nav);
    });
  });

  ['headerSubmitBtn', 'quickSubmitBtn', 'sidebarSubmitBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => switchView('submit'));
  });

  document.getElementById('viewAllIssuesBtn')?.addEventListener('click', () => switchView('archives'));

  // Mobile hamburger menu
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileNavDrawer = document.getElementById('mobileNavDrawer');
  if (mobileMenuBtn && mobileNavDrawer) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = mobileNavDrawer.classList.toggle('open');
      mobileMenuBtn.classList.toggle('open', isOpen);
      mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Close drawer when any mobile nav item is tapped
    mobileNavDrawer.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        mobileNavDrawer.classList.remove('open');
        mobileMenuBtn.classList.remove('open');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        const view = item.dataset.view;
        if (view) switchView(view);
      });
    });
  }

  // Section Filters
  document.querySelectorAll('#sectionFilterTabs .tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#sectionFilterTabs .tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeFilter = tab.dataset.filter;
      applyFilters();
    });
  });

  // Search input
  const searchInput = document.getElementById('articleSearchInput');
  const searchBtn = document.getElementById('searchSubmitBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', () => applyFilters());
  }

  // Modals closing
  const articleModal = document.getElementById('articleReaderModal');
  const closeArticleBtn = document.getElementById('closeArticleModalBtn');
  const closeBottomBtn = document.getElementById('closeModalBottomBtn');
  [closeArticleBtn, closeBottomBtn].forEach(b => {
    if (b) b.addEventListener('click', () => {
      articleModal.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  [articleModal, document.getElementById('authModal'), document.getElementById('dashboardModal')].forEach(m => {
    if (m) m.addEventListener('click', (e) => {
      if (e.target === m) {
        m.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });

  // Citation tabs
  document.querySelectorAll('#modalCitationTabs .citation-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#modalCitationTabs .citation-tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentCitationStyle = tab.dataset.style;
      updateCitationBox(tab.dataset.style);
    });
  });

  // Copy citation
  document.getElementById('copyCitationBtn')?.addEventListener('click', () => {
    const text = document.getElementById('citationBoxText').textContent;
    navigator.clipboard.writeText(text);
    showToast('Citation copied to clipboard!', 'success');
  });

  document.getElementById('downloadRisBtn')?.addEventListener('click', downloadRisCitation);
  document.getElementById('downloadBibtexBtn')?.addEventListener('click', downloadBibtexCitation);

  // Auth Modal
  document.getElementById('openLoginBtn')?.addEventListener('click', openAuthModal);
  document.getElementById('closeAuthModalBtn')?.addEventListener('click', () => {
    document.getElementById('authModal').classList.remove('active');
    document.body.style.overflow = '';
  });

  // Auth Form Tabs
  const tabLogin = document.getElementById('tabLogin');
  const tabReg = document.getElementById('tabRegister');
  const formLogin = document.getElementById('signInForm');
  const formReg = document.getElementById('registerForm');

  tabLogin?.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    formLogin.style.display = 'block';
    formReg.style.display = 'none';
  });

  tabReg?.addEventListener('click', () => {
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    formReg.style.display = 'block';
    formLogin.style.display = 'none';
  });

  // Sign In Form Submit
  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;
    btn.disabled = true;

    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;

    const res = await loginUser(email, pass);
    btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Sign In to Portal`;
    btn.disabled = false;

    if (res.success) {
      document.getElementById('authModal').classList.remove('active');
      document.body.style.overflow = '';
      state.currentUser = res.data.user;
      renderAuthUI(res.data.user);
    } else {
      showToast(res.error || 'Authentication failed. Please verify credentials.', 'error');
    }
  });

  // Registration Form Submit
  formReg?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerSubmitBtn');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registering & Signing In...`;
    btn.disabled = true;

    const name = document.getElementById('regFullName').value;
    const aff = document.getElementById('regAffiliation').value;
    const email = document.getElementById('regEmail').value;
    const pass = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;

    const res = await registerUser(email, pass, name, aff, role);
    btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Complete Author Registration`;
    btn.disabled = false;

    if (res.success) {
      document.getElementById('authModal').classList.remove('active');
      document.body.style.overflow = '';
      state.currentUser = res.data.user;
      renderAuthUI(res.data.user);
      showToast('Registration successful! You are now logged in as ' + name, 'success');
    } else {
      showToast(res.error || 'Registration failed.', 'error');
    }
  });

  // Manuscript Submission Form
  document.getElementById('manuscriptSubmitForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitManuscriptBtn');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Preparing submission...`;
    btn.disabled = true;

    const fileInput = document.getElementById('subFile');
    const selectedFile = fileInput?.files?.[0];
    let fileName = selectedFile?.name || 'manuscript_draft.pdf';
    let fileUrl = 'https://pmbqtxzynycmbwnzeuez.supabase.co/storage/v1/object/public/manuscripts/sample.pdf';

    if (selectedFile) {
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-spin"></i> Uploading ${selectedFile.name}...`;
      const uploadRes = await uploadManuscriptFile(selectedFile);
      if (uploadRes.success && uploadRes.fileUrl) {
        fileName = uploadRes.fileName;
        fileUrl = uploadRes.fileUrl;
      }
    }

    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting to Supabase...`;
    const payload = {
      title: document.getElementById('subTitle').value,
      section: document.getElementById('subSection').value,
      keywords: document.getElementById('subKeywords').value,
      author_name: document.getElementById('subAuthorName').value,
      author_email: document.getElementById('subAuthorEmail').value,
      author_affiliation: document.getElementById('subAffiliation').value,
      abstract: document.getElementById('subAbstract').value,
      file_name: fileName,
      file_url: fileUrl,
      status: 'submitted'
    };

    const res = await submitManuscript(payload);
    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Manuscript to Supabase`;
    btn.disabled = false;

    if (res.success) {
      const trackingId = res.data.id.slice(0, 8);
      
      // Send Automated Confirmation Email via EmailJS
      if (window.emailjs && EMAILJS_CONFIG.publicKey) {
        try {
          const emailMessage = `Dear ${payload.author_name},\n\nThank you for submitting your manuscript to the Journal of Life and Medical Science.\n\nTitle: "${payload.title}"\nSection: ${payload.section}\nTracking Reference: ${trackingId}\nSubmission Date: ${new Date().toLocaleDateString()}\n\nYour manuscript has entered our editorial review system. You will receive further updates via email.\n\nWarm regards,\nEditorial Office\nJournal of Life and Medical Science\nContact: moeenijazfiverr@gmail.com`;

          await window.emailjs.send(
            EMAILJS_CONFIG.serviceId,
            EMAILJS_CONFIG.templateId,
            {
              to_name: payload.author_name,
              user_name: payload.author_name,
              name: payload.author_name,
              to_email: payload.author_email,
              user_email: payload.author_email,
              email: payload.author_email,
              customer_email: payload.author_email,
              client_email: payload.author_email,
              recipient: payload.author_email,
              recipient_email: payload.author_email,
              send_to: payload.author_email,
              to: payload.author_email,
              reply_to: 'moeenijazfiverr@gmail.com',
              from_name: 'Journal of Life and Medical Science',
              article_title: payload.title,
              title: payload.title,
              section: payload.section,
              message: emailMessage,
              order_details: emailMessage,
              content: emailMessage,
              order_id: trackingId,
              tracking_id: trackingId,
              journal_name: 'Journal of Life and Medical Science',
              status: 'Submitted'
            },
            EMAILJS_CONFIG.publicKey
          );
          showToast(`Manuscript submitted! Confirmation email sent to ${payload.author_email}`, 'success');
        } catch (emailErr) {
          console.warn('EmailJS submission notice error:', emailErr);
          showToast(`Manuscript submitted! (Tracking ID: ${trackingId})`, 'success');
        }
      } else {
        showToast('Manuscript successfully submitted! Tracking ID: ' + trackingId, 'success');
      }

      document.getElementById('manuscriptSubmitForm').reset();
      switchView('home');
    } else {
      showToast('Submission failed: ' + res.error, 'error');
    }
  });

  // Dashboard modal close
  document.getElementById('closeDashModalBtn')?.addEventListener('click', () => {
    document.getElementById('dashboardModal').classList.remove('active');
    document.body.style.overflow = '';
  });

  document.getElementById('dashNewSubBtn')?.addEventListener('click', () => {
    document.getElementById('dashboardModal').classList.remove('active');
    document.body.style.overflow = '';
    switchView('submit');
  });
}

// ==========================================================================
// FILTERS & SEARCH
// ==========================================================================
function applyFilters() {
  const query = state.searchQuery;
  const sectionFilter = state.activeFilter;

  const filtered = state.articles.filter(art => {
    const sectionName = art.sections?.title || '';
    const matchesSection = sectionFilter === 'all' || sectionName.toLowerCase().includes(sectionFilter.toLowerCase());

    if (!matchesSection) return false;
    if (!query) return true;

    const titleMatch = art.title.toLowerCase().includes(query);
    const abstractMatch = art.abstract.toLowerCase().includes(query);
    const authorMatch = (art.article_authors || []).some(a => a.name.toLowerCase().includes(query));
    const keywordMatch = (art.keywords || []).some(k => k.toLowerCase().includes(query));
    const doiMatch = (art.doi || '').toLowerCase().includes(query);

    return titleMatch || abstractMatch || authorMatch || keywordMatch || doiMatch;
  });

  state.filteredArticles = filtered;
  renderArticles(filtered);
}

function openAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

async function openDashboardModal() {
  const modal = document.getElementById('dashboardModal');
  const user = state.currentUser;
  if (!user) return;

  const fullName = user.user_metadata?.full_name || user.email;
  document.getElementById('dashUserEmail').textContent = `Account: ${fullName} (${user.email})`;
  const listContainer = document.getElementById('dashSubmissionsList');
  listContainer.innerHTML = `<div style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching submissions...</div>`;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const submissions = await getAuthorSubmissions(user.email);
  if (submissions.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; padding:30px; background:var(--bg-primary); border-radius:var(--radius-md);">
        <p style="color:var(--text-muted); font-size:0.9rem;">You have not submitted any manuscripts under this email (${user.email}) yet.</p>
        <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="document.getElementById('dashNewSubBtn').click()">Submit First Manuscript</button>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = submissions.map(sub => `
    <div style="background:var(--bg-primary); padding:18px; border-radius:var(--radius-md); border:1px solid var(--border-light);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--gold-600);">${escapeHtml(sub.section)}</span>
        <span style="font-size:0.75rem; padding:3px 10px; border-radius:999px; background:rgba(212,163,75,0.15); color:var(--gold-600); font-weight:700; text-transform:uppercase;">
          ${sub.status.replace('_', ' ')}
        </span>
      </div>
      <h5 style="font-family:var(--font-serif); font-size:1.1rem; color:var(--navy-900); margin-bottom:6px;">${escapeHtml(sub.title)}</h5>
      <p style="font-size:0.82rem; color:var(--text-muted);">Submitted: ${new Date(sub.created_at).toLocaleDateString()} • File: ${escapeHtml(sub.file_name || 'Manuscript.pdf')}</p>
    </div>
  `).join('');
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}" style="color:var(--gold-400);"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================================================
// THEME SWITCHER
// ==========================================================================
function initTheme() {
  const saved = localStorage.getItem('jlms-theme') || localStorage.getItem('fmhr-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jlms-theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? `<i class="fa-solid fa-sun" style="color:var(--gold-400);"></i>` : `<i class="fa-solid fa-moon"></i>`;
  }
}

// Utility: HTML escape
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
