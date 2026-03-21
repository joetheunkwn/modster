/* ══════════════════════════════════════════════
   GARAGE — App Engine
   IndexedDB, Mod CRUD, Navigation, Drag-Reorder, Export
   ══════════════════════════════════════════════ */

/* ── State ── */
let builds = [];
let activeBuildId = null;
let activeBuild = null;

let activeFilter = 'all';
let dragIdx = null;

function updateActiveRef() {
  activeBuild = builds.find(b => b.id === activeBuildId) || null;
}

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
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite');
    tx.objectStore('data').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ── Save / Load ── */
async function saveAll() {
  await dbSet('builds', builds);
  await dbSet('activeBuildId', activeBuildId);
}

async function saveMods() {
  if (activeBuild) await saveAll();
}

async function saveCarImage(base64) {
  if (!activeBuild) {
    const b = {
      id: Date.now(),
      name: 'New Build',
      year: '',
      make: '',
      model: '',
      image: base64,
      mods: []
    };
    builds.push(b);
    activeBuildId = b.id;
    updateActiveRef();
  } else {
    activeBuild.image = base64;
  }
  await saveAll();
}

async function loadData() {
  const [savedBuilds, savedActiveId] = await Promise.all([
    dbGet('builds'),
    dbGet('activeBuildId')
  ]);

  if (savedBuilds && savedBuilds.length > 0) {
    builds = savedBuilds;
    activeBuildId = savedActiveId || builds[0].id;
  } else {
    // V1 Migration
    const [savedMods, savedImage] = await Promise.all([
      dbGet('mods'),
      dbGet('carImage')
    ]);
    
    if (savedMods || savedImage) {
      const b = {
        id: Date.now(),
        name: 'My Build',
        year: '', make: '', model: '',
        image: savedImage || null,
        mods: savedMods || []
      };
      builds = [b];
      activeBuildId = b.id;
      await saveAll();
    } else {
      builds = [];
      activeBuildId = null;
    }
  }

  updateActiveRef();
  applyCarImage();
  updateHeaderName();
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
  const img = activeBuild?.image;
  if (img) {
    carBg.style.backgroundImage = `url(${img})`;
    carBg.classList.remove('empty');
  } else {
    carBg.style.backgroundImage = '';
    carBg.classList.add('empty');
  }
}

function updateUploadZone() {
  const zone = document.getElementById('uploadZone');
  zone.style.display = activeBuild?.image ? 'none' : 'flex';
}

function triggerUpload() {
  fileInput.click();
}

let pendingNewBuild = false;
function triggerNewBuild() {
  pendingNewBuild = true;
  fileInput.click();
}

