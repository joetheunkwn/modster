/* ══════════════════════════════════════════════
   GARAGE — App Engine
   IndexedDB, Mod CRUD, Navigation, Drag-Reorder, Export
   ══════════════════════════════════════════════ */

/* ── State ── */
let mods = [];
let carImage = null;
let activeFilter = 'all';
let dragIdx = null;

/* ══════════════════════════════════════════════
   INDEXEDDB — Persistent Storage
   ══════════════════════════════════════════════ */
const DB_NAME = 'GarageApp';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('data', 'readonly');
    const req = tx.objectStore('data').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('data', 'readwrite');
    tx.objectStore('data').put(value, key);
    tx.oncomplete = () => resolve();
  });
}

/* ── Save / Load ── */
async function saveMods() {
  await dbSet('mods', mods);
}

async function saveCarImage(base64) {
  carImage = base64;
  await dbSet('carImage', base64);
}

async function loadData() {
  const [savedMods, savedImage] = await Promise.all([
    dbGet('mods'),
    dbGet('carImage')
  ]);
  mods = savedMods || [];
  carImage = savedImage || null;
  applyCarImage();
  renderMods();
  renderGarage();
  updateUploadZone();
}

/* ══════════════════════════════════════════════
   CAR IMAGE
   ══════════════════════════════════════════════ */
const fileInput = document.getElementById('fileInput');
const carBg = document.getElementById('carBg');

function applyCarImage() {
  if (carImage) {
    carBg.style.backgroundImage = `url(${carImage})`;
    carBg.classList.remove('empty');
  } else {
    carBg.style.backgroundImage = '';
    carBg.classList.add('empty');
  }
}

function updateUploadZone() {
  const zone = document.getElementById('uploadZone');
  zone.style.display = carImage ? 'none' : 'flex';
}

function triggerUpload() {
  fileInput.click();
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    await saveCarImage(ev.target.result);
    applyCarImage();
    updateUploadZone();
    renderGarage();
    showToast('Car photo updated');
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
});

// Wire upload buttons
document.getElementById('uploadBtn').addEventListener('click', triggerUpload);
document.getElementById('uploadZone').addEventListener('click', triggerUpload);
document.getElementById('garageUploadBtn').addEventListener('click', triggerUpload);

/* ══════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════ */
const navItems = document.querySelectorAll('.nav-item');

function setActiveNav(screenName) {
  navItems.forEach(n => {
    n.classList.toggle('active', n.dataset.screen === screenName);
  });
}

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.screen;

    if (target === 'add') {
      openAddModal();
      return;
    }

    // Switch screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + target).classList.add('active');
    setActiveNav(target);
  });
});

/* ══════════════════════════════════════════════
   ADD MOD MODAL
   ══════════════════════════════════════════════ */
const addModal = document.getElementById('addModModal');
let editingModId = null;
let selectedStatus = 'planned';

function openAddModal(modId) {
  editingModId = modId || null;
  const nameInput = document.getElementById('modNameInput');
  const catInput = document.getElementById('modCategoryInput');

  if (editingModId) {
    const mod = mods.find(m => m.id === editingModId);
    if (mod) {
      nameInput.value = mod.name;
      catInput.value = mod.category;
      selectedStatus = mod.status;
      document.querySelector('.modal-title').textContent = 'Edit Modification';
    }
  } else {
    nameInput.value = '';
    catInput.value = 'Wheels';
    selectedStatus = 'planned';
    document.querySelector('.modal-title').textContent = 'Add Modification';
  }

  updateStatusSelector();
  addModal.classList.add('open');
  setTimeout(() => nameInput.focus(), 100);
}

function closeAddModal() {
  addModal.classList.remove('open');
  editingModId = null;

  // FIX: Reset nav highlight to whichever screen is currently visible
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    const screenId = activeScreen.id.replace('screen-', '');
    setActiveNav(screenId);
  }
}

// Status selector
const statusOptions = document.querySelectorAll('.status-option');
statusOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    selectedStatus = opt.dataset.status;
    updateStatusSelector();
  });
});

