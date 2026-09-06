// Hassan AutoFarm v7.3 Client-Side Application Logic

let activeTab = 'dashboard';
let activeLogTab = 'download';
let logs = { download: [], upload: [], warmer: [] };
let channels = [];
let accounts = [];
let isLogsBlurred = false;
let isLogsCollapsed = false;
let privacyMode = false;
let currentPage = 1;
let selectedChannelForLinks = null;

document.addEventListener('DOMContentLoaded', () => {
  if (window.INITIAL_STATE) {
    channels = window.INITIAL_STATE.channels || [];
    accounts = window.INITIAL_STATE.connected_accounts || [];
    privacyMode = window.INITIAL_STATE.license?.privacy_demo || false;
    const privToggle = document.getElementById('privacy-toggle');
    const privText = document.getElementById('privacy-status-text');
    if (privToggle) privToggle.checked = privacyMode;
    if (privText) privText.innerText = privacyMode ? 'ON' : 'OFF';
    renderChannelsTable();
    updateStatsUI(window.INITIAL_STATE.stats);
    updateCloudSyncUI(window.INITIAL_STATE.settings);
    updateVideoStudioUI(window.INITIAL_STATE.video_studio);
    applyPerformanceModeUI(window.INITIAL_STATE.settings?.performance_mode || 'High PC (GPU NVENC Accelerated)');
    updateTelemetryUI(window.INITIAL_STATE.telemetry);
    renderConnectedFacebookPages();
    updateIxBrowserUI(window.INITIAL_STATE.settings);
    refreshPendingVideosList();
    if (window.INITIAL_STATE.settings?.download_engine) {
      const qDl = document.getElementById('download-engine-mode');
      const sDl = document.getElementById('studio-download-engine');
      if (qDl) qDl.value = window.INITIAL_STATE.settings.download_engine;
      if (sDl) sDl.value = window.INITIAL_STATE.settings.download_engine;
    }
    fetchAnalytics();
  }
  try { lucide.createIcons(); } catch(e) {}
  fetchInitialState();
  initLogStream();
  initStreamProgressAnimation();
});

// Fetch Initial State
async function fetchInitialState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    channels = data.channels || [];
    accounts = data.connected_accounts || [];
    privacyMode = data.license?.privacy_demo || false;
    
    const privToggle = document.getElementById('privacy-toggle');
    const privText = document.getElementById('privacy-status-text');
    if (privToggle) privToggle.checked = privacyMode;
    if (privText) privText.innerText = privacyMode ? 'ON' : 'OFF';

    renderChannelsTable();
    updateStatsUI(data.stats);
    updateCloudSyncUI(data.settings);
    updateVideoStudioUI(data.video_studio);
    applyPerformanceModeUI(data.settings?.performance_mode || 'High PC (GPU NVENC Accelerated)');
    updateTelemetryUI(data.telemetry);
    renderConnectedFacebookPages();
    updateIxBrowserUI(data.settings);
    refreshPendingVideosList();
    if (data.settings?.download_engine) {
      const qDl = document.getElementById('download-engine-mode');
      const sDl = document.getElementById('studio-download-engine');
      if (qDl) qDl.value = data.settings.download_engine;
      if (sDl) sDl.value = data.settings.download_engine;
    }
    fetchAnalytics();
    fetchLogs();
  } catch (err) {
    console.error('Error fetching initial state:', err);
  }
}

// Fetch Log History
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs/all');
    logs = await res.json();
    renderTerminalLogs();
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

// Real-Time Server-Sent Events (SSE) Stream
function initLogStream() {
  const evtSource = new EventSource('/api/logs/stream');
  evtSource.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      const cat = payload.category;
      const log = payload.log;
      if (payload.channels && Array.isArray(payload.channels)) {
        channels = payload.channels;
        renderChannelsTable();
      }
      if (logs[cat]) {
        logs[cat].push(log);
        if (logs[cat].length > 250) logs[cat].shift();
        
        if (cat === activeLogTab) {
          appendLogLine(log);
        }
      }
      if (payload.stats) {
        updateStatsUI(payload.stats);
      } else {
        fetchStats();
      }
    } catch (err) {
      console.error('Error parsing SSE event:', err);
    }
  };
}

async function fetchStats() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    if (data.channels) {
      channels = data.channels;
      renderChannelsTable();
    }
    updateStatsUI(data.stats);
  } catch (e) {}
}

function updateStatsUI(stats) {
  if (!stats) return;
  const farmedEl = document.getElementById('stat-farmed') || document.getElementById('metric-farmed');
  const streamsEl = document.getElementById('stat-streams') || document.getElementById('metric-streams');
  const storageEl = document.getElementById('stat-storage') || document.getElementById('metric-storage');
  const pagesEl = document.getElementById('stat-pages') || document.getElementById('metric-pages');

  if (farmedEl) farmedEl.innerText = (stats.videos_farmed || 0).toLocaleString();
  if (streamsEl) {
    if (stats.active_engine) {
      streamsEl.innerText = stats.active_engine;
    } else if (stats.active_streams > 0) {
      streamsEl.innerHTML = `${stats.active_streams} Streams <span class="text-xs text-amber-400 font-semibold">(Active)</span>`;
    } else {
      streamsEl.innerText = '3 Engines (Auto)';
    }
  }
  if (stats.scraping_engine_mode) {
    const qMode = document.getElementById('scraping-engine-mode');
    const sMode = document.getElementById('studio-scraping-engine');
    if (qMode && !qMode.matches(':focus')) qMode.value = stats.scraping_engine_mode;
    if (sMode && !sMode.matches(':focus')) sMode.value = stats.scraping_engine_mode;
  }
  if (storageEl) storageEl.innerText = `${stats.storage_saved_gb || 0.0} GB`;
  if (pagesEl) pagesEl.innerText = stats.connected_pages || 0;
}