fileInput.addEventListener('change', (e) => {
  const isNewBuild = pendingNewBuild;
  pendingNewBuild = false;
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      if (isNewBuild) {
        const b = { id: Date.now(), name: 'New Build', year: '', make: '', model: '', image: ev.target.result, mods: [] };
        builds.push(b);
        activeBuildId = b.id;
        activeFilter = 'all';
        updateActiveRef();
        await saveAll();
      } else {
        await saveCarImage(ev.target.result);
      }
      applyCarImage();
      updateUploadZone();
      updateHeaderName();
      renderMods();
      renderGarage();
      showToast(isNewBuild ? 'New build added' : 'Car photo updated');
    } catch (err) {
      console.error('Failed to save photo:', err);
      applyCarImage();
      updateUploadZone();
      renderGarage();
      showToast('Could not save photo — storage may be full');
    }
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

  if (editingModId && activeBuild) {
    const mod = activeBuild.mods.find(m => m.id === editingModId);
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

  if (!activeBuild) return;

  if (editingModId) {
    const mod = activeBuild.mods.find(m => m.id === editingModId);
    if (mod) {
      mod.name = name;
      mod.category = category;
      mod.status = selectedStatus;
    }
    showToast('Mod updated');
  } else {
    activeBuild.mods.push({
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
  if (!activeBuild) return;
  const mods = activeBuild.mods;

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

  // Build mod items using a fragment to batch the DOM insertion
  const frag = document.createDocumentFragment();
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
    frag.appendChild(div);
  });
  list.appendChild(frag);

  // Set up drag events
  setupDrag();
}

function renderFilters() {
  if (!activeBuild) return;
  const bar = document.getElementById('filterBar');
  // Only show categories that have mods
  const usedCats = new Set(activeBuild.mods.map(m => m.category));
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
  if (!activeBuild) return;
  const mod = activeBuild.mods.find(m => m.id === id);
  if (!mod) return;
  const idx = STATUS_CYCLE.indexOf(mod.status);
  mod.status = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  await saveMods();
  renderMods();
}

/* ── Delete Mod ── */
async function deleteMod(id) {
  if (!activeBuild) return;
  activeBuild.mods = activeBuild.mods.filter(m => m.id !== id);
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
      if (!activeBuild) return;
      const filtered = activeFilter === 'all'
        ? activeBuild.mods
        : activeBuild.mods.filter(m => m.category.toLowerCase() === activeFilter);

      const dragMod = filtered[dragIdx];
      const dropMod = filtered[dropIdx];

      if (!dragMod || !dropMod) return;

      const origDragIdx = activeBuild.mods.indexOf(dragMod);
      const origDropIdx = activeBuild.mods.indexOf(dropMod);

      // Reorder in original array
      activeBuild.mods.splice(origDragIdx, 1);
      activeBuild.mods.splice(origDropIdx, 0, dragMod);

      await saveMods();
      renderMods();
    });
  });

  // Touch-based drag (mobile)
  let touchItem = null;
  let touchStartY = 0;
  let touchItemH = 0;

  items.forEach(item => {
    const grip = item.querySelector('.mod-grip');
    if (!grip) return;

    grip.addEventListener('touchstart', (e) => {
      touchItem = item;
      touchStartY = e.touches[0].clientY;
      touchItemH = item.offsetHeight + 6; // cache to avoid forced layout in touchend
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
    const itemH = touchItemH;

    if (Math.abs(diff) > itemH * 0.5 && activeBuild) {
      const fromIdx = parseInt(touchItem.dataset.idx);
      const moveBy = Math.round(diff / itemH);
      const toIdx = Math.max(0, Math.min(activeBuild.mods.length - 1, fromIdx + moveBy));

      if (fromIdx !== toIdx) {
        const [moved] = activeBuild.mods.splice(fromIdx, 1);
        activeBuild.mods.splice(toIdx, 0, moved);
        await saveMods();
        renderMods();
      }
    }

    touchItem = null;
  });
}

function updateHeaderName() {
  const el = document.getElementById('headerBuildName');
  if (!el) return;
  if (!activeBuild) {
    el.innerHTML = `Garage <span>/ Build</span>`;
    return;
  }
  const title = activeBuild.name || 
    [activeBuild.year, activeBuild.make, activeBuild.model].filter(Boolean).join(' ') || 
    'My Build';
  el.innerHTML = `${esc(title)}`;
}

/* ══════════════════════════════════════════════
   GARAGE SCREEN
   ══════════════════════════════════════════════ */
function renderGarage() {
  const container = document.getElementById('garageContent');

  if (builds.length === 0) {
    container.innerHTML = `
      <div class="upload-zone" onclick="triggerUpload()">
        <div class="upload-icon">${CAMERA_SVG}</div>
        <div class="upload-title">No builds yet</div>
        <div class="upload-sub">Upload a photo to start your first build</div>
      </div>`;
    return;
  }

  let html = `<div class="garage-builds-list">`;
  
  builds.forEach(b => {
    const installed = b.mods.filter(m => m.status === 'installed').length;
    const isCurrent = b.id === activeBuildId;
    const title = b.name || [b.year, b.make, b.model].filter(Boolean).join(' ') || 'My Build';
    
    html += `
      <div class="garage-car-card" style="border-color: ${isCurrent ? 'var(--accent)' : 'var(--glass-border)'}">
        ${b.image ? `<img class="garage-car-image" src="${b.image}" alt="${esc(title)}" onclick="selectBuild(${b.id})" style="cursor:pointer" />` 
                  : `<div class="garage-car-image" style="display:flex;align-items:center;justify-content:center;color:var(--white-muted);cursor:pointer;" onclick="selectBuild(${b.id})">No Photo</div>`}
        <div class="garage-car-info">
          <div class="garage-build-header">
            <div>
              <div class="garage-car-name" onclick="selectBuild(${b.id})" style="cursor:pointer">${esc(title)}</div>
              <div class="garage-car-stats">
                ${b.mods.length} mods · ${installed} installed
              </div>
            </div>
            <button class="garage-build-edit-btn" onclick="openEditBuild(${b.id})">Edit</button>
          </div>
        </div>
      </div>`;
  });

  html += `</div>
    <button class="garage-add-btn" onclick="triggerNewBuild()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add New Build
    </button>`;
  
  container.innerHTML = html;
}

function selectBuild(id) {
  activeBuildId = id;
  activeFilter = 'all';
  updateActiveRef();
  saveAll();

  applyCarImage();
  updateHeaderName();
  renderMods();
  renderGarage();
  
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-home').classList.add('active');
  setActiveNav('home');
}


/* ══════════════════════════════════════════════
   EXPORT — 9:16 Build Sheet with Image Positioning
   ══════════════════════════════════════════════ */
const exportModal = document.getElementById('exportModal');
const exportViewport = document.getElementById('exportViewport');
const exportPreviewImg = document.getElementById('exportPreviewImg');

let exportImgOffset = { x: 0, y: 0 };
let exportDragStart = null;
let exportImgBounds = null; // { maxX, minX, maxY, minY }
let exportZoneW = 0;
let exportZoneH = 0;

document.getElementById('exportBtn').addEventListener('click', () => {
  if (!activeBuild) return;
  
  if (activeBuild.mods.length === 0 && !activeBuild.image) {
    showToast('Add mods or a car photo first');
    return;
  }

  if (activeBuild.image) {
    // Show positioning modal
    exportImgOffset = { x: 0, y: 0 };
    exportPreviewImg.src = activeBuild.image;
    exportPreviewImg.style.transform = 'translate(0px, 0px)';
    populateExportGuide();
    exportModal.classList.add('open');

    // Once image loads, calculate drag bounds — delay to let modal animation settle
    exportPreviewImg.onload = () => {
      setTimeout(calcExportBounds, 400);
    };
    // If already cached, still wait for animation to finish
    if (exportPreviewImg.complete && exportPreviewImg.naturalWidth) {
      setTimeout(calcExportBounds, 400);
    }
  } else {
    // No car image — skip positioning, open tab synchronously then generate
    const tab = window.open('', '_blank');
    generateExport(0, 0, tab);
  }
});
function populateExportGuide() {
  if (!activeBuild) return;
  const mods = activeBuild.mods;
  const installed = mods.filter(m => m.status === 'installed').length;
  document.getElementById('exportGuideSub').textContent = `${mods.length} mods · ${installed} installed`;
  document.getElementById('exportGuideDate').textContent =
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const titleEl = document.querySelector('.export-guide-title');
  if (titleEl) {
    titleEl.textContent = activeBuild.name || [activeBuild.year, activeBuild.make, activeBuild.model].filter(Boolean).join(' ').toUpperCase() || 'MY BUILD';
  }

  const modsEl = document.getElementById('exportGuideMods');
  const groups = [
    { label: 'INSTALLED', status: 'installed', color: '#22C55E' },
    { label: 'ORDERED', status: 'ordered', color: '#3B82F6' },
    { label: 'PLANNED', status: 'planned', color: '#F59E0B' }
  ];

  let html = '';
  for (const g of groups) {
    const groupMods = mods.filter(m => m.status === g.status);
    if (!groupMods.length) continue;
    html += `<div class="export-guide-status-label" style="color:${g.color}"><span class="sg-dot" style="background:${g.color}"></span>${g.label}</div>`;
    for (const mod of groupMods) {
      html += `<div class="export-guide-mod"><div class="export-guide-mod-name">${esc(mod.name)}</div><div class="export-guide-mod-cat">${mod.category}</div></div>`;
    }
  }
  modsEl.innerHTML = html;
}

function calcExportBounds() {
  const vpW = exportViewport.clientWidth;
  const vpH = exportViewport.clientHeight;
  const imgNatW = exportPreviewImg.naturalWidth;
  const imgNatH = exportPreviewImg.naturalHeight;

  if (!imgNatW || !imgNatH) return;

  // The image zone is the top 42% of the 9:16 viewport (matches canvas render)
  const zoneH = vpH * 0.42;
  const zoneW = vpW;

  // Store for reuse in the generate handler (ensures ratio uses same coordinate space)
  exportZoneW = zoneW;
  exportZoneH = zoneH;

  // Scale image to COVER the image zone (like object-fit: cover)
  const scale = Math.max(zoneW / imgNatW, zoneH / imgNatH);
  const dispW = Math.round(imgNatW * scale);
  const dispH = Math.round(imgNatH * scale);

  // Apply dimensions
  exportPreviewImg.style.width = dispW + 'px';
  exportPreviewImg.style.height = dispH + 'px';

  // Center the image initially within the zone
  const centerX = Math.round((zoneW - dispW) / 2);
  const centerY = Math.round((zoneH - dispH) / 2);
  exportPreviewImg.style.left = centerX + 'px';
  exportPreviewImg.style.top = centerY + 'px';

  // Calculate drag bounds — how far the image can move from center
  const overflowX = Math.max(0, (dispW - zoneW) / 2);
  const overflowY = Math.max(0, (dispH - zoneH) / 2);

  exportImgBounds = {
    minX: -overflowX,
    maxX: overflowX,
    minY: -overflowY,
    maxY: overflowY
  };

  // Reset offset and transform
  exportImgOffset = { x: 0, y: 0 };
  exportPreviewImg.style.transform = 'translate(0px, 0px)';
}

// ── Mouse drag
exportViewport.addEventListener('mousedown', (e) => {
  e.preventDefault();
  exportDragStart = { x: e.clientX - exportImgOffset.x, y: e.clientY - exportImgOffset.y };
});

document.addEventListener('mousemove', (e) => {
  if (!exportDragStart) return;
  let nx = e.clientX - exportDragStart.x;
  let ny = e.clientY - exportDragStart.y;
  if (exportImgBounds) {
    nx = Math.max(exportImgBounds.minX, Math.min(exportImgBounds.maxX, nx));
    ny = Math.max(exportImgBounds.minY, Math.min(exportImgBounds.maxY, ny));
  }
  exportImgOffset = { x: nx, y: ny };
  exportPreviewImg.style.transform = `translate(${nx}px, ${ny}px)`;
});

document.addEventListener('mouseup', () => { exportDragStart = null; });

// ── Touch drag
exportViewport.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  exportDragStart = { x: t.clientX - exportImgOffset.x, y: t.clientY - exportImgOffset.y };
}, { passive: true });