function updateStatusSelector() {
  statusOptions.forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.status === selectedStatus);
  });
}

// Save mod
document.getElementById('saveModBtn').addEventListener('click', async () => {
  const name = document.getElementById('modNameInput').value.trim();
  const category = document.getElementById('modCategoryInput').value;

  if (!name) {
    showToast('Enter a mod name');
    return;
  }

  if (editingModId) {
    const mod = mods.find(m => m.id === editingModId);
    if (mod) {
      mod.name = name;
      mod.category = category;
      mod.status = selectedStatus;
    }
    showToast('Mod updated');
  } else {
    mods.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      category,
      status: selectedStatus,
      created: Date.now()
    });
    showToast('Mod added');
  }

  await saveMods();
  renderMods();
  closeAddModal();
});

document.getElementById('cancelModBtn').addEventListener('click', closeAddModal);

// Close on overlay click
addModal.addEventListener('click', (e) => {
  if (e.target === addModal) closeAddModal();
});

/* ══════════════════════════════════════════════
   MOD RENDERING
   ══════════════════════════════════════════════ */
const CATEGORIES = ['All', 'Wheels', 'Aero', 'Engine', 'Exhaust', 'Suspension', 'Brakes', 'Interior', 'Exterior', 'Lighting', 'Audio', 'Other'];

const SEARCH_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const WRENCH_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
const CAMERA_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