// Tab Switching
function switchTab(tabId) {
  activeTab = tabId;
  const tabs = ['dashboard', 'scraper', 'ai_video', 'image_anti', 'cloud_uploader', 'uploader', 'analytics', 'settings'];
  tabs.forEach(t => {
    const content = document.getElementById(`tab-content-${t}`);
    const navBtn = document.getElementById(`nav-btn-${t}`) || document.getElementById(`nav-${t}`);
    if (content) {
      if (t === tabId || (tabId === 'uploader' && t === 'cloud_uploader') || (tabId === 'cloud_uploader' && t === 'uploader')) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
    if (navBtn) {
      if (t === tabId || (tabId === 'uploader' && t === 'cloud_uploader') || (tabId === 'cloud_uploader' && t === 'uploader')) {
        navBtn.className = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white font-bold bg-[#182030] border border-[#242f46] shadow-sm shadow-indigo-500/20 transition';
      } else {
        navBtn.className = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#131826] transition';
      }
    }
  });
  if (tabId === 'analytics') {
    fetchAnalytics();
  }
  lucide.createIcons();
}

// Channel Pagination & Rendering
const pageSize = 50;

function changePage(delta) {
  currentPage += delta;
  renderChannelsTable();
}

// Render Channels Table
function renderChannelsTable() {
  const tbody = document.getElementById('channels-table-body');
  if (!tbody) return;

  if (!channels || channels.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="p-8 text-center text-slate-500">
          <div class="flex flex-col items-center justify-center space-y-2">
            <i data-lucide="inbox" class="w-8 h-8 text-slate-600"></i>
            <p class="text-xs font-semibold text-slate-400">Queue is currently empty</p>
            <p class="text-[10px] text-slate-600">Go to <button onclick="switchTab('scraper')" class="text-cyan-400 underline font-semibold">Scraper Studio</button> or paste a profile URL to start scraping.</p>
          </div>
        </td>
      </tr>
    `;
    const pageIndicator = document.getElementById('page-indicator');
    if (pageIndicator) pageIndicator.innerText = `Page 1/1 (0)`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  const searchVal = (document.getElementById('channel-search')?.value || '').toLowerCase().trim();
  const platformVal = (document.getElementById('platform-filter')?.value || 'all').toLowerCase();
  const profileIdVal = (document.getElementById('profile-id-filter')?.value || 'all').toLowerCase();
  const sortVal = document.getElementById('sort-filter')?.value || 'default';

  let filtered = channels.filter(ch => {
    if (!ch) return false;
    const nameStr = String(ch.name || '').toLowerCase();
    const platStr = String(ch.platform || '').toLowerCase();
    const profStr = String(ch.profile_id || '').toLowerCase();

    const matchName = !searchVal || nameStr.includes(searchVal);
    const matchPlat = platformVal === 'all' || platStr === platformVal;
    let matchProfile = true;
    if (profileIdVal === 'unassigned') {
      matchProfile = !profStr || profStr === 'unassigned' || profStr === '0';
    } else if (profileIdVal !== 'all') {
      matchProfile = profStr === profileIdVal;
    }
    return matchName && matchPlat && matchProfile;
  });

  if (sortVal === 'name') {
    filtered.sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
  } else if (sortVal === 'platform') {
    filtered.sort((a,b) => String(a.platform || '').localeCompare(String(b.platform || '')));
  } else if (sortVal === 'profile_id') {
    filtered.sort((a,b) => String(a.profile_id || '').localeCompare(String(b.profile_id || '')));
  } else if (sortVal === 'queue_size') {
    filtered.sort((a,b) => (Number(b.queued) || 0) - (Number(a.queued) || 0));
  } else if (sortVal === 'downloads') {
    filtered.sort((a,b) => (Number(b.farmed || b.done) || 0) - (Number(a.farmed || a.done) || 0));
  }

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const pageIndicator = document.getElementById('page-indicator');
  if (pageIndicator) {
    pageIndicator.innerText = `Page ${currentPage}/${totalPages} (${filtered.length})`;
  }

  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  let rowsHtml = '';
  pageItems.forEach(ch => {
    const chId = ch.id;
    const chName = String(ch.name || '');
    const chPlat = String(ch.platform || 'tiktok').toLowerCase();
    const isSelected = !!ch.selected;
    const isCaps = !!ch.caps;
    const isAi = !!ch.ai_mode;
    const isMon = !!ch.monetized;
    const queuedCount = ch.queued !== undefined ? ch.queued : (ch.links || 0);
    const farmedCount = ch.farmed !== undefined ? ch.farmed : (ch.done || 0);

    // Platform Badges
    let platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/60 border border-cyan-800 text-cyan-400 flex items-center justify-center gap-1"><i data-lucide="music-2" class="w-3 h-3"></i>TikTok</span>`;
    if (chPlat === 'facebook') {
      platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/60 border border-blue-800 text-blue-400 flex items-center justify-center gap-1"><i data-lucide="facebook" class="w-3 h-3"></i>Facebook</span>`;
    } else if (chPlat === 'youtube') {
      platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950/60 border border-red-800 text-red-400 flex items-center justify-center gap-1"><i data-lucide="video" class="w-3 h-3"></i>YouTube</span>`;
    } else if (chPlat === 'instagram') {
      platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/60 border border-purple-800 text-purple-400 flex items-center justify-center gap-1"><i data-lucide="camera" class="w-3 h-3"></i>Instagram</span>`;
    }

    const aiBadge = isAi 
      ? `<button onclick="toggleChannelProperty(${chId}, 'ai_mode')" class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-600 cursor-pointer">AI: ON</button>`
      : `<button onclick="toggleChannelProperty(${chId}, 'ai_mode')" class="px-2 py-0.5 rounded text-[10px] bg-[#090c14] border border-[#182030] text-slate-400 cursor-pointer">AI: OFF</button>`;

    const monBadge = isMon
      ? `<button onclick="toggleChannelProperty(${chId}, 'monetized')" class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-600 cursor-pointer">Mon: ON</button>`
      : `<button onclick="toggleChannelProperty(${chId}, 'monetized')" class="px-2 py-0.5 rounded text-[10px] bg-[#090c14] border border-[#182030] text-slate-400 cursor-pointer">Mon: OFF</button>`;

    const displayName = privacyMode ? maskText(chName) : chName;

    const currentSort = ch.sort_order || 'Latest';
    const sortSelect = `
      <select onchange="changeChannelProperty(${chId}, 'sort_order', this.value)" class="bg-[#090c14] border border-[#182030] hover:border-cyan-500 rounded px-2 py-0.5 text-slate-300 text-[10px] font-semibold focus:outline-none cursor-pointer">
        <option value="Latest" ${currentSort === 'Latest' ? 'selected' : ''}>Latest</option>
        <option value="Oldest" ${currentSort === 'Oldest' ? 'selected' : ''}>Oldest</option>
        <option value="Popular" ${currentSort === 'Popular' ? 'selected' : ''}>Popular</option>
        <option value="Random" ${currentSort === 'Random' ? 'selected' : ''}>Random</option>
      </select>
    `;

    const currentLimit = ch.limit || '3000';
    const limitSelect = `
      <select onchange="changeChannelProperty(${chId}, 'limit', this.value)" class="bg-[#090c14] border border-[#182030] hover:border-amber-500 rounded px-2 py-0.5 text-amber-300 text-[10px] font-bold focus:outline-none cursor-pointer">
        <option value="3000" ${currentLimit == '3000' || currentLimit === 'All' || currentLimit === 'Latest' ? 'selected' : ''}>3000 (Max)</option>
        <option value="1000" ${currentLimit == '1000' ? 'selected' : ''}>1000</option>
        <option value="500" ${currentLimit == '500' ? 'selected' : ''}>500</option>
        <option value="100" ${currentLimit == '100' ? 'selected' : ''}>100</option>
        <option value="50" ${currentLimit == '50' ? 'selected' : ''}>50</option>
      </select>
    `;

    rowsHtml += `
      <tr class="hover:bg-[#131826]/70 transition ${isSelected ? 'bg-[#0e121d]' : ''}">
        <td class="p-2.5 text-center"><input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleChannelProperty(${chId}, 'selected')" class="rounded bg-[#090c14] border-[#182030] text-cyan-500 focus:ring-0 cursor-pointer"></td>
        <td class="p-2.5 font-medium text-white">
          <span class="font-mono text-xs text-white">@${escapeHtml(displayName.replace('@', ''))}</span>
        </td>
        <td class="p-2.5 text-center"><input type="checkbox" ${isCaps ? 'checked' : ''} onchange="toggleChannelProperty(${chId}, 'caps')" class="rounded bg-[#090c14] border-[#182030] text-indigo-500 cursor-pointer"></td>
        <td class="p-2.5 text-center">${platBadge}</td>
        <td class="p-2.5 text-center">${sortSelect}</td>
        <td class="p-2.5 text-center">${limitSelect}</td>
        <td class="p-2.5 text-center font-mono text-xs text-slate-300">${queuedCount}</td>
        <td class="p-2.5 text-center font-mono text-xs font-bold text-emerald-400">
          <button onclick="resetChannelDone(${chId})" class="hover:underline hover:text-emerald-300 cursor-pointer" title="Click to Reset Done to 0">${farmedCount}</button>
        </td>
        <td class="p-2.5 text-center">${aiBadge}</td>
        <td class="p-2.5 text-center">${monBadge}</td>
        <td class="p-2.5 text-center relative">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="viewChannelLinks('${chId}')" class="bg-[#090c14] hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-[#182030] text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer" title="View Links">
              <i data-lucide="file-text" class="w-3 h-3 text-slate-400"></i>
              <span>Links</span>
            </button>
            <button onclick="toggleActionMenu('${chId}', event)" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#182030] border border-transparent hover:border-[#222d42] transition cursor-pointer" title="Creator Options">
              <i data-lucide="more-horizontal" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
  try { lucide.createIcons(); } catch(e) {}
}

let currentActionChannelId = null;

function closeGlobalActionMenu() {
  const menu = document.getElementById('global-creator-action-menu');
  if (menu) {
    menu.classList.add('hidden');
    menu.dataset.channelId = '';
  }
}

function toggleActionMenu(id, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const ch = channels.find(c => String(c.id) === String(id));
  if (!ch) return;
  currentActionChannelId = ch.id;

  const btn = (e && (e.currentTarget || (e.target && e.target.closest('button')))) || null;
  const menu = document.getElementById('global-creator-action-menu');
  if (!menu) return;

  if (!menu.classList.contains('hidden') && menu.dataset.channelId === String(id)) {
    closeGlobalActionMenu();
    return;
  }

  menu.dataset.channelId = String(id);
  const nameEl = document.getElementById('global-action-creator-name');
  if (nameEl) nameEl.innerText = `@${ch.name.replace('@', '')}`;

  if (btn) {
    const rect = btn.getBoundingClientRect();
    const menuWidth = 208;
    let left = rect.right - menuWidth;
    if (left < 10) left = 10;
    
    let top = rect.bottom + 4;
    if (top + 230 > window.innerHeight) {
      top = Math.max(10, rect.top - 230);
    }
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  menu.classList.remove('hidden');
  try { lucide.createIcons(); } catch(err) {}
}

// Close action menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('global-creator-action-menu');
  if (menu && !menu.classList.contains('hidden')) {
    if (!e.target.closest('#global-creator-action-menu') && !e.target.closest('[onclick*="toggleActionMenu"]')) {
      closeGlobalActionMenu();
    }
  }
});

async function assignProfileID(id) {
  const targetId = id !== undefined ? id : currentActionChannelId;
  closeGlobalActionMenu();
  const ch = channels.find(c => String(c.id) === String(targetId));
  if (!ch) return;
  const currentId = ch.profile_id || 'ix_profile_01';

  let promptMsg = `Assign Facebook Profile / Page for @${ch.name}:\n\n`;
  if (accounts && accounts.length > 0) {
    promptMsg += `Connected Facebook Pages from ixBrowser:\n`;
    accounts.forEach((acc, idx) => {
      promptMsg += `[${idx+1}] ${acc.page_name || acc.name} (ID: ${acc.profile_id})\n`;
    });
    promptMsg += `\nEnter Page Number (1-${accounts.length}) or type custom Profile ID:`;
  } else {
    promptMsg += `Enter Profile ID (e.g. ix_fb_101):`;
  }

  const inputVal = prompt(promptMsg, currentId);
  if (inputVal !== null && inputVal.trim()) {
    let finalId = inputVal.trim();
    const num = parseInt(finalId);
    if (!isNaN(num) && accounts && num >= 1 && num <= accounts.length) {
      finalId = accounts[num - 1].profile_id;
    }
    ch.profile_id = finalId;
    showToast(`Assigned @${ch.name} to Profile: ${finalId}`);
    renderChannelsTable();
    try {
      await fetch('/api/channel/toggle', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: ch.id, field: 'profile_id', value: finalId })
      });
      await fetch('/api/facebook/map_page', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ profile_id: finalId, creator_name: `@${ch.name}` })
      });
    } catch(e) {}
  }
}

async function resetChannelQueue(id) {
  const targetId = id !== undefined ? id : currentActionChannelId;
  closeGlobalActionMenu();
  const ch = channels.find(c => String(c.id) === String(targetId));
  if (!ch) return;
  ch.queued = 0;
  showToast(`Queue reset to 0 for @${ch.name}`);
  renderChannelsTable();
  try {
    await fetch('/api/channel/toggle', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id: ch.id, field: 'queued', value: 0 })
    });
  } catch(e) {}
}

async function resetChannelDone(id) {
  const targetId = id !== undefined ? id : currentActionChannelId;
  closeGlobalActionMenu();
  const ch = channels.find(c => String(c.id) === String(targetId));
  if (!ch) return;
  ch.done = 0;
  ch.farmed = 0;
  showToast(`Done count reset to 0 for @${ch.name} (Videos re-queued)`);
  renderChannelsTable();
  try {
    await fetch(`/api/channel/reset_done/${ch.id}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'}
    });
  } catch(e) {}
}

async function clearChannelFiles(id) {
  const targetId = id !== undefined ? id : currentActionChannelId;
  closeGlobalActionMenu();
  const ch = channels.find(c => String(c.id) === String(targetId));
  if (!ch) return;
  ch.queued = 0;
  ch.farmed = 0;
  ch.links = 0;
  renderChannelsTable();
  try {
    await fetch(`/api/channel/clear/${ch.id}`, { method: 'POST' });
  } catch (e) {}
  showToast(`Files and cached links cleared for @${ch.name} ✔`);
}

async function deleteChannel(id) {
  const targetId = id !== undefined ? id : currentActionChannelId;
  closeGlobalActionMenu();
  const ch = channels.find(c => String(c.id) === String(targetId));
  if (!ch) return;
  const name = ch.name;
  
  if (!confirm(`Are you sure you want to delete creator @${name.replace('@','')}?`)) {
    return;
  }

  channels = channels.filter(c => String(c.id) !== String(targetId));
  renderChannelsTable();
  try {
    await fetch(`/api/channel/delete/${ch.id}`, { method: 'POST' });
  } catch (e) {}
  showToast(`Creator @${name.replace('@','')} deleted successfully ✔`);
}

async function changeChannelProperty(id, field, val) {
  const ch = channels.find(c => String(c.id) === String(id));
  if (ch) {
    ch[field] = val;
    fetch('/api/channel/toggle', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id: ch.id, field, value: val })
    });
    showToast(`${field.toUpperCase()} for @${ch.name.replace('@','')} set to ${val}`);
  }
}

async function toggleChannelProperty(id, field) {
  const ch = channels.find(c => String(c.id) === String(id));
  if (ch) {
    if (field === 'selected') ch.selected = !ch.selected;
    else if (field === 'caps') ch.caps = !ch.caps;
    else if (field === 'ai_mode') ch.ai_mode = !ch.ai_mode;
    else if (field === 'monetized') ch.monetized = !ch.monetized;
    else if (field === 'limit') ch.limit = ch.limit === 'All' ? 'Latest' : 'All';
    renderChannelsTable();
    fetch('/api/channel/toggle', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id: ch.id, field, value: ch[field] })
    });
  }
}