exportViewport.addEventListener('touchmove', (e) => {
  if (!exportDragStart) return;
  e.preventDefault();
  const t = e.touches[0];
  let nx = t.clientX - exportDragStart.x;
  let ny = t.clientY - exportDragStart.y;
  if (exportImgBounds) {
    nx = Math.max(exportImgBounds.minX, Math.min(exportImgBounds.maxX, nx));
    ny = Math.max(exportImgBounds.minY, Math.min(exportImgBounds.maxY, ny));
  }
  exportImgOffset = { x: nx, y: ny };
  exportPreviewImg.style.transform = `translate(${nx}px, ${ny}px)`;
}, { passive: false });

exportViewport.addEventListener('touchend', () => { exportDragStart = null; }, { passive: true });

// ── Modal controls
document.getElementById('cancelExportBtn').addEventListener('click', closeExportModal);
exportModal.addEventListener('click', (e) => { if (e.target === exportModal) closeExportModal(); });

function closeExportModal() {
  exportModal.classList.remove('open');
}

document.getElementById('generateExportBtn').addEventListener('click', () => {
  // Use stored zone dims from calcExportBounds — same coordinate space as drag setup
  const ratioX = exportZoneW > 0 ? exportImgOffset.x / exportZoneW : 0;
  const ratioY = exportZoneH > 0 ? exportImgOffset.y / exportZoneH : 0;
  closeExportModal();

  // Open tab SYNCHRONOUSLY from the click event to avoid popup blocker
  const tab = window.open('', '_blank');
  generateExport(ratioX, ratioY, tab);
});

