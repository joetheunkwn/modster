/* ══════════════════════════════════════════════
   GARAGE — App Engine
   IndexedDB, Mod CRUD, Navigation, Drag-Reorder
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

    navItems.forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
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

  // Mod list
  const list = document.getElementById('modList');
  const empty = document.getElementById('buildEmpty');

  if (mods.length === 0) {
    empty.style.display = 'block';
    list.innerHTML = '';
    list.appendChild(empty);
    return;
  }

  empty.style.display = 'none';

  if (filtered.length === 0) {
    list.innerHTML = '<div class="build-empty"><div class="empty-icon">🔍</div>No mods in this category</div>';
    return;
  }

  list.innerHTML = filtered.map((mod, i) => `
    <div class="mod-item" data-id="${mod.id}" data-idx="${i}" draggable="true">
      <div class="mod-grip">⠿</div>
      <div class="mod-info" onclick="openAddModal('${mod.id}')">
        <div class="mod-name">${esc(mod.name)}</div>
        <div class="mod-category">${mod.category}</div>
      </div>
      <button class="mod-status ${mod.status}" onclick="cycleStatus('${mod.id}')">${mod.status}</button>
      <div class="mod-actions">
        <button class="mod-delete" onclick="deleteMod('${mod.id}')">✕</button>
      </div>
    </div>
  `).join('');

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
        <div class="upload-icon">📷</div>
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