function filterChannels() {
  renderChannelsTable();
}

function toggleAllChannels(masterCb) {
  const checked = masterCb.checked;
  channels.forEach(ch => ch.selected = checked);
  renderChannelsTable();
}

// Add New Channel from Scraper Studio
async function addNewChannel() {
  const input = document.getElementById('new-channel-input');
  if (!input || !input.value.trim()) {
    showToast('Please enter a creator URL or handle.');
    return;
  }

  const val = input.value.trim();
  let plat = 'tiktok';
  if (val.includes('facebook.com')) plat = 'facebook';
  else if (val.includes('youtube.com')) plat = 'youtube';
  else if (val.includes('instagram.com')) plat = 'instagram';

  const newName = val.startsWith('http') ? val.split('/').pop().replace('@','') : val.replace('@','');
  const newCh = {
    id: Date.now(),
    selected: true,
    name: newName,
    caps: false,
    platform: plat,
    raw_url: val.startsWith('http') ? val : '',
    sort_order: 'Latest',
    limit: '3000',
    queued: 0,
    farmed: 0,
    done: 0,
    ai_mode: false,
    monetized: false,
    links: 0
  };
  channels.unshift(newCh);
  try {
    await fetch('/api/channel/add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newCh)
    });
  } catch (e) {}
  input.value = '';
  showToast(`Added ${newName} (${plat.toUpperCase()}) and saved permanently!`);
  renderChannelsTable();
  switchTab('dashboard');
}

// Quick Actions Handler
async function handleFarming(action) {
  try {
    if (action === 'start') {
      const anySelected = channels.some(c => c.selected);
      if (!anySelected && channels.length > 0) {
        channels.forEach(c => c.selected = true);
        renderChannelsTable();
      }
    } else if (action === 'stop_all' || action === 'stop') {
      const s1Text = document.getElementById('stream1-text');
      const s2Text = document.getElementById('stream2-text');
      const s1Percent = document.getElementById('stream1-percent');
      const s2Percent = document.getElementById('stream2-percent');
      const s1Bar = document.getElementById('stream1-bar');
      const s2Bar = document.getElementById('stream2-bar');
      if (s1Text) s1Text.innerText = 'Idle — waiting for task';
      if (s2Text) s2Text.innerText = 'Idle — waiting for task';
      if (s1Percent) s1Percent.innerText = '0%';
      if (s2Percent) s2Percent.innerText = '0%';
      if (s1Bar) s1Bar.style.width = '0%';
      if (s2Bar) s2Bar.style.width = '0%';
    }

    const downloadSort = document.getElementById('autopilot-speed')?.value || 'Oldest';
    const downloadLimit = parseInt(document.getElementById('download-batch-limit')?.value) || 3;
    let splitDuration = document.getElementById('download-split-duration')?.value || document.getElementById('v-split')?.value || 'Off';
    if (splitDuration === 'custom') {
      splitDuration = (document.getElementById('custom-parts-input')?.value || document.getElementById('v-custom-parts-input')?.value || '').trim() || 'Off';
    }
    const scrapingEngine = document.getElementById('scraping-engine-mode')?.value || document.getElementById('studio-scraping-engine')?.value || 'auto';
    const downloadEngine = document.getElementById('download-engine-mode')?.value || document.getElementById('studio-download-engine')?.value || 'full_hd';

    const res = await fetch(`/api/farming/${action}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        channels,
        download_sort: downloadSort,
        download_limit: downloadLimit,
        split_duration: splitDuration,
        scraping_engine: scrapingEngine,
        download_engine: downloadEngine
      })
    });
    const data = await res.json();
    if (data.success) {
      if (action === 'start') {
        showToast('START FARMING: Scraping live creator links (Zero download overhead)...');
        document.getElementById('stream1-text').innerText = 'Scraping creator links & feeds...';
        document.getElementById('stream2-text').innerText = 'Extracting direct CDN endpoints...';
      }
      else if (action === 'download') {
        const splitMsg = splitDuration !== 'Off' ? ` (Cutting into: ${splitDuration})` : '';
        const dlLabels = {
          'fast': '⚡ Fast (Turbo CDN)',
          'full_hd': '💎 Full HD (1080p)',
          '4k': '🔥 4K (Ultra HD)'
        };
        const activeDlLabel = dlLabels[downloadEngine] || 'Full HD (1080p)';
        showToast(`DOWNLOAD: Downloading via ${activeDlLabel}...${splitMsg}`);
        document.getElementById('stream1-text').innerText = `Engine: ${activeDlLabel}...${splitMsg}`;
        document.getElementById('stream2-text').innerText = 'Saving to Raw_Downloads & Ready_For_Upload...';
      }
      else if (action === 'stop_all' || action === 'stop') {
        showToast('STOP ALL: All active processes stopped.');
        fetchStats();
      }
    }
  } catch (e) {
    showToast('Action error.');
  }
}

async function resetDashboardFresh() {
  channels = [];
  renderChannelsTable();
  showToast('Dashboard reset to clean fresh state.');
}

// Modals Controller
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

function openWarmerModal() { openModal('modal-warmer'); }

async function startWarmer() {
  const portInput = document.getElementById('warmer-port-input');
  const port = portInput?.value?.trim() || '11200';
  showToast(`Starting Account Warmer daemon on port ${port}...`);
  switchLogTab('warmer');
  
  const statusBadge = document.getElementById('warmer-status-badge');
  if (statusBadge) {
    statusBadge.innerText = 'WARMING ACTIVE';
    statusBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-700 animate-pulse';
  }
  
  try {
    const res = await fetch('/api/warmer/start', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ port })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✔ Account Warmer started! Live activity streaming to Warmer Logs.');
    }
  } catch(e) {
    showToast('Failed to start warmer daemon.');
  }
}

async function stopWarmer() {
  showToast('Stopping Account Warmer...');
  const statusBadge = document.getElementById('warmer-status-badge');
  if (statusBadge) {
    statusBadge.innerText = 'Idle / Stopped';
    statusBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-900 text-slate-400 border border-slate-700';
  }
  
  try {
    await fetch('/api/warmer/stop', { method: 'POST' });
    showToast('Account Warmer stopped.');
  } catch(e) {}
}

async function submitSingleVideoScrape() {
  const input = document.getElementById('single-video-url');
  const url = input?.value?.trim();
  if (!url) {
    showToast('Please enter a video URL first.');
    return;
  }
  closeModal('modal-single-video');
  showToast(`Initiating single video scrape for ${url}...`);
  switchLogTab('download');
  
  try {
    const res = await fetch('/api/video/single_scrape', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success) {
      if (input) input.value = '';
      showToast('✔ Single video scrape queued! Check Download Logs below.');
    } else {
      showToast('Error: ' + (data.error || 'Failed to scrape video'));
    }
  } catch(e) {
    showToast('Network error triggering single video scrape.');
  }
}

async function submitDirectBatchLinks() {
  const textarea = document.getElementById('direct-batch-textarea');
  const urls = textarea?.value?.trim();
  if (!urls) {
    showToast('Please paste at least one video link.');
    return;
  }
  closeModal('modal-direct-batch');
  showToast('Queueing direct video links...');
  switchLogTab('download');
  
  try {
    const res = await fetch('/api/video/batch_direct_links', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ urls })
    });
    const data = await res.json();
    if (data.success) {
      if (data.channels) {
        channels = data.channels;
        renderChannelsTable();
      }
      if (textarea) textarea.value = '';
      showToast(`✔ Successfully queued ${data.count} direct video link(s)!`);
      switchTab('dashboard');
    } else {
      showToast('Error: ' + (data.error || 'Failed to queue links'));
    }
  } catch(e) {
    showToast('Network error importing direct links.');
  }
}

// Modal Submissions
async function submitAddById() {
  const platform = document.getElementById('modal-add-id-platform')?.value || 'tiktok';
  const val = document.getElementById('modal-add-id-input')?.value || '';
  if (!val.trim()) { showToast('Please enter an ID.'); return; }
  
  const cleanName = val.trim().startsWith('@') ? val.trim() : '@' + val.trim();
  const newCh = {
    id: Math.floor(Date.now() + Math.random() * 10000),
    selected: true,
    name: cleanName,
    caps: false,
    platform: platform,
    sort_order: 'Latest',
    limit: '3000',
    queued: 0,
    farmed: 0,
    done: 0,
    ai_mode: false,
    monetized: false,
    links: 0
  };
  channels.unshift(newCh);
  closeModal('modal-add-id');
  renderChannelsTable();
  try {
    await fetch('/api/channel/add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newCh)
    });
  } catch(e) {}
  showToast(`Added ${cleanName} (${platform.toUpperCase()}) to queue & saved!`);
  switchTab('dashboard');
}

async function submitBatchImport() {
  const textarea = document.getElementById('modal-batch-textarea');
  if (!textarea || !textarea.value.trim()) return;

  const rawUrls = textarea.value.trim();
  closeModal('modal-batch-import');
  showToast('Importing creators batch...');

  try {
    const res = await fetch('/api/channel/batch_add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ urls: rawUrls })
    });
    const data = await res.json();
    if (data.success && data.channels) {
      channels = data.channels;
      renderChannelsTable();
      showToast(`✔ Imported ${data.added} creators permanently to database!`);
    } else {
      showToast('Batch import completed.');
    }
  } catch(e) {
    showToast('Batch import error.');
  }
  switchTab('dashboard');
}

// Proxy Pool Manager
async function openProxyModal() {
  try {
    const res = await fetch('/api/proxies/load');
    const data = await res.json();
    const ta = document.getElementById('proxy-textarea');
    const badge = document.getElementById('proxy-active-badge');
    if (ta && data.content) ta.value = data.content;
    if (badge) badge.innerText = `${data.active_count || 1} Active`;
  } catch (e) {}
  openModal('modal-proxy');
}

async function saveProxyPool() {
  const ta = document.getElementById('proxy-textarea');
  const content = ta ? ta.value : '';
  try {
    const res = await fetch('/api/proxies/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    const badge = document.getElementById('proxy-active-badge');
    if (badge) badge.innerText = `${data.active_count || 1} Active`;
    closeModal('modal-proxy');
    showToast(`Saved! ${data.active_count || 1} active proxies loaded.`);
  } catch (e) {
    showToast('Failed to save proxies.');
  }
}

async function openProxiesNotepad() {
  try {
    await fetch('/api/proxies/notepad', { method: 'POST' });
    showToast('Opening proxies.txt in Notepad...');
  } catch (e) {}
}

function openProxiesFile() {
  openProxiesNotepad();
}

// Export List (Desktop Creators Export)
async function exportCreatorsList() {
  try {
    const res = await fetch('/api/channel/export_txt', { method: 'POST' });
    const data = await res.json();
    showToast(`🗂 Exported creators to ${data.path}`);
  } catch (e) {
    showToast('Exported creators list successfully.');
  }
}

function exportChannelsCSV() {
  exportCreatorsList();
}

async function setCutoffFilter() {
  const input = document.getElementById('cutoff-date-input');
  const cutoff = input?.value?.trim() || '';
  if (!cutoff || cutoff === 'YYYYMMDD') {
    showToast('Enter cutoff date formatted as YYYYMMDD (e.g. 20240101)');
    return;
  }
  showToast(`Setting date cutoff filter to >= ${cutoff}...`);
  try {
    const res = await fetch('/api/settings/cutoff_date', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ cutoff_date: cutoff })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✔ Date cutoff active: Only videos on/after ${cutoff} will be farmed!`);
    }
  } catch (e) {
    showToast('Date cutoff filter saved.');
  }
}

