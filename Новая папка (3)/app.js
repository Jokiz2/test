// ── STATE ──────────────────────────────────────────────────
// images[i].cols = [] — массив коллекций, в которых находится фото
let images      = JSON.parse(localStorage.getItem('gal_images')      || '[]');
let collections = JSON.parse(localStorage.getItem('gal_collections')  || '[]');

// Миграция старых данных: col → cols
images = images.map(img => {
  if (!img.cols) {
    img.cols = img.col ? [img.col] : [];
    delete img.col;
  }
  return img;
});

let activeCol   = 'all';
let lbIndex     = 0;
let lbZoom      = 1;
let lbPanelOpen = false;
let confirmCb   = null;
let movingImgId = null;
let dragImgId   = null;

const $  = id => document.getElementById(id);
const on = (id, ev, fn) => $(id) && $(id).addEventListener(ev, fn);

// ── SAVE ───────────────────────────────────────────────────
function save() {
  localStorage.setItem('gal_images',      JSON.stringify(images));
  localStorage.setItem('gal_collections', JSON.stringify(collections));
}

// ── HELPERS ────────────────────────────────────────────────
function getFiltered() {
  if (activeCol === 'all') return images;
  return images.filter(i => i.cols && i.cols.includes(activeCol));
}
function colImages(name) { return images.filter(i => i.cols && i.cols.includes(name)); }