function renderMods() {
  // Build count
  document.getElementById('buildCount').textContent = mods.length + (mods.length === 1 ? ' mod' : ' mods');

  // Progress
  const progressWrap = document.getElementById('progressWrap');
  if (mods.length > 0) {
    progressWrap.style.display = 'block';
    const installed = mods.filter(m => m.status === 'installed').length;
    const pct = Math.round((installed / mods.length) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = pct + '% installed';
    document.getElementById('progressNums').textContent = installed + ' / ' + mods.length;
  } else {
    progressWrap.style.display = 'none';
  }

  // Filter bar
  renderFilters();

  // Filter mods
  const filtered = activeFilter === 'all'
    ? mods
    : mods.filter(m => m.category.toLowerCase() === activeFilter);

  // Mod list — FIX: don't destroy buildEmpty with innerHTML
  const list = document.getElementById('modList');
  const empty = document.getElementById('buildEmpty');

  if (mods.length === 0) {
    // Remove all mod-item elements but keep buildEmpty
    list.querySelectorAll('.mod-item').forEach(el => el.remove());
    // Also remove any no-results messages
    list.querySelectorAll('.build-empty-dynamic').forEach(el => el.remove());
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  // Remove previous dynamic elements
  list.querySelectorAll('.mod-item').forEach(el => el.remove());
  list.querySelectorAll('.build-empty-dynamic').forEach(el => el.remove());

  if (filtered.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'build-empty build-empty-dynamic';
    noResults.innerHTML = `<div class="empty-icon">${SEARCH_SVG}</div>No mods in this category`;
    list.appendChild(noResults);
    return;
  }

  // Build mod items
  filtered.forEach((mod, i) => {
    const div = document.createElement('div');
    div.className = 'mod-item';
    div.dataset.id = mod.id;
    div.dataset.idx = i;
    div.draggable = true;
    div.innerHTML = `
      <div class="mod-grip">⠿</div>
      <div class="mod-info" onclick="openAddModal('${mod.id}')">
        <div class="mod-name">${esc(mod.name)}</div>
        <div class="mod-category">${mod.category}</div>
      </div>
      <button class="mod-status ${mod.status}" onclick="cycleStatus('${mod.id}')">${mod.status}</button>
      <div class="mod-actions">
        <button class="mod-delete" onclick="deleteMod('${mod.id}')">✕</button>
      </div>`;
    list.appendChild(div);
  });

  // Set up drag events
  setupDrag();
}

function renderFilters() {
  const bar = document.getElementById('filterBar');
  // Only show categories that have mods
  const usedCats = new Set(mods.map(m => m.category));
  const showCats = CATEGORIES.filter(c => c === 'All' || usedCats.has(c));

  if (showCats.length <= 2) {
    bar.innerHTML = '';
    return;
  }

  bar.innerHTML = showCats.map(c => {
    const val = c.toLowerCase();
    return `<button class="filter-chip${activeFilter === val ? ' active' : ''}" onclick="setFilter('${val}')">${c}</button>`;
  }).join('');
}

function setFilter(cat) {
  activeFilter = cat;
  renderMods();
}

/* ── Status Cycling ── */
const STATUS_CYCLE = ['planned', 'ordered', 'installed'];

async function cycleStatus(id) {
  const mod = mods.find(m => m.id === id);
  if (!mod) return;
  const idx = STATUS_CYCLE.indexOf(mod.status);
  mod.status = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  await saveMods();
  renderMods();
}

/* ── Delete Mod ── */
async function deleteMod(id) {
  mods = mods.filter(m => m.id !== id);
  await saveMods();
  renderMods();
  showToast('Mod removed');
}

/* ══════════════════════════════════════════════
   DRAG & DROP REORDER
   ══════════════════════════════════════════════ */
function setupDrag() {
  const items = document.querySelectorAll('.mod-item[draggable]');

  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragIdx = parseInt(item.dataset.idx);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragIdx = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dropIdx = parseInt(item.dataset.idx);
      if (dragIdx === null || dragIdx === dropIdx) return;

      // Get filtered list to map back to original indices
      const filtered = activeFilter === 'all'
        ? mods
        : mods.filter(m => m.category.toLowerCase() === activeFilter);

      const dragMod = filtered[dragIdx];
      const dropMod = filtered[dropIdx];

      if (!dragMod || !dropMod) return;

      const origDragIdx = mods.indexOf(dragMod);
      const origDropIdx = mods.indexOf(dropMod);

      // Reorder in original array
      mods.splice(origDragIdx, 1);
      mods.splice(origDropIdx, 0, dragMod);

      await saveMods();
      renderMods();
    });
  });

  // Touch-based drag (mobile)
  let touchItem = null;
  let touchStartY = 0;

  items.forEach(item => {
    const grip = item.querySelector('.mod-grip');
    if (!grip) return;

    grip.addEventListener('touchstart', (e) => {
      touchItem = item;
      touchStartY = e.touches[0].clientY;
      item.classList.add('dragging');
    }, { passive: true });
  });

  document.addEventListener('touchmove', (e) => {
    if (!touchItem) return;
  }, { passive: true });

  document.addEventListener('touchend', async (e) => {
    if (!touchItem) return;
    touchItem.classList.remove('dragging');

    const endY = e.changedTouches[0].clientY;
    const diff = endY - touchStartY;
    const itemH = touchItem.offsetHeight + 6;

    if (Math.abs(diff) > itemH * 0.5) {
      const fromIdx = parseInt(touchItem.dataset.idx);
      const moveBy = Math.round(diff / itemH);
      const toIdx = Math.max(0, Math.min(mods.length - 1, fromIdx + moveBy));

      if (fromIdx !== toIdx) {
        const [moved] = mods.splice(fromIdx, 1);
        mods.splice(toIdx, 0, moved);
        await saveMods();
        renderMods();
      }
    }

    touchItem = null;
  });
}

/* ══════════════════════════════════════════════
   GARAGE SCREEN
   ══════════════════════════════════════════════ */