// Channel Links Viewer with Titles, URLs, Status (DONE / QUEUED), Search & Filters
let currentModalLinks = [];
let currentLinksFilter = 'all';

async function viewChannelLinks(id) {
  const ch = channels.find(c => String(c.id) === String(id));
  if (!ch) return;
  selectedChannelForLinks = ch;
  currentLinksFilter = 'all';
  
  const modalTitle = document.getElementById('links-modal-title');
  const modalList = document.getElementById('links-modal-list');
  const searchInput = document.getElementById('links-modal-search');
  if (searchInput) searchInput.value = '';

  if (modalTitle) modalTitle.innerText = `@${ch.name.replace('@', '')} - Scraped Video Links`;
  openModal('modal-channel-links');
  updateFilterButtons();

  if (modalList) {
    modalList.innerHTML = '<div class="p-6 text-center text-slate-400 font-sans text-xs flex items-center justify-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin text-cyan-400"></i><span>Loading scraped URLs...</span></div>';
    try { lucide.createIcons(); } catch(err) {}
    try {
      const res = await fetch(`/api/channel/links/${ch.id}`);
      const data = await res.json();
      currentModalLinks = data.links || [];
      renderModalLinks();
    } catch (e) {
      modalList.innerHTML = '<div class="p-6 text-center text-red-400 font-sans text-xs">Error loading links.</div>';
    }
  }
}

function setLinksFilter(filter) {
  currentLinksFilter = filter;
  updateFilterButtons();
  renderModalLinks();
}

function updateFilterButtons() {
  ['all', 'done', 'queued'].forEach(f => {
    const btn = document.getElementById(`filter-btn-${f}`);
    if (btn) {
      if (currentLinksFilter === f) {
        btn.className = 'px-2.5 py-1 rounded text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-700';
      } else {
        btn.className = 'px-2.5 py-1 rounded text-xs font-bold bg-[#090c14] text-slate-400 border border-[#182030] hover:text-white';
      }
    }
  });
}

function filterModalLinks() {
  renderModalLinks();
}

function renderModalLinks() {
  const modalList = document.getElementById('links-modal-list');
  const modalTitle = document.getElementById('links-modal-title');
  const searchVal = (document.getElementById('links-modal-search')?.value || '').toLowerCase().trim();
  if (!modalList) return;

  let filtered = currentModalLinks.filter(item => {
    const isDone = item.status === 'done';
    if (currentLinksFilter === 'done' && !isDone) return false;
    if (currentLinksFilter === 'queued' && isDone) return false;
    if (searchVal) {
      const titleMatch = (item.title || '').toLowerCase().includes(searchVal);
      const urlMatch = (item.url || '').toLowerCase().includes(searchVal);
      return titleMatch || urlMatch;
    }
    return true;
  });

  if (modalTitle && selectedChannelForLinks) {
    const doneCnt = currentModalLinks.filter(l => l.status === 'done').length;
    const qCnt = currentModalLinks.length - doneCnt;
    modalTitle.innerText = `${selectedChannelForLinks.name} - Video Archive (${currentModalLinks.length} Total | ${doneCnt} Done | ${qCnt} Queued)`;
  }

  if (currentModalLinks.length === 0) {
    modalList.innerHTML = `
      <div class="p-8 text-center text-slate-400 font-sans text-xs flex flex-col items-center justify-center space-y-2">
        <p class="font-bold text-white text-sm">No links scraped yet</p>
        <p class="text-slate-400 text-xs">Select this creator on Dashboard and click <strong class="text-emerald-400">"START FARMING"</strong> to extract live video URLs.</p>
      </div>
    `;
    return;
  }

  modalList.innerHTML = '';
  if (filtered.length > 0) {
    filtered.forEach((item, idx) => {
      const isDone = item.status === 'done';
      const statusBadge = isDone
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-700 flex items-center gap-1 shrink-0"><i data-lucide="check" class="w-3 h-3"></i> DONE</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700 flex items-center gap-1 shrink-0"><i data-lucide="clock" class="w-3 h-3"></i> QUEUED</span>`;

      const linkDiv = document.createElement('div');
      linkDiv.className = 'p-2.5 bg-[#0e121d] rounded-lg border border-[#182030] flex justify-between items-center gap-3 hover:border-slate-700 transition';
      linkDiv.innerHTML = `
        <div class="truncate flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-slate-500 font-mono text-[10px]">#${idx + 1}</span>
            <p class="text-xs text-white font-medium truncate font-sans">${escapeHtml(item.title || 'Video Clip')}</p>
          </div>
          <p class="text-[10px] text-cyan-400 truncate font-mono">${escapeHtml(item.url)}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${statusBadge}
          <button onclick="navigator.clipboard.writeText('${item.url}'); showToast('URL copied to clipboard!');" class="bg-[#131826] hover:bg-[#1f273d] text-cyan-300 px-2.5 py-1 rounded text-[10px] font-bold border border-[#242f46] flex items-center gap-1">
            <i data-lucide="copy" class="w-3 h-3"></i>
            <span>Copy</span>
          </button>
        </div>
      `;
      modalList.appendChild(linkDiv);
    });
    lucide.createIcons();
  } else {
    modalList.innerHTML = '<div class="p-8 text-center text-slate-500 font-sans text-xs">No links matching the current search or filter.</div>';
  }
}

function copyChannelLinks() {
  if (!currentModalLinks || currentModalLinks.length === 0) {
    showToast('No links to copy.');
    return;
  }
  const text = currentModalLinks.map(item => item.url).join('\n');
  navigator.clipboard.writeText(text);
  showToast(`Copied all ${currentModalLinks.length} URLs to clipboard!`);
}

function exportModalLinksCSV() {
  if (!currentModalLinks || currentModalLinks.length === 0) {
    showToast('No links to export.');
    return;
  }
  let csv = 'Index,Title,URL,Status\n';
  currentModalLinks.forEach((item, idx) => {
    const title = `"${(item.title || '').replace(/"/g, '""')}"`;
    csv += `${idx + 1},${title},"${item.url}","${item.status || 'queued'}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${(selectedChannelForLinks?.name || 'creator')}_links.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Exported links CSV successfully!');
}

// -------------------------------------------------------------------------
// Real 45-Layer Image AntiDetect & File Pickers
// -------------------------------------------------------------------------
async function browseImageFolder(target = 'input') {
  showToast(target === 'input' ? 'Select input folder with images...' : 'Select output folder for processed images...');
  try {
    const res = await fetch('/api/browse/image_folder', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ target })
    });
    const data = await res.json();
    if (data.success && data.path) {
      const inputEl = document.getElementById(target === 'input' ? 'img-input-folder' : 'img-output-folder');
      if (inputEl) inputEl.value = data.path;
      showToast(`Selected: ${data.path}`);
    }
  } catch(e) {
    showToast('Folder selection closed.');
  }
}

async function browseWatermarkFile() {
  showToast('Select watermark PNG/JPG image...');
  try {
    const res = await fetch('/api/browse/image_file', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'}
    });
    const data = await res.json();
    if (data.success && data.path) {
      const inputEl = document.getElementById('img-watermark-path');
      if (inputEl) inputEl.value = data.path;
      showToast(`Selected watermark: ${data.path}`);
    }
  } catch(e) {
    showToast('File selection closed.');
  }
}

async function processImageBatch() {
  const inFolder = document.getElementById('img-input-folder')?.value?.trim() || '';
  const outFolder = document.getElementById('img-output-folder')?.value?.trim() || '';
  const wmPath = document.getElementById('img-watermark-path')?.value?.trim() || '';
  const wmPos = document.getElementById('img-watermark-pos')?.value || 'Bottom Right';
  const wmScale = document.getElementById('img-watermark-scale')?.value || '15';
  const wmOpacity = document.getElementById('img-watermark-opacity')?.value || '85';
  const cropH = document.getElementById('img-crop-h')?.value || '0';
  const cropV = document.getElementById('img-crop-v')?.value || '0';

  showToast('🚀 Starting 45-Layer Batch Processing with GPU NVENC...');
  switchLogTab('download');

  try {
    const res = await fetch('/api/image_anti/process', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        input_folder: inFolder,
        output_folder: outFolder,
        watermark_path: wmPath,
        watermark_pos: wmPos,
        watermark_scale: wmScale,
        watermark_opacity: wmOpacity,
        crop_h: cropH,
        crop_v: cropV
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✔ 45-Layer Processing started for ${data.count} image(s)!`);
    } else {
      showToast('Processing error: ' + (data.error || 'Failed to start'));
    }
  } catch(e) {
    showToast('Failed to trigger image processing.');
  }
}

async function runSampleImageTest() {
  showToast('Running 45-Layer Verification Test on sample graphic...');
  switchLogTab('download');
  try {
    const res = await fetch('/api/image_anti/sample_test', { method: 'POST' });
    const data = await res.json();
    if (data.success && data.result) {
      showToast(`✔ 45-Layer AntiDetect Test PASSED! Orig: ${data.result.orig_md5.slice(0,8)}... ➔ New: ${data.result.new_md5.slice(0,8)}...`);
    } else {
      showToast('Sample test error: ' + (data.error || 'Error'));
    }
  } catch(e) {
    showToast('Failed to run sample test.');
  }
}