// ── UPLOAD ─────────────────────────────────────────────────
function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const assignCol = activeCol === 'all'
        ? (collections[0] ?? null)
        : activeCol;
      const cols = assignCol ? [assignCol] : [];
      if (assignCol && !collections.includes(assignCol)) collections.push(assignCol);
      images.push({
        id:   `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        src:  e.target.result,
        name: file.name.replace(/\.[^.]+$/, ''),
        cols,
        ts:   Date.now()
      });
      save(); renderAll();
    };
    reader.readAsDataURL(file);
  });;
  $('fileInput').value = '';
}

// ── DELETE IMAGE COMPLETELY ────────────────────────────────
function deleteImageCompletely(id) { images = images.filter(i => i.id !== id); save(); renderAll(); }

// ── REMOVE IMAGE FROM CURRENT COLLECTION ──────────────────
function removeImageFromCollection(id, col) {
  const img = images.find(i => i.id === id);
  if (!img) return;
  if (col === 'all') {
    // Удалить полностью
    deleteImageCompletely(id);
    return;
  }
  img.cols = img.cols.filter(c => c !== col);
  // Если фото больше ни в одной коллекции — оставить (будет видно в "Все")
  save(); renderAll();
}

function askDeleteImage(id, name, e) {
  if (e) e.stopPropagation();
  const inCurrentCol = activeCol !== 'all';
  const title = inCurrentCol ? `Убрать «${name}» из коллекции?` : `Удалить «${name}»?`;
  const desc  = inCurrentCol
    ? 'Фото останется в других коллекциях и в разделе «Все фотографии».'
    : 'Фото будет удалено полностью.';
  showConfirm(title, desc, () => {
    if ($('lightbox').classList.contains('open')) closeLightbox();
    removeImageFromCollection(id, activeCol);
  });
}

// ── DELETE COLLECTION ──────────────────────────────────────
function deleteCollection(name) {
  collections = collections.filter(c => c !== name);
  // Убираем коллекцию из всех фото, фото НЕ удаляем
  images.forEach(img => { img.cols = img.cols.filter(c => c !== name); });
  if (activeCol === name) activeCol = 'all';
  save(); renderAll();
}
function askDeleteCol(name, e) {
  if (e) e.stopPropagation();
  const cnt = colImages(name).length;
  showConfirm(
    `Удалить коллекцию «${name}»?`,
    cnt > 0 ? `Коллекция будет удалена. ${cnt} фото останутся в галерее.` : 'Пустая коллекция будет удалена.',
    () => deleteCollection(name)
  );
}

// ── COPY IMAGE TO COLLECTION (не перемещать!) ──────────────
function openMoveModal(id, e) {
  if (e) e.stopPropagation();
  movingImgId = id;
  const img = images.find(i => i.id === id);
  $('moveImgName').textContent = img?.name || '';
  $('moveModalTitle').textContent = 'Добавить в коллекцию';
  renderMoveColList(img);
  $('moveModal').classList.add('open');
}

function renderMoveColList(img) {
  const list = $('moveColList');
  list.innerHTML = '';
  if (collections.length === 0) {
    list.innerHTML = `<div style="font-size:13px;color:var(--text3);padding:12px 0">Нет коллекций. Сначала создайте коллекцию.</div>`;
    return;
  }
  collections.forEach(col => {
    const isIn = img?.cols?.includes(col);
    const btn = document.createElement('button');
    btn.className = `move-col-item${isIn ? ' current' : ''}`;
    btn.innerHTML = `
      <span class="move-col-item-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
      </span>
      <span>${col}</span>
      ${isIn ? `<span class="move-col-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>` : ''}
    `;
    btn.addEventListener('click', () => {
      doAddToCollection(movingImgId, col);
      $('moveModal').classList.remove('open');
    });
    list.appendChild(btn);
  });
}

// Добавить фото в коллекцию (без удаления из текущей)
function doAddToCollection(id, col) {
  const img = images.find(i => i.id === id);
  if (!img) return;
  if (!img.cols.includes(col)) {
    img.cols.push(col);
  }
  save(); renderAll();
  if ($('lightbox').classList.contains('open')) {
    renderLbPanel(img);
  }
}

// Drag-and-drop: тоже копирует, а не перемещает
function doDragToCollection(id, col) {
  const img = images.find(i => i.id === id);
  if (!img) return;
  if (!img.cols.includes(col)) {
    img.cols.push(col);
  }
  save(); renderAll();
}

on('moveCancel', 'click', () => $('moveModal').classList.remove('open'));
$('moveModal')?.addEventListener('click', e => { if (e.target === $('moveModal')) $('moveModal').classList.remove('open'); });

// ── CONFIRM MODAL ──────────────────────────────────────────
function showConfirm(title, desc, cb) {
  $('confirmTitle').textContent = title;
  $('confirmDesc').textContent  = desc;
  confirmCb = cb;
  $('confirmModal').classList.add('open');
}
function closeConfirm() { $('confirmModal').classList.remove('open'); }
on('confirmOk',     'click', () => { if (confirmCb) confirmCb(); confirmCb = null; closeConfirm(); });
on('confirmCancel', 'click', closeConfirm);
$('confirmModal')?.addEventListener('click', e => { if (e.target === $('confirmModal')) closeConfirm(); });

// ── COLLECTION MODAL ───────────────────────────────────────
function openColModal() {
  $('colInput').value = '';
  $('colModal').classList.add('open');
  setTimeout(() => $('colInput').focus(), 80);
}
function closeColModal() { $('colModal').classList.remove('open'); }
function createCollection() {
  const name = $('colInput').value.trim();
  if (!name) return;
  if (!collections.includes(name)) { collections.push(name); save(); }
  activeCol = name;
  closeColModal(); renderAll();
}
on('addColBtn',  'click', openColModal);
on('colSave',    'click', createCollection);
on('colCancel',  'click', closeColModal);
$('colModal')?.addEventListener('click', e => { if (e.target === $('colModal')) closeColModal(); });
$('colInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') createCollection(); });

// ── SIDEBAR MOBILE ─────────────────────────────────────────
on('menuBtn', 'click', () => {
  $('sidebar').classList.toggle('open');
  $('mobileOverlay').classList.toggle('open');
});
on('mobileOverlay', 'click', () => {
  $('sidebar').classList.remove('open');
  $('mobileOverlay').classList.remove('open');
});

// ── RENDER ALL ─────────────────────────────────────────────
function renderAll() { renderStats(); renderCollectionWidgets(); renderGrid(); }

function renderStats() {
  $('statPhotos').textContent = images.length;
  $('statCols').textContent   = collections.length;
}

// ── COLLECTION WIDGETS ─────────────────────────────────────
function renderCollectionWidgets() {
  const grid = $('collectionsGrid');
  grid.innerHTML = '';
  grid.appendChild(makeWidget('all', 'Все фотографии', images.length, images.slice(0,3), false));
  collections.forEach(name => {
    const imgs = colImages(name);
    grid.appendChild(makeWidget(name, name, imgs.length, imgs.slice(0,3), true));
  });
}

function makeWidget(key, label, count, prevImgs, deletable) {
  const active = activeCol === key;
  const div = document.createElement('div');
  div.className = `col-widget${active ? ' active' : ''}`;

  const thumbsHtml = [0,1,2].map(i => {
    const img = prevImgs[i];
    return `<div class="cw-thumb">${img ? `<img src="${img.src}" alt="">` : ''}</div>`;
  }).join('');

  div.innerHTML = `
    <div class="cw-top">
      <div class="cw-icon">
        ${key === 'all'
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`}
      </div>
      ${deletable ? `<div class="cw-actions">
        <button class="btn-icon red" title="Удалить коллекцию">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>` : ''}
    </div>
    <div class="cw-name">${label}</div>
    <div class="cw-count">${count} фото</div>
    <div class="cw-thumbs">${thumbsHtml}</div>
    <div class="drop-hint">Добавить сюда</div>
  `;

  div.addEventListener('click', () => { activeCol = key; renderAll(); });

  if (deletable) {
    div.querySelector('.btn-icon.red').addEventListener('click', e => askDeleteCol(key, e));
  }

  // Drag-and-drop target
  div.addEventListener('dragover', e => {
    if (!dragImgId) return;
    e.preventDefault();
    if (key !== 'all') {
      div.classList.add('drag-target');
    }
  });
  div.addEventListener('dragleave', () => div.classList.remove('drag-target'));
  div.addEventListener('drop', e => {
    e.preventDefault();
    div.classList.remove('drag-target');
    if (!dragImgId || key === 'all') return;
    doDragToCollection(dragImgId, key);
    dragImgId = null;
  });

  return div;
}

// ── GRID ───────────────────────────────────────────────────
function renderGrid() {
  const grid    = $('grid');
  const empty   = $('emptyState');
  const filtered = getFiltered();

  $('galleryTtl').textContent = activeCol === 'all' ? 'Все изображения' : activeCol;
  $('galleryCount').textContent = filtered.length;

  if (filtered.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = '';

  filtered.forEach((img, i) => {
    const card = document.createElement('div');
    card.className = 'img-card';
    card.style.animationDelay = `${Math.min(i * 35, 300)}ms`;
    card.draggable = true;

    // Надпись кнопки удаления зависит от контекста
    const deleteTitle = activeCol !== 'all' ? 'Убрать из коллекции' : 'Удалить';

    card.innerHTML = `
      <div class="drag-handle" title="Перетащить в коллекцию">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/>
          <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
          <circle cx="9" cy="17" r="1" fill="currentColor"/><circle cx="15" cy="17" r="1" fill="currentColor"/>
        </svg>
      </div>
      <img src="${img.src}" alt="${img.name}" loading="lazy">
      <div class="card-hover">
        <div class="card-top-row">
          <button class="card-btn" title="Добавить в коллекцию">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          </button>
          <button class="card-btn red" title="${deleteTitle}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
        <span class="card-name">${img.name}</span>
      </div>
    `;

    // Click on image → open lightbox (zoom)
    card.querySelector('img').addEventListener('click', () => openLightbox(i));
    // Add to collection button
    card.querySelectorAll('.card-btn')[0].addEventListener('click', e => openMoveModal(img.id, e));
    // Delete/Remove button
    card.querySelectorAll('.card-btn')[1].addEventListener('click', e => askDeleteImage(img.id, img.name, e));

    // Drag
    card.addEventListener('dragstart', e => {
      dragImgId = img.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'copy';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragImgId = null;
    });

    grid.appendChild(card);
  });
}

// ══════════════════════════════════════════════
// LIGHTBOX
// ══════════════════════════════════════════════
let lbZoomPx = 0, lbZoomPy = 0;
let lbDragging = false, lbDragStartX = 0, lbDragStartY = 0;
let lbTouchStartX = 0, lbTouchStartY = 0;
let lbCurrentId = null;

function openLightbox(index) {
  const filtered = getFiltered();
  if (!filtered.length) return;
  lbIndex = Math.max(0, Math.min(index, filtered.length - 1));
  const img = filtered[lbIndex];
  lbCurrentId = img.id;

  lbZoom = 1; lbZoomPx = 0; lbZoomPy = 0;
  applyZoom(false);

  const el = $('lbImg');
  el.src = img.src;
  el.classList.add('snap');

  refreshLbMeta();
  renderLbPanel(img);

  $('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function refreshLbMeta() {
  const filtered = getFiltered();
  const img = filtered[lbIndex];
  if (!img) return;
  $('lbCounter').textContent  = `${lbIndex + 1} / ${filtered.length}`;
  $('lbNameTop').textContent  = img.name;
  $('lbPrevBtn').disabled = lbIndex === 0;
  $('lbNextBtn').disabled = lbIndex === filtered.length - 1;
}

function closeLightbox() {
  $('lightbox').classList.remove('open');
  if (lbPanelOpen) { lbPanelOpen = false; $('lbPanel').classList.remove('open'); $('lbPanelBtn').classList.remove('active'); }
  document.body.style.overflow = '';
  lbZoom = 1; lbZoomPx = 0; lbZoomPy = 0;
}

function navigateLb(dir) {
  const filtered = getFiltered();
  const next = lbIndex + dir;
  if (next < 0 || next >= filtered.length) return;
  lbZoom = 1; lbZoomPx = 0; lbZoomPy = 0;
  applyZoom(false);
  lbIndex = next;
  const img = filtered[lbIndex];
  lbCurrentId = img.id;
  $('lbImg').src = img.src;
  refreshLbMeta();
  renderLbPanel(img);
}

// ── ZOOM ───────────────────────────────────────────────────
function applyZoom(animate) {
  const el = $('lbImg');
  const area = $('lbImgArea');
  if (animate) { el.classList.add('snap'); } else { el.classList.remove('snap'); }
  el.style.transform = `scale(${lbZoom}) translate(${lbZoomPx/lbZoom}px, ${lbZoomPy/lbZoom}px)`;
  $('lbZoomLabel').textContent = `${Math.round(lbZoom * 100)}%`;
  area.classList.toggle('zoomed', lbZoom > 1);
}

function zoomIn()  { lbZoom = Math.min(lbZoom * 1.4, 5); applyZoom(true); }
function zoomOut() {
  lbZoom = Math.max(lbZoom / 1.4, 1);
  if (lbZoom <= 1) { lbZoom = 1; lbZoomPx = 0; lbZoomPy = 0; }
  applyZoom(true);
}
function zoomReset() { lbZoom = 1; lbZoomPx = 0; lbZoomPy = 0; applyZoom(true); }

on('lbZoomIn',    'click', zoomIn);
on('lbZoomOut',   'click', zoomOut);
on('lbZoomReset', 'click', zoomReset);

// Click directly on image → zoom in; click again → reset
$('lbImg')?.addEventListener('click', e => {
  e.stopPropagation();
  if (lbDragging) return;
  if (lbZoom > 1) { zoomReset(); return; }
  const rect = $('lbImgArea').getBoundingClientRect();
  const cx = e.clientX - rect.left - rect.width / 2;
  const cy = e.clientY - rect.top  - rect.height / 2;
  lbZoom = 2.5;
  lbZoomPx = -cx * 0.6;
  lbZoomPy = -cy * 0.6;
  applyZoom(true);
});

// Mouse pan when zoomed
$('lbImgArea')?.addEventListener('mousedown', e => {
  if (lbZoom <= 1) return;
  lbDragging = false;
  $('lbImgArea').classList.add('grabbing');
  lbDragStartX = e.clientX - lbZoomPx;
  lbDragStartY = e.clientY - lbZoomPy;
  const onMove = mv => {
    lbDragging = true;
    lbZoomPx = mv.clientX - lbDragStartX;
    lbZoomPy = mv.clientY - lbDragStartY;
    applyZoom(false);
  };
  const onUp = () => {
    $('lbImgArea').classList.remove('grabbing');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    setTimeout(() => { lbDragging = false; }, 50);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

// Mouse wheel zoom
$('lbImgArea')?.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.15 : 1/1.15;
  lbZoom = Math.max(1, Math.min(lbZoom * delta, 5));
  if (lbZoom <= 1) { lbZoom = 1; lbZoomPx = 0; lbZoomPy = 0; }
  applyZoom(false);
}, { passive: false });

// Touch swipe
$('lbImgArea')?.addEventListener('touchstart', e => {
  lbTouchStartX = e.touches[0].clientX;
  lbTouchStartY = e.touches[0].clientY;
}, { passive: true });

$('lbImgArea')?.addEventListener('touchend', e => {
  if (lbZoom > 1) return;
  const dx = e.changedTouches[0].clientX - lbTouchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - lbTouchStartY);
  if (Math.abs(dx) > 50 && dy < 60) {
    if (dx < 0) navigateLb(1);
    else navigateLb(-1);
  }
}, { passive: true });

// ── PANEL ──────────────────────────────────────────────────
function toggleLbPanel() {
  lbPanelOpen = !lbPanelOpen;
  $('lbPanel').classList.toggle('open', lbPanelOpen);
  $('lbPanelBtn').classList.toggle('active', lbPanelOpen);
}

function renderLbPanel(img) {
  $('lbPanelName').textContent = img.name;
  const colsLabel = img.cols && img.cols.length > 0 ? img.cols.join(', ') : 'Без коллекции';
  $('lbPanelCol').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
    ${colsLabel}
  `;

  const list = $('lbColList');
  list.innerHTML = '';
  if (collections.length === 0) {
    list.innerHTML = `<div style="font-size:12px;color:rgba(255,255,255,0.3);padding:6px 0">Нет коллекций</div>`;
    return;
  }
  collections.forEach(col => {
    const isIn = img.cols && img.cols.includes(col);
    const btn = document.createElement('button');
    btn.className = `lb-col-option${isIn ? ' current' : ''}`;
    btn.innerHTML = `
      <span class="lb-col-dot"></span>
      <span>${col}</span>
      ${isIn ? `<span class="lb-col-check"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>` : ''}
    `;
    // Клик переключает принадлежность к коллекции
    btn.addEventListener('click', () => {
      if (isIn) {
        img.cols = img.cols.filter(c => c !== col);
      } else {
        img.cols.push(col);
      }
      save(); renderAll();
      renderLbPanel(img);
    });
    list.appendChild(btn);
  });
}

// ── LIGHTBOX EVENTS ────────────────────────────────────────
on('lbClose',    'click', closeLightbox);
on('lbPrevBtn',  'click', () => navigateLb(-1));
on('lbNextBtn',  'click', () => navigateLb(1));
on('lbPanelBtn', 'click', toggleLbPanel);
on('lbDelBtn',   'click', () => {
  const img = images.find(i => i.id === lbCurrentId);
  if (img) askDeleteImage(img.id, img.name, null);
});
on('lbMoveBtn', 'click', () => {
  const img = images.find(i => i.id === lbCurrentId);
  if (img) openMoveModal(img.id, null);
});

$('lightbox')?.addEventListener('click', e => {
  if (e.target === $('lightbox')) closeLightbox();
});

// Keyboard
document.addEventListener('keydown', e => {
  const lb = $('lightbox').classList.contains('open');
  if (lb) {
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  navigateLb(-1);
    if (e.key === 'ArrowRight') navigateLb(1);
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-')           zoomOut();
    if (e.key === '0')           zoomReset();
    if (e.key === 'i')           toggleLbPanel();
    return;
  }
  if ($('colModal').classList.contains('open') && e.key === 'Escape')     closeColModal();
  if ($('confirmModal').classList.contains('open') && e.key === 'Escape') closeConfirm();
  if ($('moveModal').classList.contains('open') && e.key === 'Escape')    $('moveModal').classList.remove('open');
});

// ── UPLOAD WIRING ──────────────────────────────────────────
const uploadZone = $('uploadZone');
const fileInput  = $('fileInput');

uploadZone?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', e => handleFiles(e.target.files));
uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone?.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});
on('uploadBtn', 'click', () => fileInput.click());

// ══════════════════════════════════════════════════════════
// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК (Галерея / Доска)
// ══════════════════════════════════════════════════════════
// Вкладки — это просто два <div class="view">. Функция снимает класс
// "active" со всех вкладок и кнопок и ставит его на нужную.
// $$(selector) — маленький хелпер, аналог document.querySelectorAll,
// но сразу возвращает нормальный массив (querySelectorAll даёт NodeList,
// у которого нет some методов массивов, поэтому оборачиваем в Array.from).
const $$ = sel => Array.from(document.querySelectorAll(sel));

function switchTab(tab) {
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('galleryView').classList.toggle('active', tab === 'gallery');
  $('boardView').classList.toggle('active', tab === 'board');
  // Показываем кнопки "Коллекция/Загрузить" из шапки только на вкладке галереи —
  // на доске они не нужны, там своя панель инструментов.
  $('galleryHeaderActions').style.display = tab === 'gallery' ? 'flex' : 'none';
  if (tab === 'board') {
    // initBoard сам следит, чтобы не инициализироваться дважды (см. флаг boardInited)
    initBoard();
  }
}
on('tabGallery', 'click', () => switchTab('gallery'));
on('tabBoard',   'click', () => switchTab('board'));


// ══════════════════════════════════════════════════════════
// ДОСКА — бесконечный холст с фото, текстом и рисованием
// ══════════════════════════════════════════════════════════
//
// Идея устройства:
//  1. Есть .board-viewport — окошко, которое всегда видно на экране (overflow:hidden).
//  2. Внутри — .board-world, который двигаем и масштабируем через CSS transform:
//     translate(x,y) scale(s). Так создаётся иллюзия камеры, летающей над полем.
//     У world НЕТ фиксированного размера — значит и ограничений тоже нет,
//     координаты фото/текста/линий могут быть какими угодно, хоть отрицательными.
//  3. Внутри world — SVG-слой для линий и div'ы с фото и текстом.
//  4. Все координаты хранятся в "мировых" пикселях, а курсор мыши — в "экранных" —
//     все обработчики переводят координаты через screenToWorld().
//
// Каждое фото, каждый текстовый блок и каждая линия — отдельный объект в своём
// массиве (boardPhotos / boardTexts / boardStrokes), со своими координатами.
// Линия — это не пиксели на общей картинке, а <path> с списком точек, поэтому
// она никак не "блокирует" фото под собой и не имеет границ холста.

let boardInited   = false;
let boardPhotos   = JSON.parse(localStorage.getItem('gal_board_photos')  || '[]');
let boardTexts    = JSON.parse(localStorage.getItem('gal_board_texts')   || '[]');
let boardStrokes  = JSON.parse(localStorage.getItem('gal_board_strokes') || '[]');
let boardView     = JSON.parse(localStorage.getItem('gal_board_view')    || 'null');
let boardTool     = 'move';            // 'move' | 'brush' | 'eraser'
let brushColor    = '#1c1916';
let brushSize     = 8;

let isPanning         = false;
let isDrawing         = false;
let isErasing         = false;
let panStart          = { x:0, y:0, vx:0, vy:0 };
let currentStroke     = null;          // объект текущей линии, пока её рисуют
let currentStrokeEl   = null;          // её DOM <path>
let lastBoardMouseWorld = null;        // последняя позиция курсора над доской (мировые координаты)

// ── добавление фото теперь работает как добавление фигур: выбрал файл(ы) →
// на холсте протяжкой рисуешь рамку — фото растягивается точно под неё; просто
// клик без протяжки ставит фото в оригинальном пиксельном размере ──
let photoQueue      = [];  // очередь ещё не размещённых фото (если выбрали сразу несколько)
let pendingPhotoItem = null; // { src, w, h } картинки, которую сейчас размещаем протяжкой

let boardShapes    = JSON.parse(localStorage.getItem('gal_board_shapes') || '[]');

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;

// ── ИНИЦИАЛИЗАЦИЯ ДОСКИ ─────────────────────────────────────
function initBoard() {
  if (boardInited) return;
  boardInited = true;

  // Камера по умолчанию: мировая точка (0,0) оказывается в центре экрана.
  if (!boardView) {
    const vp = $('boardViewport').getBoundingClientRect();
    boardView = { x: vp.width / 2, y: vp.height / 2, scale: 1 };
  }

  applyBoardTransform();
  renderBoardStrokes();
  renderBoardPhotos();
  renderBoardTexts();
  renderBoardShapes();
  setBoardTool('move');
  wireBoardEvents();
}

function applyBoardTransform() {
  $('boardWorld').style.transform = `translate(${boardView.x}px, ${boardView.y}px) scale(${boardView.scale})`;
  $('boardZoomLabel').textContent = `${Math.round(boardView.scale * 100)}%`;
}

function saveBoardView()    { localStorage.setItem('gal_board_view',    JSON.stringify(boardView)); }
function saveBoardPhotos()  { localStorage.setItem('gal_board_photos',  JSON.stringify(boardPhotos)); }
function saveBoardTexts()   { localStorage.setItem('gal_board_texts',   JSON.stringify(boardTexts)); }
function saveBoardStrokes() { localStorage.setItem('gal_board_strokes', JSON.stringify(boardStrokes)); }
function saveBoardShapes()  { localStorage.setItem('gal_board_shapes',  JSON.stringify(boardShapes)); }

// Экранные пиксели → мировые координаты внутри board-world.
function screenToWorld(clientX, clientY) {
  const rect = $('boardViewport').getBoundingClientRect();
  return {
    x: (clientX - rect.left - boardView.x) / boardView.scale,
    y: (clientY - rect.top  - boardView.y) / boardView.scale
  };
}

// ── РЕЖИМ РАЗМЕЩЕНИЯ ФОТО ────────────────────────────────────
// Считывает файлы, дожидается загрузки каждой картинки (чтобы знать её
// настоящий пиксельный размер), потом по очереди отдаёт их в тот же режим
// "нарисуй рамку протяжкой", что используется для фигур и текста.
function loadImagesForPlacement(files) {
  const results = new Array(files.length);
  let remaining = files.length;
  files.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        results[i] = { src: e.target.result, w: img.naturalWidth, h: img.naturalHeight };
        remaining--;
        if (remaining === 0) { photoQueue = results.filter(Boolean); beginNextPhotoPlacement(); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
function beginNextPhotoPlacement() {
  if (!photoQueue.length) return;
  pendingPhotoItem = photoQueue.shift();
  armShapeDraw('photo');
}

// ── ИНСТРУМЕНТ ────────────────────────────────────────────────
function setBoardTool(tool) {
  if (pendingShapeType) cancelShapeDraw();
  boardTool = tool;
  $$('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  const vp = $('boardViewport');
  vp.classList.remove('tool-move', 'tool-brush', 'tool-eraser');
  vp.classList.add('tool-' + tool);
  // В режиме рисования/ластика фото, текст и фигуры не должны перехватывать клики —
  // иначе рисование "спотыкалось" бы об них. В режиме курсора — наоборот, кликабельны.
  $('boardPhotos').style.pointerEvents = tool === 'move' ? 'auto' : 'none';
  $('boardTexts').style.pointerEvents  = tool === 'move' ? 'auto' : 'none';
  $('boardShapes').style.pointerEvents = tool === 'move' ? 'auto' : 'none';
}
on('toolMove',   'click', () => setBoardTool('move'));
on('toolBrush',  'click', () => setBoardTool('brush'));
on('toolEraser', 'click', () => setBoardTool('eraser'));

on('brushColor', 'input', e => { brushColor = e.target.value; });
on('brushSize',  'input', e => {
  brushSize = Number(e.target.value);
  $('brushSizeLabel').textContent = brushSize + ' px';
});

// ── ZOOM ────────────────────────────────────────────────────
function zoomBoardAt(anchorX, anchorY, factor) {
  const before = screenToWorld(anchorX, anchorY);
  boardView.scale = Math.max(0.15, Math.min(boardView.scale * factor, 5));
  const rect = $('boardViewport').getBoundingClientRect();
  boardView.x = anchorX - rect.left - before.x * boardView.scale;
  boardView.y = anchorY - rect.top  - before.y * boardView.scale;
  applyBoardTransform();
  saveBoardView();
}
on('boardZoomIn',  'click', () => {
  const r = $('boardViewport').getBoundingClientRect();
  zoomBoardAt(r.left + r.width/2, r.top + r.height/2, 1.25);
});
on('boardZoomOut', 'click', () => {
  const r = $('boardViewport').getBoundingClientRect();
  zoomBoardAt(r.left + r.width/2, r.top + r.height/2, 1/1.25);
});
on('boardZoomReset', 'click', () => {
  const vp = $('boardViewport').getBoundingClientRect();
  boardView = { x: vp.width/2, y: vp.height/2, scale: 1 };
  applyBoardTransform();
  saveBoardView();
});
$('boardViewport')?.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
  zoomBoardAt(e.clientX, e.clientY, factor);
}, { passive: false });

on('boardClearBtn', 'click', () => {
  showConfirm('Очистить доску?', 'Все фото, текст, фигуры и линии на доске будут удалены без возможности отмены.', () => {
    boardStrokes = []; saveBoardStrokes(); $('boardDrawSvg').innerHTML = '';
    boardPhotos  = []; saveBoardPhotos();  renderBoardPhotos();
    boardTexts   = []; saveBoardTexts();   renderBoardTexts();
    boardShapes  = []; saveBoardShapes();  renderBoardShapes();
  });
});

// ══════════════════════════════════════════════════════════
// ЛИНИИ — каждая линия это отдельный <path> в SVG со своим списком точек
// ══════════════════════════════════════════════════════════
function updateStrokePath(pathEl, stroke) {
  const d = stroke.points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  pathEl.setAttribute('d', d);
}

function renderBoardStrokes() {
  const svg = $('boardDrawSvg');
  svg.innerHTML = '';
  boardStrokes.forEach(s => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('stroke', s.color);
    el.setAttribute('stroke-width', s.size);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.dataset.id = s.id;
    updateStrokePath(el, s);
    svg.appendChild(el);
  });
}

function startStroke(p) {
  currentStroke = { id: uid(), points: [p], color: brushColor, size: brushSize };
  boardStrokes.push(currentStroke);
  currentStrokeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  currentStrokeEl.setAttribute('stroke', brushColor);
  currentStrokeEl.setAttribute('stroke-width', brushSize);
  currentStrokeEl.setAttribute('fill', 'none');
  currentStrokeEl.setAttribute('stroke-linecap', 'round');
  currentStrokeEl.setAttribute('stroke-linejoin', 'round');
  currentStrokeEl.dataset.id = currentStroke.id;
  updateStrokePath(currentStrokeEl, currentStroke);
  $('boardDrawSvg').appendChild(currentStrokeEl);
}
function continueStroke(p) {
  if (!currentStroke) return;
  currentStroke.points.push(p);
  updateStrokePath(currentStrokeEl, currentStroke);
}
function endStroke() {
  if (currentStroke) saveBoardStrokes();
  currentStroke = null;
  currentStrokeEl = null;
}

// ── ЛАСТИК: удаляет целиком объект (линию/фото/текст) под курсором ──
function pointInBox(pt, o) { return pt.x >= o.x && pt.x <= o.x + o.w && pt.y >= o.y && pt.y <= o.y + o.h; }

function hitTestBoard(worldPt) {
  for (let i = boardTexts.length - 1; i >= 0; i--)  if (pointInBox(worldPt, boardTexts[i]))  return { kind: 'text',  obj: boardTexts[i] };
  for (let i = boardShapes.length - 1; i >= 0; i--) if (pointInBox(worldPt, boardShapes[i])) return { kind: 'shape', obj: boardShapes[i] };
  for (let i = boardPhotos.length - 1; i >= 0; i--) if (pointInBox(worldPt, boardPhotos[i])) return { kind: 'photo', obj: boardPhotos[i] };
  return null;
}
function hitTestStroke(p) {
  const threshold = 14;
  for (let i = boardStrokes.length - 1; i >= 0; i--) {
    const s = boardStrokes[i];
    for (const pt of s.points) {
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= threshold + s.size / 2) return i;
    }
  }
  return -1;
}
function deleteBoardTarget(target) {
  if (target.kind === 'photo')      { boardPhotos = boardPhotos.filter(x => x.id !== target.obj.id); saveBoardPhotos(); renderBoardPhotos(); }
  else if (target.kind === 'shape') { boardShapes  = boardShapes.filter(x => x.id !== target.obj.id); saveBoardShapes(); renderBoardShapes(); }
  else                               { boardTexts   = boardTexts.filter(x => x.id !== target.obj.id);  saveBoardTexts();  renderBoardTexts(); }
}
function eraseAtPoint(p) {
  const hit = hitTestBoard(p);
  if (hit) { deleteBoardTarget(hit); return; }
  const idx = hitTestStroke(p);
  if (idx !== -1) {
    const removed = boardStrokes.splice(idx, 1)[0];
    const el = $('boardDrawSvg').querySelector(`[data-id="${removed.id}"]`);
    if (el) el.remove();
    saveBoardStrokes();
  }
}

// ── ПОДКЛЮЧЕНИЕ ВСЕХ СОБЫТИЙ ВЬЮПОРТА (вызывается 1 раз из initBoard) ──
function wireBoardEvents() {
  const vp = $('boardViewport');

  vp.addEventListener('pointerdown', e => {
    if (pendingShapeType) {
      vp.setPointerCapture(e.pointerId);
      startShapeDraw(screenToWorld(e.clientX, e.clientY));
      return;
    }
    // Клики по фото/тексту/фигуре и их ручкам обрабатывают их собственные слушатели
    if (e.target.closest('.board-photo') || e.target.closest('.board-text') || e.target.closest('.board-shape')) return;
    vp.setPointerCapture(e.pointerId);
    const p = screenToWorld(e.clientX, e.clientY);
    lastBoardMouseWorld = p;
    if (boardTool === 'move') {
      isPanning = true;
      vp.classList.add('panning');
      panStart = { x: e.clientX, y: e.clientY, vx: boardView.x, vy: boardView.y };
    } else if (boardTool === 'eraser') {
      isErasing = true;
      eraseAtPoint(p);
    } else {
      isDrawing = true;
      startStroke(p);
    }
  });

  vp.addEventListener('pointermove', e => {
    const p = screenToWorld(e.clientX, e.clientY);
    if (isDrawingShape) { updateShapeDrawRect(p); return; }
    lastBoardMouseWorld = p; // запоминаем, чтобы новый текст/фигура появлялись под курсором
    if (isPanning) {
      boardView.x = panStart.vx + (e.clientX - panStart.x);
      boardView.y = panStart.vy + (e.clientY - panStart.y);
      applyBoardTransform();
    } else if (isErasing) {
      eraseAtPoint(p);
    } else if (isDrawing) {
      continueStroke(p);
    }
  });

  const endGesture = e => {
    if (isDrawingShape) { finishShapeDraw(screenToWorld(e.clientX, e.clientY)); return; }
    if (isPanning) { isPanning = false; vp.classList.remove('panning'); saveBoardView(); }
    if (isErasing) { isErasing = false; }
    if (isDrawing) { isDrawing = false; endStroke(); }
  };
  vp.addEventListener('pointerup', endGesture);
  vp.addEventListener('pointercancel', endGesture);

  // Drag & drop файлов с компьютера прямо на доску
  vp.addEventListener('dragover', e => { e.preventDefault(); vp.classList.add('drag-over'); });
  vp.addEventListener('dragleave', e => { if (e.target === vp) vp.classList.remove('drag-over'); });
  vp.addEventListener('drop', e => {
    e.preventDefault();
    vp.classList.remove('drag-over');
    const dropPoint = screenToWorld(e.clientX, e.clientY);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      addPhotosToBoard(e.dataTransfer.files, dropPoint);
    } else if (dragImgId) {
      const img = images.find(i => i.id === dragImgId);
      if (img) addExistingImageToBoard(img, dropPoint);
    }
  });

  // Кнопка "Фото +" → диалог выбора файла → протяжкой рисуем рамку на холсте (как фигуру),
  // фото растягивается под неё; просто клик без протяжки ставит оригинальный размер.
  on('boardAddPhotoBtn', 'click', () => $('boardFileInput').click());
  on('boardFileInput', 'change', e => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length) loadImagesForPlacement(files);
  });

  // Кнопка "Текст +" и кнопки фигур → взводят режим рисования протяжкой (как в Ворде):
  // клик по кнопке, потом зажать левую кнопку мыши на холсте и потянуть — куда
  // потянул, туда блок и вырос (для текста это ещё и задаёт размер шрифта).
  // "Фото +" сюда не входит — ей сначала нужно выбрать файл, режим взводится позже.
  $$('.shape-btn').forEach(btn => {
    if (btn.id === 'boardAddPhotoBtn') return;
    btn.addEventListener('click', () => armShapeDraw(btn.dataset.shape));
  });

  const hideHint = () => $('boardHint')?.classList.add('hidden');
  vp.addEventListener('pointerdown', hideHint, { once: true });
  vp.addEventListener('drop', hideHint, { once: true });

  document.addEventListener('keydown', e => {
    if (!$('boardView').classList.contains('active')) return;
    if (e.key === 'Escape' && pendingShapeType) { cancelShapeDraw(); return; }
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'v' || e.key === 'з') setBoardTool('move');
    if (e.key === 'b' || e.key === 'и') setBoardTool('brush');
    if (e.key === 'e' || e.key === 'у') setBoardTool('eraser');
  });
}

// ══════════════════════════════════════════════════════════
// ФОТО НА ДОСКЕ
// ══════════════════════════════════════════════════════════
function addPhotosToBoard(fileList, atPoint) {
  Array.from(fileList).forEach((file, i) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const image = new Image();
      image.onload = () => {
        const w = image.naturalWidth, h = image.naturalHeight;
        boardPhotos.push({ id: uid(), src: e.target.result, x: atPoint.x - w/2 + i*26, y: atPoint.y - h/2 + i*26, w, h });
        saveBoardPhotos();
        renderBoardPhotos();
      };
      image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function addExistingImageToBoard(img, atPoint) {
  const image = new Image();
  image.onload = () => {
    const w = image.naturalWidth, h = image.naturalHeight;
    boardPhotos.push({ id: uid(), src: img.src, x: atPoint.x - w/2, y: atPoint.y - h/2, w, h });
    saveBoardPhotos();
    renderBoardPhotos();
  };
  image.src = img.src;
}

function renderBoardPhotos() {
  const wrap = $('boardPhotos');
  wrap.innerHTML = '';
  boardPhotos.forEach(p => {
    const el = document.createElement('div');
    el.className = 'board-photo';
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.style.width = p.w + 'px'; el.style.height = p.h + 'px';
    el.innerHTML = `
      <div class="bp-body"><img src="${p.src}" alt="" draggable="false"></div>
      <div class="bp-resize corner nw" data-corner="nw"></div>
      <div class="bp-resize corner ne" data-corner="ne"></div>
      <div class="bp-resize corner sw" data-corner="sw"></div>
      <div class="bp-resize corner se" data-corner="se"></div>
      <div class="bp-resize edge n" data-edge="n"></div>
      <div class="bp-resize edge s" data-edge="s"></div>
      <div class="bp-resize edge e" data-edge="e"></div>
      <div class="bp-resize edge w" data-edge="w"></div>
    `;
    wireGenericDrag(el.querySelector('.bp-body'), el, p, saveBoardPhotos);
    el.querySelectorAll('.corner').forEach(h => wireCornerResize(h, el, p, saveBoardPhotos));
    el.querySelectorAll('.edge').forEach(h => wireEdgeResize(h, el, p, saveBoardPhotos));
    wrap.appendChild(el);
  });
}

// Перетаскивание одной карточки (фото/фигуры) мышью/пальцем за её "тело" (только в режиме "move").
// obj — объект с x/y (в нём и меняются координаты), el — DOM-обёртка, saveFn — функция сохранения.
function wireGenericDrag(bodyEl, el, obj, saveFn) {
  bodyEl.addEventListener('pointerdown', e => {
    if (boardTool !== 'move' || pendingShapeType) return; // пока добавляем текст/фигуру/фото — существующие объекты не таскаем
    e.stopPropagation(); // чтобы не сработала панорама фона одновременно
    const startX = e.clientX, startY = e.clientY;
    const startPx = obj.x, startPy = obj.y;
    bodyEl.setPointerCapture(e.pointerId);
    const onMove = mv => {
      // Делим на boardView.scale, потому что мировые координаты и экранные
      // связаны масштабом камеры: 1px движения мыши при zoom=2 — это
      // всего 0.5px движения в "мире".
      obj.x = startPx + (mv.clientX - startX) / boardView.scale;
      obj.y = startPy + (mv.clientY - startY) / boardView.scale;
      el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px';
    };
    const onUp = () => {
      bodyEl.removeEventListener('pointermove', onMove);
      bodyEl.removeEventListener('pointerup', onUp);
      saveFn();
    };
    bodyEl.addEventListener('pointermove', onMove);
    bodyEl.addEventListener('pointerup', onUp);
  });
}

// Угловые ручки — пропорциональное масштабирование (противоположный угол неподвижен).
function wireCornerResize(handle, el, obj, saveFn, onLive) {
  const corner = handle.dataset.corner;
  handle.addEventListener('pointerdown', e => {
    if (pendingShapeType) return; // пока добавляем текст/фигуру/фото — существующие объекты не трогаем
    e.stopPropagation();
    const startX = e.clientX;
    const start = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    const ratio = start.h / start.w;
    handle.setPointerCapture(e.pointerId);
    const onMove = mv => {
      const dx = (mv.clientX - startX) / boardView.scale;
      const signX = corner.includes('w') ? -1 : 1;
      let newW = Math.max(60, start.w + signX * dx);
      let newH = newW * ratio;
      obj.w = newW; obj.h = newH;
      if (corner.includes('w')) obj.x = start.x + (start.w - newW);
      if (corner.includes('n')) obj.y = start.y + (start.h - newH);
      el.style.width = obj.w + 'px'; el.style.height = obj.h + 'px';
      el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px';
      if (onLive) onLive(obj, el);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      if (onLive) onLive(obj, el);
      saveFn();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

// Боковые ручки — свободное растягивание только по одной оси (без пропорций).
function wireEdgeResize(handle, el, obj, saveFn, onLive) {
  const edge = handle.dataset.edge;
  handle.addEventListener('pointerdown', e => {
    if (pendingShapeType) return; // пока добавляем текст/фигуру/фото — существующие объекты не трогаем
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const start = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    handle.setPointerCapture(e.pointerId);
    const onMove = mv => {
      const dx = (mv.clientX - startX) / boardView.scale;
      const dy = (mv.clientY - startY) / boardView.scale;
      if (edge === 'e') obj.w = Math.max(40, start.w + dx);
      if (edge === 'w') { obj.w = Math.max(40, start.w - dx); obj.x = start.x + (start.w - obj.w); }
      if (edge === 's') obj.h = Math.max(30, start.h + dy);
      if (edge === 'n') { obj.h = Math.max(30, start.h - dy); obj.y = start.y + (start.h - obj.h); }
      el.style.width = obj.w + 'px'; el.style.height = obj.h + 'px';
      el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px';
      if (onLive) onLive(obj, el);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      if (onLive) onLive(obj, el);
      saveFn();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

// ══════════════════════════════════════════════════════════
// ТЕКСТОВЫЕ БЛОКИ НА ДОСКЕ
// ══════════════════════════════════════════════════════════
// Добавляются протяжкой мыши точно так же, как фигуры — какого размера
// нарисовал рамку, такого размера и получится текст: размер шрифта
// подстраивается под высоту блока (крупнее рамка — крупнее буквы).
function textFontSizeFor(h) {
  return Math.max(12, Math.min(220, Math.round(h * 0.32)));
}
function updateTextVisual(t, el) {
  t.fontSize = textFontSizeFor(t.h);
  const content = el.querySelector('.bt-content');
  if (content) content.style.fontSize = t.fontSize + 'px';
}

function renderBoardTexts() {
  const wrap = $('boardTexts');
  wrap.innerHTML = '';
  boardTexts.forEach(t => {
    const el = document.createElement('div');
    el.className = 'board-text';
    el.dataset.id = t.id;
    el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
    el.style.width = t.w + 'px'; el.style.height = t.h + 'px';
    el.innerHTML = `
      <div class="bt-content" contenteditable="true" style="font-size:${t.fontSize}px;color:${t.color}">${t.text}</div>
      <div class="bp-resize corner nw" data-corner="nw"></div>
      <div class="bp-resize corner ne" data-corner="ne"></div>
      <div class="bp-resize corner sw" data-corner="sw"></div>
      <div class="bp-resize corner se" data-corner="se"></div>
      <div class="bp-resize edge n" data-edge="n"></div>
      <div class="bp-resize edge s" data-edge="s"></div>
      <div class="bp-resize edge e" data-edge="e"></div>
      <div class="bp-resize edge w" data-edge="w"></div>
    `;
    const content = el.querySelector('.bt-content');
    content.addEventListener('input', () => { t.text = content.innerText; saveBoardTexts(); });
    content.addEventListener('focus', () => el.classList.add('editing'));
    content.addEventListener('blur',  () => el.classList.remove('editing'));

    // Короткий клик по тексту входит в редактирование, клик с протяжкой — двигает блок.
    content.addEventListener('pointerdown', e => {
      if (boardTool !== 'move' || pendingShapeType) return; // пока добавляем текст/фигуру/фото — существующие объекты не таскаем
      if (document.activeElement === content) return; // уже редактируем — отдаём клик под выделение текста
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const startTx = t.x, startTy = t.y;
      let moved = false;
      content.setPointerCapture(e.pointerId);
      const onMove = mv => {
        const dx = mv.clientX - startX, dy = mv.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        t.x = startTx + dx / boardView.scale;
        t.y = startTy + dy / boardView.scale;
        el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
      };
      const onUp = () => {
        content.removeEventListener('pointermove', onMove);
        content.removeEventListener('pointerup', onUp);
        if (moved) saveBoardTexts();
        else content.focus(); // просто клик — входим в редактирование текста
      };
      content.addEventListener('pointermove', onMove);
      content.addEventListener('pointerup', onUp);
    });

    el.querySelectorAll('.corner').forEach(h => wireCornerResize(h, el, t, saveBoardTexts, () => updateTextVisual(t, el)));
    el.querySelectorAll('.edge').forEach(h => wireEdgeResize(h, el, t, saveBoardTexts, () => updateTextVisual(t, el)));

    wrap.appendChild(el);
  });
}

// ══════════════════════════════════════════════════════════
// ФИГУРЫ, ТЕКСТ И ФОТО — общий режим рисования протяжкой
// ══════════════════════════════════════════════════════════

// ── нажал кнопку (фигура/текст/фото) → следующий клик+протяжка на холсте
// задаёт прямоугольник (как в Ворде) — куда потянул, туда и выросло ──
let pendingShapeType   = null; // 'rect' | 'circle' | 'triangle' | 'text' | 'photo'
let isDrawingShape     = false;
let shapeDrawStart     = null;
let shapeDrawPreviewEl = null;

function armShapeDraw(type) {
  pendingShapeType = type;
  $$('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === type));
  $('boardViewport').classList.add('drawing-shape');
}
function cancelShapeDraw() {
  pendingShapeType = null;
  pendingPhotoItem = null;
  photoQueue = [];
  isDrawingShape = false;
  shapeDrawStart = null;
  $$('.shape-btn').forEach(b => b.classList.remove('active'));
  $('boardViewport').classList.remove('drawing-shape');
  if (shapeDrawPreviewEl) { shapeDrawPreviewEl.remove(); shapeDrawPreviewEl = null; }
}
function startShapeDraw(p) {
  isDrawingShape = true;
  shapeDrawStart = p;
  shapeDrawPreviewEl = document.createElement('div');
  shapeDrawPreviewEl.className = 'shape-draw-preview';
  if (pendingShapeType === 'photo' && pendingPhotoItem) {
    // для фото в рамке сразу видно саму картинку, растянутую под текущий размер рамки
    shapeDrawPreviewEl.style.backgroundImage = `url(${pendingPhotoItem.src})`;
  }
  $('boardWorld').appendChild(shapeDrawPreviewEl);
  updateShapeDrawRect(p);
}
function updateShapeDrawRect(p) {
  if (!shapeDrawPreviewEl) return;
  const x = Math.min(shapeDrawStart.x, p.x), y = Math.min(shapeDrawStart.y, p.y);
  const w = Math.abs(p.x - shapeDrawStart.x), h = Math.abs(p.y - shapeDrawStart.y);
  shapeDrawPreviewEl.style.left = x + 'px'; shapeDrawPreviewEl.style.top = y + 'px';
  shapeDrawPreviewEl.style.width = w + 'px'; shapeDrawPreviewEl.style.height = h + 'px';
}
function finishShapeDraw(p) {
  const x0 = shapeDrawStart.x, y0 = shapeDrawStart.y;
  let x = Math.min(x0, p.x), y = Math.min(y0, p.y);
  let w = Math.abs(p.x - x0), h = Math.abs(p.y - y0);
  const isText = pendingShapeType === 'text';
  const isPhoto = pendingShapeType === 'photo';
  if (w < 12 || h < 12) {
    // просто клик без протяжки — блок стандартного размера, по центру клика
    // (для фото — его настоящий пиксельный размер)
    if (isPhoto) { w = pendingPhotoItem.w; h = pendingPhotoItem.h; }
    else { w = isText ? 220 : 160; h = isText ? 48 : (pendingShapeType === 'circle' ? 160 : 120); }
    x = x0 - w/2; y = y0 - h/2;
  }
  if (isText) {
    const t = { id: uid(), x, y, w, h, text: 'Текст', color: '#1c1916', fontSize: textFontSizeFor(h) };
    boardTexts.push(t);
    saveBoardTexts();
    renderBoardTexts();
    const contentEl = $('boardTexts').querySelector(`[data-id="${t.id}"] .bt-content`);
    if (contentEl) { contentEl.focus(); document.execCommand('selectAll', false, null); }
  } else if (isPhoto) {
    boardPhotos.push({ id: uid(), src: pendingPhotoItem.src, x, y, w, h });
    saveBoardPhotos();
    renderBoardPhotos();
  } else {
    boardShapes.push({ id: uid(), type: pendingShapeType, x, y, w, h, color: brushColor, strokeWidth: brushSize });
    saveBoardShapes();
    renderBoardShapes();
  }

  if (isDrawingShape) { isDrawingShape = false; shapeDrawStart = null; }
  if (shapeDrawPreviewEl) { shapeDrawPreviewEl.remove(); shapeDrawPreviewEl = null; }

  if (isPhoto && photoQueue.length) {
    // выбрали сразу несколько файлов — сразу предлагаем нарисовать рамку для следующего
    pendingPhotoItem = photoQueue.shift();
    armShapeDraw('photo');
    return;
  }
  cancelShapeDraw();
  setBoardTool('move'); // как в Ворде — после рисования фигуры/блока возвращаемся к курсору
}

// Толщина обводки = толщина кисти на момент создания фигуры (та же настройка,
// что и для рисования), а vector-effect="non-scaling-stroke" не даёт ей "плыть"
// по-разному на разных сторонах, если фигуру растянули не пропорционально.
function shapeSvgInner(type, color, strokeW) {
  const common = `fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linejoin="miter" vector-effect="non-scaling-stroke"`;
  if (type === 'circle')   return `<ellipse cx="50" cy="50" rx="45" ry="45" ${common}/>`;
  if (type === 'triangle') return `<polygon points="50,5 96,95 4,95" ${common}/>`;
  return `<rect x="5" y="5" width="90" height="90" ${common}/>`; // rect
}

function renderBoardShapes() {
  const wrap = $('boardShapes');
  wrap.innerHTML = '';
  boardShapes.forEach(s => {
    const el = document.createElement('div');
    el.className = 'board-shape';
    el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    el.style.width = s.w + 'px'; el.style.height = s.h + 'px';
    el.innerHTML = `
      <div class="bp-body"><svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">${shapeSvgInner(s.type, s.color, s.strokeWidth || 5)}</svg></div>
      <div class="bp-resize corner nw" data-corner="nw"></div>
      <div class="bp-resize corner ne" data-corner="ne"></div>
      <div class="bp-resize corner sw" data-corner="sw"></div>
      <div class="bp-resize corner se" data-corner="se"></div>
      <div class="bp-resize edge n" data-edge="n"></div>
      <div class="bp-resize edge s" data-edge="s"></div>
      <div class="bp-resize edge e" data-edge="e"></div>
      <div class="bp-resize edge w" data-edge="w"></div>
    `;
    wireGenericDrag(el.querySelector('.bp-body'), el, s, saveBoardShapes);
    el.querySelectorAll('.corner').forEach(h => wireCornerResize(h, el, s, saveBoardShapes));
    el.querySelectorAll('.edge').forEach(h => wireEdgeResize(h, el, s, saveBoardShapes));
    wrap.appendChild(el);
  });
}

// ── INIT ───────────────────────────────────────────────────
renderAll();