async function generateExport(offsetRatioX, offsetRatioY, tab) {
  showToast('Generating build sheet...');

  const W = 1080;
  // Image zone is always fixed at 1920*0.42 so preview alignment stays accurate
  const IMAGE_ZONE_H = Math.round(1920 * 0.42); // 806px

  // Pre-calculate total content height to size canvas dynamically
  const groupDefs = [
    { label: 'INSTALLED', status: 'installed', color: '#22C55E' },
    { label: 'ORDERED', status: 'ordered', color: '#3B82F6' },
    { label: 'PLANNED', status: 'planned', color: '#F59E0B' }
  ];
  let modsContentH = 0;
  for (const g of groupDefs) {
    const count = (activeBuild.mods || []).filter(m => m.status === g.status).length;
    if (count === 0) continue;
    modsContentH += 10 + count * 64 + 30; // group label+pad + (name 38 + cat 26) per mod + gap
  }
  const baseImageBottom = activeBuild.image ? IMAGE_ZONE_H : 200;
  const H = Math.max(1920, baseImageBottom + 106 + modsContentH + 160);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Background
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, W, H);

  let imageBottom = 0;

  // ── Car Image (top portion) with user-defined offset
  if (activeBuild?.image) {
    try {
      const img = await loadImage(activeBuild.image);
      const targetH = IMAGE_ZONE_H;
      const scale = Math.max(W / img.width, targetH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;

      // Center + apply user offset (ratio × canvas width for proportional mapping)
      const dx = (W - drawW) / 2 + (offsetRatioX * W);
      const baseY = (targetH - drawH) / 2;
      const dy = baseY + (offsetRatioY * targetH);

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
  const title = activeBuild.name || [activeBuild.year, activeBuild.make, activeBuild.model].filter(Boolean).join(' ').toUpperCase() || 'MY BUILD';
  ctx.fillText(title, 60, y);

  ctx.fillStyle = 'rgba(240,240,240,0.35)';
  ctx.font = '300 24px Inter, sans-serif';
  y += 36;
  const mods = activeBuild.mods;
  const installed = mods.filter(m => m.status === 'installed').length;
  ctx.fillText(`${mods.length} mods · ${installed} installed`, 60, y);

  // ── Divider line
  y += 30;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(60, y, W - 120, 1);
  y += 30;

  // ── Mod list by status (groupDefs pre-defined above for height calculation)
  for (const group of groupDefs) {
    const groupMods = activeBuild.mods.filter(m => m.status === group.status);
    if (groupMods.length === 0) continue;

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

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const dateW = ctx.measureText(today).width;
  ctx.fillText(today, W - 60 - dateW, H - 60);

  // ── Write to pre-opened tab (for easy save to camera roll)
  try {
    const dataUrl = canvas.toDataURL('image/png');
    if (tab && !tab.closed) {
      tab.document.write(`<!DOCTYPE html><html><head><title>Build Sheet</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0a;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;display:block}</style></head><body><img src="${dataUrl}" alt="Build Sheet" /></body></html>`);
      tab.document.close();
      showToast('Build sheet opened — long press to save');
    } else {
      showToast('Allow popups to export');
    }
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
   EDIT BUILD MODAL
   ══════════════════════════════════════════════ */
const editBuildModal = document.getElementById('editBuildModal');
let editingBuildId = null;
let pendingBuildPhoto = null;

function openEditBuild(id) {
  const b = builds.find(x => x.id === id);
  if (!b) return;

  editingBuildId = b.id;
  document.getElementById('buildNameInput').value = b.name || '';
  document.getElementById('buildYearInput').value = b.year || '';
  document.getElementById('buildMakeInput').value = b.make || '';
  document.getElementById('buildModelInput').value = b.model || '';

  pendingBuildPhoto = b.image;
  updateEditPhotoPreview();

  // Show delete only if > 1 build
  const delBtn = document.getElementById('deleteBuildBtn');
  if (builds.length > 1) {
    delBtn.style.display = 'block';
  } else {
    delBtn.style.display = 'none';
  }

  editBuildModal.classList.add('open');
}

function closeEditBuild() {
  editBuildModal.classList.remove('open');
  editingBuildId = null;
  pendingBuildPhoto = null;
}

function updateEditPhotoPreview() {
  const preview = document.getElementById('editBuildPhotoPreview');
  if (pendingBuildPhoto) {
    preview.style.display = 'block';
    preview.style.backgroundImage = `url(${pendingBuildPhoto})`;
  } else {
    preview.style.display = 'none';
  }
}

// ── Handle photo change within edit modal
const editPhotoInput = document.createElement('input');
editPhotoInput.type = 'file';
editPhotoInput.accept = 'image/*';
editPhotoInput.style.display = 'none';
document.body.appendChild(editPhotoInput);

document.getElementById('editBuildPhotoBtn').addEventListener('click', () => {
  editPhotoInput.click();
});

editPhotoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingBuildPhoto = ev.target.result;
    updateEditPhotoPreview();
  };
  reader.readAsDataURL(file);
  editPhotoInput.value = '';
});

// ── Save build info
document.getElementById('saveBuildBtn').addEventListener('click', async () => {
  if (!editingBuildId) return;
  const b = builds.find(x => x.id === editingBuildId);
  if (!b) return;

  b.name = document.getElementById('buildNameInput').value.trim();
  b.year = document.getElementById('buildYearInput').value.trim();
  b.make = document.getElementById('buildMakeInput').value.trim();
  b.model = document.getElementById('buildModelInput').value.trim();
  b.image = pendingBuildPhoto;

  try {
    await saveAll();
    showToast('Build updated');
  } catch (err) {
    console.error('Failed to save build:', err);
    showToast('Saved (storage may be full)');
  }
  closeEditBuild();
  updateActiveRef();
  applyCarImage();
  updateHeaderName();
  renderGarage();
});

// ── Delete build
document.getElementById('deleteBuildBtn').addEventListener('click', async () => {
  if (builds.length <= 1) return; // safety
  if (!confirm('Delete this build completely?')) return;

  builds = builds.filter(x => x.id !== editingBuildId);
  if (activeBuildId === editingBuildId) {
    activeBuildId = builds[0].id;
  }
  
  await saveAll();
  showToast('Build deleted');
  closeEditBuild();
  updateActiveRef();
  applyCarImage();
  updateHeaderName();
  renderGarage();
  renderMods();
});

document.getElementById('cancelBuildBtn').addEventListener('click', closeEditBuild);
editBuildModal.addEventListener('click', (e) => {
  if (e.target === editBuildModal) closeEditBuild();
});

/* ══════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════ */
loadData();