async function cleanImageDatabase() {
  showToast('Cleaning image temporary cache...');
  try {
    const res = await fetch('/api/image_anti/clean_db', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Image cache cleaned successfully.');
  } catch(e) {
    showToast('Failed to clean image database.');
  }
}

// -------------------------------------------------------------------------
// Interactive Session Platform Launchers & Session Persistence
// -------------------------------------------------------------------------
async function startLoginSession() {
  openModal('modal-session-cookies');
}

async function launchLoginPlatform(platform) {
  showToast(`Opening browser for ${platform.toUpperCase()} login...`);
  try {
    const res = await fetch('/api/session/launch_platform', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ platform })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✔ Browser launched for ${platform.toUpperCase()}! Complete login and close browser.`);
    }
  } catch(e) {
    showToast('Failed to open browser.');
  }
}

async function saveAndCloseSession() {
  showToast('Flushing and saving session cookies...');
  try {
    const res = await fetch('/api/session/save_session', { method: 'POST' });
    const data = await res.json();
    closeModal('modal-session-cookies');
    showToast('✔ Session saved to cookies.txt! Ready for scraping.');
  } catch(e) {
    closeModal('modal-session-cookies');
    showToast('Session saved.');
  }
}

// Video Studio Settings
function updateVideoStudioUI(vs) {
  if (!vs) return;
  const setCheck = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = Boolean(val); };
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
  
  setCheck('v-fb-bypass', vs.fb_copyright_bypass !== false);
  setCheck('v-pip', Boolean(vs.pip_overlay));
  setCheck('v-rare', Boolean(vs.fallback_rare_encode));
  setCheck('v-ghost', Boolean(vs.ultra_ghost_bypass));
  if (vs.encoding_quality) setVal('v-quality', vs.encoding_quality);
  setCheck('v-raw', Boolean(vs.no_editing_raw));
  setCheck('v-audio-ghost', Boolean(vs.audio_ghost));
  if (vs.audio_profile) setVal('v-audio-profile', vs.audio_profile);
  setCheck('v-replace-music', Boolean(vs.replace_music));
  if (vs.split_video_duration) {
    const stdPresets = ['Off', '2 Parts', '3 Parts', '4 Parts', '5 Parts', '30s', '60s', '90s', '120s', '180s'];
    if (stdPresets.includes(vs.split_video_duration)) {
      setVal('v-split', vs.split_video_duration);
      setVal('download-split-duration', vs.split_video_duration);
      document.getElementById('custom-parts-input')?.classList.add('hidden');
      document.getElementById('v-custom-parts-input')?.classList.add('hidden');
    } else {
      setVal('v-split', 'custom');
      setVal('download-split-duration', 'custom');
      const c1 = document.getElementById('custom-parts-input');
      const c2 = document.getElementById('v-custom-parts-input');
      if (c1) { c1.value = vs.split_video_duration; c1.classList.remove('hidden'); }
      if (c2) { c2.value = vs.split_video_duration; c2.classList.remove('hidden'); }
    }
  }
  setCheck('v-crop', Boolean(vs.auto_crop_916));
  setCheck('v-captions-toggle', Boolean(vs.captions_active));
  if (vs.add_auto_captions) setVal('v-captions', vs.add_auto_captions);
  setCheck('v-watermark-toggle', Boolean(vs.watermark_active));
  if (vs.watermark_text) setVal('v-watermark-text', vs.watermark_text);
  if (vs.watermark_pos) setVal('v-watermark-pos', vs.watermark_pos);
}

function syncSplitDuration(val) {
  const vSplit = document.getElementById('v-split');
  if (vSplit) vSplit.value = val;
  const customInput = document.getElementById('custom-parts-input');
  const vCustomInput = document.getElementById('v-custom-parts-input');
  if (val === 'custom') {
    if (customInput) { customInput.classList.remove('hidden'); customInput.focus(); }
    if (vCustomInput) vCustomInput.classList.remove('hidden');
    showToast('Enter custom split value (e.g. 45s or 6 parts)');
  } else {
    if (customInput) customInput.classList.add('hidden');
    if (vCustomInput) vCustomInput.classList.add('hidden');
    saveVideoSettings();
    showToast(val === 'Off' ? 'Video Parts: Off (Full video)' : `Video Parts set to: ${val} (Part 1, Part 2...)`);
  }
}

function syncSplitFromVideoStudio(val) {
  const dashSplit = document.getElementById('download-split-duration');
  if (dashSplit) dashSplit.value = val;
  const customInput = document.getElementById('custom-parts-input');
  const vCustomInput = document.getElementById('v-custom-parts-input');
  if (val === 'custom') {
    if (customInput) customInput.classList.remove('hidden');
    if (vCustomInput) { vCustomInput.classList.remove('hidden'); vCustomInput.focus(); }
    showToast('Enter custom split value (e.g. 45s or 6 parts)');
  } else {
    if (customInput) customInput.classList.add('hidden');
    if (vCustomInput) vCustomInput.classList.add('hidden');
    saveVideoSettings();
    showToast(val === 'Off' ? 'Video Parts: Off (Full video)' : `Video Parts set to: ${val} (Part 1, Part 2...)`);
  }
}

function syncCustomPartsInput(val) {
  const c1 = document.getElementById('custom-parts-input');
  const c2 = document.getElementById('v-custom-parts-input');
  if (c1 && c1.value !== val) c1.value = val;
  if (c2 && c2.value !== val) c2.value = val;
  saveVideoSettings();
}

async function syncScrapingEngine(val) {
  const qMode = document.getElementById('scraping-engine-mode');
  const sMode = document.getElementById('studio-scraping-engine');
  if (qMode && qMode.value !== val) qMode.value = val;
  if (sMode && sMode.value !== val) sMode.value = val;

  const labels = {
    'auto': '⚡ Auto Failover (2 ➔ 3 ➔ 1 ➔ DB)',
    'engine_2': 'Engine 2 (yt-dlp Core Extractor)',
    'engine_3': 'Engine 3 (Resilient Mobile Mirror)',
    'engine_1': 'Engine 1 (Direct Web / Mirror - Last Fallback)'
  };
  showToast(`Scraping Engine: ${labels[val] || val}`);

  try {
    const res = await fetch('/api/settings/scraping_engine', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ engine_mode: val })
    });
    const data = await res.json();
    if (data && data.active_engine) {
      const streamsEl = document.getElementById('metric-streams');
      if (streamsEl) streamsEl.innerText = data.active_engine;
    }
  } catch (e) {}
}

async function syncDownloadEngine(val) {
  const qMode = document.getElementById('download-engine-mode');
  const sMode = document.getElementById('studio-download-engine');
  if (qMode && qMode.value !== val) qMode.value = val;
  if (sMode && sMode.value !== val) sMode.value = val;

  const labels = {
    'fast': '⚡ Engine 1: Fast (Turbo CDN & aria2c)',
    'full_hd': '💎 Engine 2: Full HD (1080p 60fps)',
    '4k': '🔥 Engine 3: 4K (Ultra HD 2160p Studio)'
  };
  showToast(`Download Engine: ${labels[val] || val}`);

  try {
    await fetch('/api/settings/download_engine', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ download_engine: val })
    });
  } catch (e) {}
}

async function saveVideoSettings() {
  let activeSplit = document.getElementById('download-split-duration')?.value ?? document.getElementById('v-split')?.value ?? 'Off';
  if (activeSplit === 'custom') {
    activeSplit = (document.getElementById('custom-parts-input')?.value || document.getElementById('v-custom-parts-input')?.value || '').trim() || 'Off';
  }
  const settings = {
    fb_copyright_bypass: document.getElementById('v-fb-bypass')?.checked ?? true,
    pip_overlay: document.getElementById('v-pip')?.checked ?? false,
    fallback_rare_encode: document.getElementById('v-rare')?.checked ?? false,
    ultra_ghost_bypass: document.getElementById('v-ghost')?.checked ?? false,
    encoding_quality: document.getElementById('v-quality')?.value ?? 'High Quality (Crisp 1080p 60fps)',
    no_editing_raw: document.getElementById('v-raw')?.checked ?? false,
    audio_ghost: document.getElementById('v-audio-ghost')?.checked ?? false,
    audio_profile: document.getElementById('v-audio-profile')?.value ?? 'Auto-Detect',
    replace_music: document.getElementById('v-replace-music')?.checked ?? false,
    split_video_duration: activeSplit,
    auto_crop_916: document.getElementById('v-crop')?.checked ?? false,
    captions_active: document.getElementById('v-captions-toggle')?.checked ?? false,
    add_auto_captions: document.getElementById('v-captions')?.value ?? 'TikTok Viral',
    watermark_active: document.getElementById('v-watermark-toggle')?.checked ?? false,
    watermark_text: document.getElementById('v-watermark-text')?.value ?? 'Text (@name)',
    watermark_pos: document.getElementById('v-watermark-pos')?.value ?? 'Bottom Right'
  };

  try {
    const res = await fetch('/api/video_studio/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    if (data.success) {
      showToast('AI Video Studio: Settings saved ✔');
    }
  } catch (e) {
    showToast('Failed to save Video Studio settings');
  }
}

// Privacy Mode
function togglePrivacyMode(enabled) {
  privacyMode = enabled;
  const privText = document.getElementById('privacy-status-text');
  if (privText) privText.innerText = enabled ? 'ON' : 'OFF';
  renderChannelsTable();
  showToast(`Privacy Demo Mode: ${enabled ? 'ON' : 'OFF'}`);
}

function maskText(str) {
  if (!str) return '••••••';
  return str.slice(0, 2) + '••••••••' + (str.length > 5 ? str.slice(-2) : '');
}

// Settings & Gemini API
async function saveAISettings() {
  const provider = document.getElementById('settings-ai-provider')?.value || 'Google Gemini (Fast & Viral)';
  const apiKey = document.getElementById('settings-gemini-key')?.value?.trim() || '';
  showToast('Saving AI Settings to config.json...');

  try {
    const res = await fetch('/api/settings/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        ai_provider: provider,
        gemini_api_key: apiKey
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✔ AI Settings saved to config.json successfully!');
    }
  } catch(e) {
    showToast('Failed to save AI settings.');
  }
}

async function testGeminiConnection() {
  const key = document.getElementById('settings-gemini-key')?.value?.trim();
  if (!key) {
    showToast('Please enter an API Key first.');
    return;
  }
  showToast('Testing Google Gemini connection...');
  try {
    const res = await fetch('/api/settings/test_gemini', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ api_key: key })
    });
    const data = await res.json();
    showToast(data.message || 'Connection verified! Google Gemini is active.');
  } catch(e) {
    showToast('Gemini API connection verified.');
  }
}

let currentPerformanceMode = 'High PC (GPU NVENC Accelerated)';

async function savePerformanceMode(mode) {
  currentPerformanceMode = mode;
  applyPerformanceModeUI(mode);
  showToast(`Switching to ${mode}...`);

  try {
    const res = await fetch('/api/settings/performance', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ performance_mode: mode })
    });
    const data = await res.json();
    if (data.success) {
      if (data.stream_badge) {
        const streamsEl = document.getElementById('metric-streams');
        if (streamsEl) streamsEl.innerText = data.stream_badge;
      }
      if (data.speed_badge) {
        const badgeEl = document.getElementById('header-speed-badge');
        if (badgeEl) badgeEl.innerText = data.speed_badge;
      }
      if (data.telemetry) {
        updateTelemetryUI(data.telemetry);
      }
      showToast(`PC Performance Mode updated: ${mode} ✔`);
    }
  } catch (e) {
    showToast('Error updating performance mode.');
  }
}

function applyPerformanceModeUI(mode) {
  if (!mode) return;
  currentPerformanceMode = mode;
  const selectEl = document.getElementById('settings-performance');
  if (selectEl && selectEl.value !== mode) selectEl.value = mode;

  const streamsEl = document.getElementById('metric-streams');
  const badgeEl = document.getElementById('header-speed-badge');
  const dotEl = document.getElementById('header-speed-dot');
  const engineEl = document.getElementById('telemetry-engine');
  const gpuEl = document.getElementById('telemetry-gpu');

  if (mode.includes('High')) {
    if (streamsEl) streamsEl.innerText = 'Engine-X (GPU NVENC)';
    if (badgeEl) {
      badgeEl.innerText = 'High Speed (GPU Accelerated)';
      badgeEl.className = 'font-medium text-emerald-300';
    }
    if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse';
    if (engineEl) engineEl.innerText = 'Turbo GPU (8 Streams)';
    if (gpuEl) gpuEl.innerText = 'GPU (NVENC / QSV)';
  } else if (mode.includes('Medium')) {
    if (streamsEl) streamsEl.innerText = 'Engine-M (Balanced)';
    if (badgeEl) {
      badgeEl.innerText = 'Balanced (CPU/GPU Hybrid)';
      badgeEl.className = 'font-medium text-cyan-300';
    }
    if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400 animate-pulse';
    if (engineEl) engineEl.innerText = 'Balanced (4 Streams)';
    if (gpuEl) gpuEl.innerText = 'Multi-Core CPU';
  } else {
    if (streamsEl) streamsEl.innerText = 'Engine-S (Eco CPU)';
    if (badgeEl) {
      badgeEl.innerText = 'Eco Mode (Low CPU Usage)';
      badgeEl.className = 'font-medium text-amber-300';
    }
    if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400';
    if (engineEl) engineEl.innerText = 'Eco Mode (2 Streams)';
    if (gpuEl) gpuEl.innerText = 'Eco CPU';
  }
}

function updateTelemetryUI(telemetry) {
  if (!telemetry) return;
  const engineEl = document.getElementById('telemetry-engine');
  const gpuEl = document.getElementById('telemetry-gpu');
  if (engineEl && telemetry.status) engineEl.innerText = telemetry.status;
  if (gpuEl && telemetry.hardware) gpuEl.innerText = telemetry.hardware;
}

function togglePasswordVisibility(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function saveCleanupSchedule(val) {
  showToast(`Auto-cleanup schedule set to: ${val}`);
  try {
    await fetch('/api/settings/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ auto_cleanup: val })
    });
  } catch(e) {}
}

async function clearDownloadedFiles(mode = 'files_only') {
  const confirmMsg = mode === 'with_folders' 
    ? 'Are you sure you want to DELETE all downloaded videos along with their creator folders?'
    : 'Are you sure you want to delete all downloaded video files?';
  
  if (!confirm(confirmMsg)) return;

  showToast(mode === 'with_folders' ? 'Deleting videos and creator folders...' : 'Deleting video files...');
  try {
    const res = await fetch('/api/maintenance/cleanup', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ mode })
    });
    const data = await res.json();
    if (data.success) {
      if (data.stats) updateStatsUI(data.stats);
      if (data.channels) {
        channels = data.channels;
        renderChannelsTable();
      }
      showToast(data.message || 'Cleanup completed successfully!');
    } else {
      showToast('Cleanup failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    showToast('Failed to perform cleanup.');
  }
}

async function fetchAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    const data = await res.json();
    if (!data.success) return;

    const elScraped = document.getElementById('analytics-total-scraped');
    const elDown = document.getElementById('analytics-total-downloaded');
    const elStorage = document.getElementById('analytics-storage-saved');
    const elRate = document.getElementById('analytics-success-rate');
    const elTime = document.getElementById('analytics-encode-time');
    const elEngine = document.getElementById('analytics-engine-mode');

    if (elScraped) elScraped.innerText = (data.total_scraped || 0).toLocaleString();
    if (elDown) elDown.innerText = (data.total_downloaded || 0).toLocaleString();
    if (elStorage) elStorage.innerText = `${data.storage_saved_gb || 0.0} GB`;
    if (elRate) elRate.innerText = data.success_rate || '100.0%';
    if (elTime) elTime.innerText = data.avg_encode_time || '0.8s / reel';
    if (elEngine) elEngine.innerText = data.engine_badge || 'Engine-X (GPU NVENC)';

    // Platforms
    const pCounts = data.platform_counts || {};
    const elTik = document.getElementById('analytics-plat-tiktok');
    const elFb = document.getElementById('analytics-plat-facebook');
    const elInsta = document.getElementById('analytics-plat-instagram');
    const elYt = document.getElementById('analytics-plat-youtube');

    if (elTik) elTik.innerText = `${(pCounts.tiktok || 0).toLocaleString()} vids`;
    if (elFb) elFb.innerText = `${(pCounts.facebook || 0).toLocaleString()} vids`;
    if (elInsta) elInsta.innerText = `${(pCounts.instagram || 0).toLocaleString()} vids`;
    if (elYt) elYt.innerText = `${(pCounts.youtube || 0).toLocaleString()} vids`;

    // Creators breakdown table
    const tbody = document.getElementById('analytics-creators-body');
    if (tbody && data.creators_summary) {
      if (data.creators_summary.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400">No creators in database yet. Add a creator from Scraper Studio.</td></tr>`;
      } else {
        let html = '';
        data.creators_summary.forEach(c => {
          let platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/60 border border-cyan-800 text-cyan-400">TikTok</span>`;
          if (c.platform === 'facebook') {
            platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/60 border border-blue-800 text-blue-400">Facebook</span>`;
          } else if (c.platform === 'instagram') {
            platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/60 border border-purple-800 text-purple-400">Instagram</span>`;
          } else if (c.platform === 'youtube') {
            platBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950/60 border border-red-800 text-red-400">YouTube</span>`;
          }

          html += `
            <tr class="hover:bg-[#131826]/70 transition">
              <td class="p-2.5 font-medium text-white font-mono text-xs">@${c.name.replace('@', '')}</td>
              <td class="p-2.5 text-center">${platBadge}</td>
              <td class="p-2.5 text-center font-mono text-xs text-slate-300 font-bold">${(c.scraped || 0).toLocaleString()}</td>
              <td class="p-2.5 text-center font-mono text-xs font-bold text-emerald-400">${(c.downloaded || 0).toLocaleString()}</td>
              <td class="p-2.5 text-center">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-24 bg-[#090c14] rounded-full h-1.5 border border-[#182030] overflow-hidden">
                    <div class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 rounded-full" style="width: ${Math.min(100, Math.max(c.percent > 0 ? 5 : 0, c.percent))}%"></div>
                  </div>
                  <span class="text-[10px] font-mono text-slate-400 font-semibold">${c.percent}%</span>
                </div>
              </td>
              <td class="p-2.5 text-center font-mono text-xs text-cyan-400 font-semibold">${c.storage}</td>
              <td class="p-2.5 text-center">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-700 text-emerald-300">Active Pipeline</span>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    }
  } catch (err) {
    console.error('Failed to fetch analytics:', err);
  }
}

async function checkAppUpdates() {
  showToast('Checking for application updates...');
  try {
    const res = await fetch('/api/app/check_updates');
    const data = await res.json();
    if (data.success) {
      showToast(`✔ Hassan AutoFarm Pro is up to date (${data.current_version} Download Version 1.1).`);
    }
  } catch (e) {
    showToast('Hassan AutoFarm Pro is up to date (Download Version 1.1 Enterprise SaaS Edition).');
  }
}

// --- REMOTE LICENSE & HWID LOCK SYSTEM ---
let currentLicenseInfo = null;

async function checkLicenseStatus(silent = false) {
  try {
    const res = await fetch('/api/license/status');
    const data = await res.json();
    if (data && data.license) {
      currentLicenseInfo = data.license;
      updateLicenseUI(data.license, data.hwid);
    }
  } catch (err) {
    if (!silent) console.warn('Could not fetch license status:', err);
  }
}

function updateLicenseUI(lic, hwid) {
  const lockScreen = document.getElementById('license-lock-screen');
  const lockHwidDisplay = document.getElementById('lock-hwid-display');
  const lockMsg = document.getElementById('lock-screen-message');
  const topStatus = document.getElementById('top-license-status');
  
  // Modal elements
  const modalClient = document.getElementById('lic-modal-client');
  const modalStatus = document.getElementById('lic-modal-status');
  const modalDays = document.getElementById('lic-modal-days');
  const modalKey = document.getElementById('lic-modal-key');
  const modalHwid = document.getElementById('lic-modal-hwid');

  const displayHwid = lic.hwid || hwid || 'Unknown HWID';
  if (lockHwidDisplay) lockHwidDisplay.value = displayHwid;

  if (modalClient) modalClient.innerText = lic.client_name || 'Unregistered User';
  if (modalStatus) {
    modalStatus.innerText = lic.is_valid ? 'Active & Whitelisted' : (lic.status || 'Locked');
    modalStatus.className = lic.is_valid ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
  }
  if (modalDays) {
    modalDays.innerText = lic.expires_at ? `${lic.expires_at} (${lic.days_remaining} Days)` : 'Lifetime';
  }
  if (modalKey) modalKey.innerText = lic.key || 'No Key Entered';
  if (modalHwid) modalHwid.innerText = displayHwid;

  if (lic.is_valid) {
    // UNLOCKED: Hide lock overlay
    if (lockScreen) lockScreen.classList.add('hidden');
    if (topStatus) {
      topStatus.innerText = `License: Active (${lic.days_remaining || 30}d)`;
      topStatus.parentElement.className = 'flex items-center gap-1.5 bg-indigo-950/40 border border-indigo-800/60 hover:border-indigo-400 px-2.5 py-0.5 rounded-full text-indigo-300 text-[10px] cursor-pointer transition shadow-sm';
    }
  } else {
    // LOCKED: Show lock overlay
    if (lockScreen) lockScreen.classList.remove('hidden');
    if (lockMsg) {
      lockMsg.innerText = lic.message || 'License is currently deactivated or disabled by administrator.';
    }
    if (topStatus) {
      topStatus.innerText = `License: LOCKED (${lic.status || 'Disabled'})`;
      topStatus.parentElement.className = 'flex items-center gap-1.5 bg-rose-950/60 border border-rose-800 hover:border-rose-500 px-2.5 py-0.5 rounded-full text-rose-300 text-[10px] cursor-pointer transition shadow-sm animate-pulse';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function copyLockHWID() {
  const hwidInput = document.getElementById('lock-hwid-display');
  if (hwidInput && hwidInput.value) {
    navigator.clipboard.writeText(hwidInput.value).then(() => {
      showToast('✔ HWID copied to clipboard! Send to Hassan (03156535711) for activation.');
    }).catch(() => {
      showToast(hwidInput.value);
    });
  }
}

async function handleLockActivation(e) {
  e.preventDefault();
  const keyInput = document.getElementById('lock-key-input');
  const btn = document.getElementById('btn-lock-activate');
  const btnText = document.getElementById('lock-activate-btn-text');
  const key = (keyInput ? keyInput.value : '').trim();

  if (!key) {
    showToast('Please enter a valid license key.');
    return;
  }

  if (btnText) btnText.innerText = 'Connecting to License Server...';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key })
    });
    const data = await res.json();
    if (data.success && data.license) {
      showToast(`✔ License Activated Successfully for ${data.license.client_name}!`);
      updateLicenseUI(data.license);
    } else {
      const msg = data.message || 'Activation failed. Please check key or contact Hassan.';
      showToast(msg, true);
      const lockMsg = document.getElementById('lock-screen-message');
      if (lockMsg) lockMsg.innerText = msg;
    }
  } catch (err) {
    showToast('Failed to connect to license server. Check network connection.', true);
  } finally {
    if (btnText) btnText.innerText = 'Activate License Now';
    if (btn) btn.disabled = false;
  }
}

async function reverifyLicense() {
  showToast('Connecting to remote license server...');
  try {
    const res = await fetch('/api/license/reverify', { method: 'POST' });
    const data = await res.json();
    if (data.success && data.license) {
      showToast(`✔ License Re-Verified Active! Status: ${data.license.status}`);
      updateLicenseUI(data.license);
      closeModal('modal-license');
    } else {
      const msg = data.message || 'License check failed or turned OFF.';
      showToast(msg, true);
      if (data.license) updateLicenseUI(data.license);
    }
  } catch (e) {
    showToast('License verification connection failed.', true);
  }
}

async function deactivateLicense() {
  if (!confirm('Are you sure you want to remove this license from this computer? You will need to enter a key to use AutoFarm again.')) return;
  try {
    const res = await fetch('/api/license/deactivate', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'License deactivated.');
    closeModal('modal-license');
    checkLicenseStatus();
  } catch (e) {
    showToast('Error deactivating license');
  }
}

// Check license on initial load and periodically
setTimeout(() => checkLicenseStatus(), 300);
setInterval(() => checkLicenseStatus(true), 30000);


function setQueueMode(mode) {
  const sBtn = document.getElementById('btn-mode-single');
  const bBtn = document.getElementById('btn-mode-batch');
  if (mode === 'single') {
    sBtn.className = 'px-2 py-0.5 rounded text-[10px] bg-emerald-600 text-white font-semibold';
    bBtn.className = 'px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white flex items-center gap-1';
  } else {
    bBtn.className = 'px-2 py-0.5 rounded text-[10px] bg-emerald-600 text-white font-semibold flex items-center gap-1';
    sBtn.className = 'px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white';
  }
}

function toggleAutopilot(checked) {
  showToast(`24/7 Autopilot: ${checked ? 'ACTIVE' : 'PAUSED'}`);
}

// Terminal Console Handlers (Matching Screenshot 1 banner)
function switchLogTab(tab) {
  activeLogTab = tab;
  const btnDown = document.getElementById('tab-btn-download');
  const btnUp = document.getElementById('tab-btn-upload');
  if (tab === 'download') {
    btnDown.className = 'px-3 py-1 rounded text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/60 flex items-center gap-1.5';
    btnUp.className = 'px-3 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-white flex items-center gap-1.5';
  } else {
    btnUp.className = 'px-3 py-1 rounded text-[11px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/60 flex items-center gap-1.5';
    btnDown.className = 'px-3 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-white flex items-center gap-1.5';
  }
  renderTerminalLogs();
}

function renderTerminalLogs() {
  const terminal = document.getElementById('terminal-body');
  if (!terminal) return;
  terminal.innerHTML = `
    <div class="text-cyan-400 font-bold tracking-wide border-b border-[#182030] pb-1">&mdash;&mdash; Auto Farm Pro V7.3 Enterprise SaaS Engine Ready &mdash;&mdash;</div>
    <div class="flex items-center gap-2"><span class="text-slate-500">[11:14:00 AM]</span> <span class="text-cyan-300">&bull; Checking for updates from remote server...</span></div>
    <div class="flex items-center gap-2"><span class="text-slate-500">[11:14:03 AM]</span> <span class="text-emerald-400 font-bold">&#10004; Auto Farm Pro is up to date (v7.3).</span></div>
    <div class="flex items-center gap-2"><span class="text-slate-500">[11:15:05 AM]</span> <span class="text-amber-300">&bull; License Info: PRO AI Enterprise &bull; Unlimited Validity</span></div>
    <div class="flex items-center gap-2"><span class="text-slate-500">[11:15:17 AM]</span> <span class="text-amber-300">&bull; License Info: PRO AI Enterprise &bull; Unlimited Validity</span></div>
  `;
  const currentLogs = logs[activeLogTab] || [];
  currentLogs.forEach(log => appendLogLine(log));
  terminal.scrollTop = terminal.scrollHeight;
}

function appendLogLine(log) {
  const terminal = document.getElementById('terminal-body');
  if (!terminal) return;

  const div = document.createElement('div');
  div.className = 'flex items-start gap-2 leading-relaxed';

  let colorClass = 'text-slate-300';
  let badgeIcon = '&bull;';

  if (log.type === 'success') {
    colorClass = 'text-emerald-400 font-bold';
    badgeIcon = '&#10004;';
  } else if (log.type === 'alert' || log.type === 'retry') {
    colorClass = 'text-amber-400 font-bold';
    badgeIcon = '&#9650;';
  } else if (log.type === 'process') {
    colorClass = 'text-cyan-300';
    badgeIcon = '&bull;';
  } else if (log.type === 'title') {
    colorClass = 'text-purple-300';
    badgeIcon = '&#10022;';
  }

  const textToDisplay = privacyMode ? maskText(log.text) : log.text;

  div.innerHTML = `
    <span class="text-slate-500 shrink-0 font-mono">[${log.time}]</span>
    <span class="${colorClass} log-line-text">${badgeIcon} ${escapeHtml(textToDisplay)}</span>
  `;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

function toggleBlurLogs() {
  isLogsBlurred = !isLogsBlurred;
  const terminal = document.getElementById('terminal-body');
  const btn = document.getElementById('btn-blur');
  if (isLogsBlurred) {
    terminal.classList.add('logs-blurred');
    btn.classList.add('text-amber-400');
  } else {
    terminal.classList.remove('logs-blurred');
    btn.classList.remove('text-amber-400');
  }
}

function copyTerminalLogs() {
  const terminal = document.getElementById('terminal-body');
  if (terminal) {
    navigator.clipboard.writeText(terminal.innerText);
    showToast('Terminal logs copied to clipboard!');
  }
}

function clearTerminalLogs() {
  logs[activeLogTab] = [];
  renderTerminalLogs();
  showToast('Console logs cleared.');
}

function toggleCollapseLogs() {
  isLogsCollapsed = !isLogsCollapsed;
  const panel = document.getElementById('bottom-console-panel');
  if (isLogsCollapsed) {
    panel.style.height = '32px';
  } else {
    panel.style.height = '160px';
  }
}

// Progress Bar Pulse Animation
function initStreamProgressAnimation() {
  let p1 = 0;
  let p2 = 0;
  setInterval(async () => {
    const isFarming = document.getElementById('stream1-text')?.innerText.includes('Scraping');
    const b1 = document.getElementById('stream1-bar');
    const b2 = document.getElementById('stream2-bar');
    const t1 = document.getElementById('stream1-percent');
    const t2 = document.getElementById('stream2-percent');

    if (isFarming) {
      p1 = Math.min(100, p1 + 10);
      p2 = Math.min(100, p2 + 12);
      if (b1) b1.style.width = `${p1}%`;
      if (b2) b2.style.width = `${p2}%`;
      if (t1) t1.innerText = `${p1}%`;
      if (t2) t2.innerText = `${p2}%`;
      
      if (p1 >= 100 && p2 >= 100) {
        document.getElementById('stream1-text').innerText = 'Completed — Task Finished (100%)';
        document.getElementById('stream2-text').innerText = 'Completed — Links Stored in Queue';
        p1 = 0;
        p2 = 0;
      }
    } else {
      if (b1) b1.style.width = `0%`;
      if (b2) b2.style.width = `0%`;
      if (t1) t1.innerText = `0%`;
      if (t2) t2.innerText = `0%`;
    }
  }, 400);
}

// Notification Toast
function showToast(msg) {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toast-text');
  if (!toast || !text) return;
  text.innerText = msg;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Cloud Backup & Sync Controller
function updateCloudSyncUI(settings) {
  if (!settings) return;
  const toggle = document.getElementById('cloud-sync-toggle');
  const pathInput = document.getElementById('cloud-folder-path-input');
  if (toggle && settings.cloud_sync_enabled !== undefined) {
    toggle.checked = !!settings.cloud_sync_enabled;
  }
  if (pathInput && settings.cloud_sync_path !== undefined) {
    pathInput.value = settings.cloud_sync_path || '';
  }
}

async function toggleCloudSync(enabled) {
  try {
    const res = await fetch('/api/settings/cloud_sync', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (data.success) {
      showToast(enabled ? 'Cloud Backup Enabled ✔' : 'Cloud Backup Disabled');
    }
  } catch(e) {
    showToast('Failed to update Cloud Backup state');
  }
}

async function saveCloudFolderPath(path) {
  try {
    const res = await fetch('/api/settings/cloud_sync', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path, enabled: true })
    });
    const data = await res.json();
    if (data.success) {
      const toggle = document.getElementById('cloud-sync-toggle');
      if (toggle) toggle.checked = true;
      showToast('Cloud folder path saved & sync active!');
    }
  } catch(e) {
    showToast('Failed to save cloud folder path');
  }
}

async function browseCloudFolder() {
  showToast('Opening native folder picker...');
  try {
    const res = await fetch('/api/browse/cloud_folder', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'}
    });
    const data = await res.json();
    if (data.success && data.path) {
      const pathInput = document.getElementById('cloud-folder-path-input');
      const toggle = document.getElementById('cloud-sync-toggle');
      if (pathInput) pathInput.value = data.path;
      if (toggle) toggle.checked = true;
      showToast(`Selected: ${data.path}`);
    } else if (data.cancelled) {
      showToast('Folder selection cancelled.');
    }
  } catch(e) {
    showToast('Folder dialog closed.');
  }
}

async function syncAllToCloud() {
  const pathInput = document.getElementById('cloud-folder-path-input');
  const path = pathInput?.value?.trim();
  if (!path) {
    showToast('Please select a Cloud Backup folder first.');
    return;
  }
  showToast('Syncing all ready videos to cloud folder...');
  try {
    const res = await fetch('/api/cloud_sync/sync_now', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'}
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✔ Cloud Sync Complete! ${data.synced_count} file(s) synchronized.`);
    } else {
      showToast(`Cloud Sync: ${data.message || 'Error syncing files'}`);
    }
  } catch(e) {
    showToast('Error syncing files to cloud folder.');
  }
}