function renderGarage() {
  const container = document.getElementById('garageContent');

  if (!carImage) {
    container.innerHTML = `
      <div class="upload-zone" onclick="triggerUpload()">
        <div class="upload-icon">${CAMERA_SVG}</div>
        <div class="upload-title">No car yet</div>
        <div class="upload-sub">Upload a photo to get started</div>
      </div>`;
    return;
  }

  const installed = mods.filter(m => m.status === 'installed').length;
  const planned = mods.filter(m => m.status === 'planned').length;
  const ordered = mods.filter(m => m.status === 'ordered').length;

  container.innerHTML = `
    <div class="garage-car-card">
      <img class="garage-car-image" src="${carImage}" alt="My car" />
      <div class="garage-car-info">
        <div class="garage-car-name">Current Build</div>
        <div class="garage-car-stats">
          ${mods.length} mods · ${installed} installed · ${ordered} ordered · ${planned} planned
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════
   EXPORT — 9:16 Build Sheet (1080×1920)
   ══════════════════════════════════════════════ */
document.getElementById('exportBtn').addEventListener('click', exportBuild);

async function exportBuild() {
  if (mods.length === 0 && !carImage) {
    showToast('Add mods or a car photo first');
    return;
  }

  showToast('Generating build sheet...');

  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Background
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, W, H);

  let imageBottom = 0;

  // ── Car Image (top portion)
  if (carImage) {
    try {
      const img = await loadImage(carImage);
      const targetH = H * 0.42;
      const scale = Math.max(W / img.width, targetH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (W - drawW) / 2;
      const dy = (targetH - drawH) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, targetH);
      ctx.clip();
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();

      // Gradient overlay on image bottom
      const grad = ctx.createLinearGradient(0, targetH * 0.5, 0, targetH);
      grad.addColorStop(0, 'rgba(10,10,10,0)');
      grad.addColorStop(1, 'rgba(10,10,10,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, targetH * 0.5, W, targetH * 0.5);

      imageBottom = targetH;
    } catch (e) {
      imageBottom = 80;
    }
  } else {
    // No image — subtle gradient header
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#0A0A0A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 300);
    imageBottom = 200;
  }

  // ── Title area
  let y = imageBottom + 10;
  ctx.fillStyle = '#F0F0F0';
  ctx.font = '700 52px Inter, sans-serif';
  ctx.fillText('MY BUILD', 60, y);

  ctx.fillStyle = 'rgba(240,240,240,0.35)';
  ctx.font = '300 24px Inter, sans-serif';
  y += 36;
  const installed = mods.filter(m => m.status === 'installed').length;
  ctx.fillText(`${mods.length} mods · ${installed} installed`, 60, y);

  // ── Divider line
  y += 30;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(60, y, W - 120, 1);
  y += 30;

  // ── Mod list by status
  const groups = [
    { label: 'INSTALLED', status: 'installed', color: '#22C55E' },
    { label: 'ORDERED', status: 'ordered', color: '#3B82F6' },
    { label: 'PLANNED', status: 'planned', color: '#F59E0B' }
  ];

  for (const group of groups) {
    const groupMods = mods.filter(m => m.status === group.status);
    if (groupMods.length === 0) continue;

    // Check if we have room — leave space for footer
    if (y > H - 160) break;

    // Status label
    ctx.fillStyle = group.color;
    ctx.font = '600 18px Inter, sans-serif';
    ctx.fillText(group.label, 60, y);

    // Dot
    ctx.beginPath();
    ctx.arc(46, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();

    y += 10;

    for (const mod of groupMods) {
      if (y > H - 160) break;

      y += 38;
      ctx.fillStyle = '#F0F0F0';
      ctx.font = '500 26px Inter, sans-serif';

      // Truncate long names
      let name = mod.name;
      while (ctx.measureText(name).width > W - 200 && name.length > 3) {
        name = name.slice(0, -1);
      }
      if (name !== mod.name) name += '...';
      ctx.fillText(name, 80, y);

      // Category
      ctx.fillStyle = 'rgba(240,240,240,0.3)';
      ctx.font = '400 18px Inter, sans-serif';
      y += 26;
      ctx.fillText(mod.category.toUpperCase(), 80, y);
    }

    y += 30;
  }

  // ── Footer
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(60, H - 100, W - 120, 1);

  ctx.fillStyle = 'rgba(240,240,240,0.2)';
  ctx.font = '400 16px Inter, sans-serif';
  ctx.fillText('BUILT WITH GARAGE', 60, H - 60);

  // Date
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const dateW = ctx.measureText(today).width;
  ctx.fillText(today, W - 60 - dateW, H - 60);

  // ── Download
  try {
    canvas.toBlob((blob) => {
      if (!blob) { showToast('Export failed'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'build-sheet.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      showToast('Build sheet exported');
    }, 'image/png');
  } catch (e) {
    showToast('Export failed');
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ══════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════ */

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

/* ══════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════ */
loadData();
