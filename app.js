// ================= STATE =================

let images = JSON.parse(localStorage.getItem('gal_images') || '[]');
let collections = JSON.parse(localStorage.getItem('gal_collections') || '[]');

let activeCol = 'all';

let lbIndex = 0;
let lbZoom = 1;

const $ = id => document.getElementById(id);

// ================= SAVE =================

function save() {
  localStorage.setItem('gal_images', JSON.stringify(images));
  localStorage.setItem('gal_collections', JSON.stringify(collections));
}

// ================= FILTER =================

function getFiltered() {
  if (activeCol === 'all') return images;
  return images.filter(img => img.col === activeCol);
}

// ================= RENDER IMAGES =================

function renderImages() {
  const container = $('imagesContainer');
  container.innerHTML = '';

  const filtered = getFiltered();

  filtered.forEach((img, index) => {
    const el = document.createElement('img');
    el.src = img.src;
    el.className = 'gallery-image';

    // 🔥 ГЛАВНОЕ — обработчик клика
    el.addEventListener('click', () => {
      openLightbox(index);
    });

    container.appendChild(el);
  });
}

// ================= LIGHTBOX =================

function openLightbox(index) {
  const filtered = getFiltered();
  if (!filtered.length) return;

  lbIndex = index;
  lbZoom = 1;

  $('lbImg').src = filtered[lbIndex].src;
  $('lbImg').style.transform = 'scale(1)';

  $('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  $('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function nextImage() {
  const filtered = getFiltered();
  if (!filtered.length) return;

  lbIndex = (lbIndex + 1) % filtered.length;
  $('lbImg').src = filtered[lbIndex].src;
  resetZoom();
}

function prevImage() {
  const filtered = getFiltered();
  if (!filtered.length) return;

  lbIndex = (lbIndex - 1 + filtered.length) % filtered.length;
  $('lbImg').src = filtered[lbIndex].src;
  resetZoom();
}

// ================= ZOOM =================

function resetZoom() {
  lbZoom = 1;
  $('lbImg').style.transform = 'scale(1)';
}

$('lbImg')?.addEventListener('click', e => {
  e.stopPropagation();

  lbZoom = lbZoom === 1 ? 2 : 1;
  $('lbImg').style.transform = `scale(${lbZoom})`;
});

// ================= EVENTS =================

$('lbClose')?.addEventListener('click', closeLightbox);
$('lbNextBtn')?.addEventListener('click', nextImage);
$('lbPrevBtn')?.addEventListener('click', prevImage);

$('lightbox')?.addEventListener('click', e => {
  if (e.target.id === 'lightbox') closeLightbox();
});

document.addEventListener('keydown', e => {
  if (!$('lightbox').classList.contains('open')) return;

  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') nextImage();
  if (e.key === 'ArrowLeft') prevImage();
});

// ================= INIT =================

renderImages();