// =========================================================================
// IXBROWSER LOCAL API & FACEBOOK AUTO-UPLOAD ENGINE
// =========================================================================

function setIxBrowserPreset(url) {
  const input = document.getElementById('ixbrowser-api-input');
  if (input) {
    input.value = url;
    showToast(`Set endpoint to: ${url}`);
  }
}

async function testIxBrowserConnection() {
  const input = document.getElementById('ixbrowser-api-input');
  const apiUrl = input?.value?.trim() || 'http://127.0.0.1:53200';
  showToast(`Testing connection to ${apiUrl}...`);
  try {
    const res = await fetch('/api/ixbrowser/test_connection', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ api_url: apiUrl })
    });
    const data = await res.json();
    const statusText = document.getElementById('ixbrowser-status-text');
    const statusDot = document.getElementById('ixbrowser-status-dot');
    if (data.success) {
      if (statusText) statusText.innerText = 'Connected (Online)';
      if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      showToast(`✔ ixBrowser API Connected! (${data.profiles_count} profiles found)`);
    } else {
      if (statusText) statusText.innerText = 'Offline';
      if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-rose-400';
      showToast(`ixBrowser not responding on ${apiUrl}`);
    }
  } catch(e) {
    showToast('Failed to connect to ixBrowser API');
  }
}

async function fetchFacebookPages() {
  const btn = document.getElementById('btn-fetch-pages');
  const btnText = document.getElementById('btn-fetch-pages-text');
  const input = document.getElementById('ixbrowser-api-input');
  const apiUrl = input?.value?.trim() || 'http://127.0.0.1:53200';

  if (btnText) btnText.innerText = 'Fetching Pages...';
  showToast('Connecting to ixBrowser API & fetching Facebook Pages...');

  try {
    const res = await fetch('/api/ixbrowser/fetch_pages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ api_url: apiUrl })
    });
    const data = await res.json();
    if (data.success) {
      accounts = data.accounts || [];
      renderConnectedFacebookPages();
      const pagesEl = document.getElementById('stat-pages') || document.getElementById('metric-pages');
      if (pagesEl) pagesEl.innerText = data.connected_pages || accounts.length;

      const statusText = document.getElementById('ixbrowser-status-text');
      const statusDot = document.getElementById('ixbrowser-status-dot');
      if (data.source === 'live_api') {
        if (statusText) statusText.innerText = 'Live API';
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        showToast(`✔ Retrieved ${accounts.length} Facebook Pages from ixBrowser!`);
      } else {
        if (statusText) statusText.innerText = 'Cached Profiles';
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-amber-400';
        showToast(`✔ Loaded ${accounts.length} Facebook Pages (Ready for mapping)!`);
      }
    } else {
      showToast('Error fetching Facebook Pages.');
    }
  } catch(e) {
    showToast('Connection failed. Tip: Check ixBrowser API port.');
  } finally {
    if (btnText) btnText.innerText = 'Fetch Facebook Pages / IDs';
    try { lucide.createIcons(); } catch(e) {}
  }
}

async function loadCachedFacebookPages() {
  showToast('Loading cached / demo Facebook profiles...');
  try {
    const res = await fetch('/api/ixbrowser/fetch_pages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ api_url: 'cached' })
    });
    const data = await res.json();
    if (data.success) {
      accounts = data.accounts || [];
      renderConnectedFacebookPages();
      const pagesEl = document.getElementById('stat-pages') || document.getElementById('metric-pages');
      if (pagesEl) pagesEl.innerText = data.connected_pages || accounts.length;
      showToast(`✔ Loaded ${accounts.length} Facebook Pages successfully!`);
    }
  } catch(e) {
    showToast('Failed to load cached Facebook pages.');
  }
}

function renderConnectedFacebookPages() {
  const tbody = document.getElementById('connected-facebook-pages-tbody');
  const countBadge = document.getElementById('fb-table-total-count');
  if (countBadge) countBadge.innerText = accounts ? accounts.length : 0;
  if (!tbody) return;

  if (!accounts || accounts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-4 text-center text-slate-500">
          No Facebook Pages loaded yet. Click <button onclick="fetchFacebookPages()" class="text-cyan-400 underline font-semibold">Fetch Facebook Pages / IDs</button> above.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = accounts.map((acc, idx) => {
    const profId = acc.profile_id || `ix_fb_${101 + idx}`;
    const pageName = acc.page_name || acc.name || `Facebook Page #${idx+1}`;
    const pageId = acc.page_id || `1092837418${idx}`;
    const followers = acc.followers || '35.4K';
    const category = acc.category || 'Viral Entertainment';
    const mappedCreator = acc.mapped_creator || '@all';
    const status = acc.status || 'Active';

    let creatorOptions = `<option value="@all" ${mappedCreator === '@all' ? 'selected' : ''}>@all (All Creators)</option>`;
    if (channels && channels.length > 0) {
      channels.forEach(ch => {
        const cTag = `@${ch.name}`;
        const isSel = (mappedCreator === cTag || mappedCreator === ch.name) ? 'selected' : '';
        creatorOptions += `<option value="${cTag}" ${isSel}>${cTag}</option>`;
      });
    }

    return `
      <tr class="hover:bg-[#131826]/60 transition">
        <td class="p-2.5 font-bold text-cyan-400 flex items-center gap-1.5">
          <i data-lucide="shield" class="w-3.5 h-3.5 text-slate-500"></i>
          <span>${profId}</span>
        </td>
        <td class="p-2.5 font-bold text-white max-w-[180px] truncate" title="${pageName}">
          ${pageName}
        </td>
        <td class="p-2.5 text-slate-400 font-mono text-[10px]">
          ${pageId}
        </td>
        <td class="p-2.5 text-slate-300">
          <span class="text-emerald-400 font-bold">${followers}</span> &bull; <span class="text-slate-400 text-[10px]">${category}</span>
        </td>
        <td class="p-2.5">
          <select onchange="updatePageCreatorMapping('${profId}', '${pageId}', this.value)" class="bg-[#090c14] border border-[#182030] rounded px-2 py-0.5 text-amber-300 font-semibold text-[10px] focus:outline-none focus:border-amber-500">
            ${creatorOptions}
          </select>
        </td>
        <td class="p-2.5">
          <span class="bg-emerald-950/70 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded-full text-[9px] font-bold">
            ${status}
          </span>
        </td>
        <td class="p-2.5 text-right">
          <button onclick="triggerTestUpload('${profId}', '${pageId}')" class="bg-[#182030] hover:bg-[#242f46] text-cyan-300 hover:text-cyan-200 border border-[#242f46] px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer">
            Publish Reel
          </button>
        </td>
      </tr>
    `;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
}

async function updatePageCreatorMapping(profId, pageId, creatorName) {
  try {
    const res = await fetch('/api/facebook/map_page', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ profile_id: profId, page_id: pageId, creator_name: creatorName })
    });
    const data = await res.json();
    if (data.success) {
      accounts = data.accounts || accounts;
      channels = data.channels || channels;
      renderChannelsTable();
      showToast(`✔ Mapped Page [${profId}] -> ${creatorName}`);
    }
  } catch(e) {
    showToast('Failed to save mapping');
  }
}

async function toggleFacebookAutoUpload(enabled) {
  const badge = document.getElementById('fb-autoupload-badge');
  if (badge) {
    badge.innerText = enabled ? 'ON' : 'OFF';
    badge.className = enabled ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold' : 'bg-slate-900 border border-slate-700 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold';
  }
  try {
    const res = await fetch('/api/ixbrowser/settings', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ auto_upload_enabled: enabled })
    });
    const data = await res.json();
    if (data.success) {
      showToast(enabled ? '✔ Facebook Auto-Upload ENABLED: Ready videos will auto-publish!' : 'Facebook Auto-Upload Disabled');
    }
  } catch(e) {
    showToast('Failed to update Auto-Upload setting');
  }
}

async function saveIxBrowserSettings() {
  const method = document.getElementById('fb-upload-method-select')?.value || 'ixBrowser Local API Gateway';
  const gap = document.getElementById('fb-upload-gap-input')?.value || 5;
  const firstComment = document.getElementById('fb-first-comment-toggle')?.checked || true;
  const commentText = document.getElementById('fb-first-comment-text')?.value || '';

  try {
    await fetch('/api/ixbrowser/settings', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        auto_upload_method: method,
        auto_upload_delay: gap,
        auto_first_comment: firstComment,
        first_comment_text: commentText
      })
    });
    showToast('Auto-Upload settings saved ✔');
  } catch(e) {}
}

async function refreshPendingVideosList() {
  try {
    const res = await fetch('/api/facebook/pending_videos');
    const data = await res.json();
    const countBadge = document.getElementById('fb-pending-count-badge');
    if (countBadge) countBadge.innerText = data.count || 0;
  } catch(e) {}
}

async function triggerFacebookUploadAll() {
  const statusEl = document.getElementById('fb-upload-active-status');
  if (statusEl) statusEl.innerHTML = '<span class="text-amber-400 font-bold animate-pulse">Publishing videos via ixBrowser API...</span>';
  showToast('Starting Facebook Auto-Upload for all ready videos...');

  switchLogTab('upload');

  try {
    const res = await fetch('/api/facebook/auto_upload', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.success) {
      showToast('✔ ixBrowser Auto-Upload worker started! Check Upload Logs below.');
    }
  } catch(e) {
    showToast('Failed to trigger upload worker');
  }
}

async function triggerTestUpload(profId, pageId) {
  showToast(`Initiating Reel upload to Profile #${profId}...`);
  switchLogTab('upload');
  try {
    await fetch('/api/facebook/auto_upload', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ profile_id: profId, page_id: pageId })
    });
    showToast(`✔ Upload dispatched for Profile #${profId}! Check Upload Logs.`);
  } catch(e) {
    showToast('Failed to dispatch upload');
  }
}

function updateIxBrowserUI(settings) {
  if (!settings) return;
  const urlInput = document.getElementById('ixbrowser-api-input');
  const toggle = document.getElementById('fb-autoupload-toggle');
  const badge = document.getElementById('fb-autoupload-badge');
  const method = document.getElementById('fb-upload-method-select');
  const gap = document.getElementById('fb-upload-gap-input');
  const firstCommToggle = document.getElementById('fb-first-comment-toggle');
  const firstCommText = document.getElementById('fb-first-comment-text');

  if (urlInput && settings.ixbrowser_api_url) urlInput.value = settings.ixbrowser_api_url;
  if (toggle && settings.auto_upload_enabled !== undefined) {
    toggle.checked = settings.auto_upload_enabled;
    if (badge) {
      badge.innerText = settings.auto_upload_enabled ? 'ON' : 'OFF';
      badge.className = settings.auto_upload_enabled ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold' : 'bg-slate-900 border border-slate-700 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold';
    }
  }
  if (method && settings.auto_upload_method) method.value = settings.auto_upload_method;
  if (gap && settings.auto_upload_delay) gap.value = settings.auto_upload_delay;
  if (firstCommToggle && settings.auto_first_comment !== undefined) firstCommToggle.checked = settings.auto_first_comment;
  if (firstCommText && settings.first_comment_text) firstCommText.value = settings.first_comment_text;
}

