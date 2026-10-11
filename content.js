(() => {
  'use strict';

  // Instagram web istemcisinin kendi kullandığı uygulama kimliği.
  const IG_APP_ID = '936619743392459';
  const ROOT_ID = 'igsz-root';
  const CACHE_MS = 60_000;

  const userIdCache = new Map();
  const reelCache = new Map();

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  const ICONS = {
    zoom: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    reset: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
  };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.append(c);
    return node;
  }

  function toast(message, isError = false) {
    let box = document.getElementById('igsz-toast');
    if (!box) {
      box = el('div', { id: 'igsz-toast' });
      document.body.append(box);
    }
    box.textContent = message;
    box.classList.toggle('igsz-error', isError);
    box.classList.add('igsz-show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => box.classList.remove('igsz-show'), 2600);
  }

  function parseStoryPath(pathname = location.pathname) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'stories' || !parts[1]) return null;
    if (parts[1] === 'highlights') {
      if (!parts[2]) return null;
      return { reelId: `highlight:${parts[2]}`, username: null, mediaId: parts[3] || null, label: `highlight_${parts[2]}` };
    }
    return { reelId: null, username: parts[1], mediaId: parts[2] || null, label: parts[1] };
  }

  const isStoryPage = () => parseStoryPath() !== null;

  // ---------------------------------------------------------------------------
  // Instagram API (sayfanın kendi oturum çerezleriyle, aynı origin'den)
  // ---------------------------------------------------------------------------

  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function igApi(path) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-IG-App-ID': IG_APP_ID,
        'X-CSRFToken': csrfToken(),
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (!res.ok) throw new Error(`Instagram API hatası (${res.status})`);
    return res.json();
  }

  async function getUserId(username) {
    if (userIdCache.has(username)) return userIdCache.get(username);
    const json = await igApi(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    const id = json?.data?.user?.id;
    if (!id) throw new Error('Kullanıcı bulunamadı');
    userIdCache.set(username, id);
    return id;
  }

  async function getReelItems(reelId, force = false) {
    const cached = reelCache.get(reelId);
    if (!force && cached && Date.now() - cached.time < CACHE_MS) return cached.items;
    const json = await igApi(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`);
    const reel = json?.reels?.[reelId] || json?.reels_media?.find((r) => String(r.id) === String(reelId)) || json?.reels_media?.[0];
    const items = reel?.items || [];
    reelCache.set(reelId, { time: Date.now(), items });
    return items;
  }

  function largest(list) {
    let best = null;
    let bestArea = -1;
    for (const c of list || []) {
      const area = (c.width || 0) * (c.height || 0);
      if (area > bestArea) {
        best = c;
        bestArea = area;
      }
    }
    return best;
  }

  function itemPk(item) {
    return String(item.pk ?? String(item.id ?? '').split('_')[0]);
  }

  function itemToMedia(item, fallbackLabel) {
    const video = largest(item.video_versions);
    const image = largest(item.image_versions2?.candidates);
    const owner = item.user?.username || fallbackLabel;
    if (video) return { type: 'video', url: video.url, poster: image?.url || '', id: itemPk(item), owner };
    if (image) return { type: 'image', url: image.url, id: itemPk(item), owner };
    return null;
  }

  function fileKey(url) {
    try {
      return new URL(url, location.href).pathname.split('/').pop() || '';
    } catch {
      return '';
    }
  }

  function matchItemByFile(items, domUrls) {
    const keys = new Set(domUrls.map(fileKey).filter(Boolean));
    if (!keys.size) return null;
    return (
      items.find((item) => {
        const urls = [
          ...(item.image_versions2?.candidates || []).map((c) => c.url),
          ...(item.video_versions || []).map((v) => v.url)
        ];
        return urls.some((u) => keys.has(fileKey(u)));
      }) || null
    );
  }

  // ---------------------------------------------------------------------------
  // DOM'dan aktif hikaye medyasını bulma (API başarısız olursa yedek yol)
  // ---------------------------------------------------------------------------

  function visibleRect(node) {
    const r = node.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return { rect: r, area: w * h };
  }

  function findActiveDomMedia() {
    let best = null;
    let bestArea = 0;
    let bestVideo = null;
    let bestVideoArea = 0;
    for (const node of document.querySelectorAll('img, video')) {
      if (node.closest(`#${ROOT_ID}, #igsz-overlay`)) continue;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const { area } = visibleRect(node);
      if (area > bestArea) {
        best = node;
        bestArea = area;
      }
      if (node.tagName === 'VIDEO' && area > bestVideoArea) {
        bestVideo = node;
        bestVideoArea = area;
      }
    }
    // Video hikayelerde videonun üstünde/altında aynı boyutta bir poster görseli olabilir.
    if (bestVideo && bestVideoArea >= bestArea * 0.8) best = bestVideo;
    // Profil fotoğrafı gibi küçük görselleri hikaye sanma.
    if (!best || bestArea < 40_000) return null;
    return best;
  }

  function bestFromSrcset(img) {
    const srcset = img.getAttribute('srcset');
    if (!srcset) return img.currentSrc || img.src;
    let bestUrl = img.currentSrc || img.src;
    let bestW = 0;
    for (const part of srcset.split(',')) {
      const [url, size] = part.trim().split(/\s+/);
      const w = parseInt(size, 10) || 0;
      if (url && w > bestW) {
        bestW = w;
        bestUrl = url;
      }
    }
    return bestUrl;
  }

  function domMediaInfo(node) {
    if (node.tagName === 'VIDEO') {
      const src = node.currentSrc || node.src || node.querySelector('source')?.src || '';
      return { type: 'video', url: src, poster: node.poster || '', node, urls: [src, node.poster].filter(Boolean) };
    }
    const url = bestFromSrcset(node);
    return { type: 'image', url, node, urls: [url, node.currentSrc || node.src].filter(Boolean) };
  }

  // ---------------------------------------------------------------------------
  // Aktif hikayeyi çöz
  // ---------------------------------------------------------------------------

  async function resolveCurrentMedia() {
    const info = parseStoryPath();
    if (!info) throw new Error('Açık bir hikaye yok');

    const domNode = findActiveDomMedia();
    const dom = domNode ? domMediaInfo(domNode) : null;

    try {
      const reelId = info.reelId || (await getUserId(info.username));
      const pick = (items) => {
        if (info.mediaId) {
          const byId = items.find((it) => itemPk(it) === info.mediaId);
          if (byId) return byId;
        }
        if (dom) {
          const byFile = matchItemByFile(items, dom.urls);
          if (byFile) return byFile;
        }
        return items.length === 1 ? items[0] : null;
      };

      let item = pick(await getReelItems(reelId));
      // Önbellekte yoksa yeni eklenmiş bir hikaye olabilir: bir kez taze çek.
      if (!item) item = pick(await getReelItems(reelId, true));
      if (item) {
        const media = itemToMedia(item, info.label);
        if (media) return { ...media, domNode };
      }
    } catch (err) {
      console.warn('[Story Zoom] API ile çözülemedi, sayfadaki medyaya dönülüyor:', err);
    }

    if (dom && dom.url && !dom.url.startsWith('blob:')) {
      return { ...dom, id: info.mediaId || String(Date.now()), owner: info.label, domNode };
    }
    throw new Error('Hikaye medyası bulunamadı. Sayfayı yenileyip tekrar deneyin.');
  }

  function buildFilename(media) {
    let ext = media.type === 'video' ? 'mp4' : 'jpg';
    const m = fileKey(media.url).match(/\.([a-z0-9]{2,5})$/i);
    if (m) ext = m[1].toLowerCase();
    const safe = (s) => String(s || 'instagram').replace(/[^\w.-]+/g, '_').slice(0, 80);
    return `Instagram Stories/${safe(media.owner)}_${safe(media.id)}.${ext}`;
  }

  async function downloadMedia(media) {
    const res = await chrome.runtime.sendMessage({
      type: 'igsz-download',
      url: media.url,
      filename: buildFilename(media)
    });
    if (!res?.ok) throw new Error(res?.error || 'İndirme başarısız');
    toast('İndirme başladı ✓');
  }

  // ---------------------------------------------------------------------------
  // Instagram'ın hikaye oynatıcısını duraklat / devam ettir (en iyi çaba)
  // ---------------------------------------------------------------------------

  const PAUSE_LABELS = /^(pause|duraklat|pausar|pausieren|mettre en pause|pausa|metti in pausa|приостановить|пауза)$/i;
  const PLAY_LABELS = /^(play|oynat|reproducir|abspielen|wiedergeben|lire|riproduci|воспроизвести)$/i;

  function clickStoryControl(labelRe, near) {
    const nearRect = near?.getBoundingClientRect();
    for (const svg of document.querySelectorAll('svg[aria-label]')) {
      if (svg.closest('#igsz-overlay, #' + ROOT_ID)) continue;
      if (!labelRe.test(svg.getAttribute('aria-label').trim())) continue;
      if (nearRect) {
        const r = svg.getBoundingClientRect();
        if (r.right < nearRect.left || r.left > nearRect.right || r.bottom < nearRect.top - 80 || r.top > nearRect.bottom) continue;
      }
      const target = svg.closest('[role="button"], button') || svg.parentElement;
      target?.click();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Zoom görüntüleyici
  // ---------------------------------------------------------------------------

  let viewer = null;

  function openViewer(media) {
    closeViewer();

    const pausedStory = clickStoryControl(PAUSE_LABELS, media.domNode);
    document.querySelectorAll('video').forEach((v) => {
      if (!v.closest('#igsz-overlay')) v.pause();
    });

    const state = { scale: 1, x: 0, y: 0, baseW: 0, baseH: 0, W: 0, H: 0 };
    const MIN = 1;
    const MAX = 12;

    const isVideo = media.type === 'video';
    const mediaEl = isVideo
      ? el('video', { class: 'igsz-media', src: media.url, poster: media.poster || '', autoplay: '', loop: '', playsinline: '' })
      : el('img', { class: 'igsz-media', src: media.url, alt: '', draggable: 'false' });

    const stage = el('div', { class: 'igsz-stage' }, [mediaEl]);
    const zoomLabel = el('span', { class: 'igsz-zoom-label', text: '100%' });

    const btn = (icon, title, onclick) =>
      el('button', { class: 'igsz-btn', type: 'button', title, 'aria-label': title, html: icon, onclick });

    const playBtn = isVideo ? btn(ICONS.pause, 'Oynat / Duraklat (Boşluk)', () => togglePlay()) : null;
    const muteBtn = isVideo ? btn(ICONS.soundOn, 'Ses (M)', () => toggleMute()) : null;
    const seek = isVideo ? el('input', { class: 'igsz-seek', type: 'range', min: '0', max: '1000', value: '0', title: 'Sar' }) : null;

    const bar = el('div', { class: 'igsz-bar' }, [
      ...(isVideo ? [playBtn, muteBtn, seek, el('span', { class: 'igsz-sep' })] : []),
      btn(ICONS.minus, 'Uzaklaştır (-)', () => zoomAtCenter(1 / 1.4)),
      zoomLabel,
      btn(ICONS.plus, 'Yakınlaştır (+)', () => zoomAtCenter(1.4)),
      btn(ICONS.reset, 'Sığdır (0)', () => reset()),
      el('span', { class: 'igsz-sep' }),
      btn(ICONS.download, 'İndir (D)', () => doDownload()),
      btn(ICONS.close, 'Kapat (Esc)', () => closeViewer())
    ]);

    const hint = el('div', { class: 'igsz-hint', text: 'Tekerlek / iki parmak: yakınlaştır · Sürükle: kaydır · Çift tık: 1×/3×' });
    const overlay = el('div', { id: 'igsz-overlay', tabindex: '-1' }, [stage, bar, hint]);
    document.body.append(overlay);
    overlay.focus();
    setTimeout(() => hint.classList.add('igsz-fade'), 2500);

    // --- yerleşim ---
    function naturalSize() {
      return isVideo ? [mediaEl.videoWidth, mediaEl.videoHeight] : [mediaEl.naturalWidth, mediaEl.naturalHeight];
    }

    function layout() {
      const [nw, nh] = naturalSize();
      if (!nw || !nh) return;
      state.W = stage.clientWidth;
      state.H = stage.clientHeight;
      const fit = Math.min(state.W / nw, state.H / nh);
      state.baseW = nw * fit;
      state.baseH = nh * fit;
      mediaEl.style.width = `${state.baseW}px`;
      mediaEl.style.height = `${state.baseH}px`;
      reset();
    }

    function clamp() {
      const w = state.baseW * state.scale;
      const h = state.baseH * state.scale;
      state.x = w <= state.W ? (state.W - w) / 2 : Math.min(0, Math.max(state.W - w, state.x));
      state.y = h <= state.H ? (state.H - h) / 2 : Math.min(0, Math.max(state.H - h, state.y));
    }

    function apply() {
      clamp();
      mediaEl.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      const [nw] = naturalSize();
      // Yüzde, orijinal piksel boyutuna göre (100% = gerçek çözünürlük).
      const real = nw ? (state.baseW * state.scale) / nw : state.scale;
      zoomLabel.textContent = `${Math.round(real * 100)}%`;
      stage.classList.toggle('igsz-zoomed', state.scale > 1.001);
    }

    function zoomAt(cx, cy, factor) {
      const next = Math.min(MAX, Math.max(MIN, state.scale * factor));
      const k = next / state.scale;
      state.x = cx - (cx - state.x) * k;
      state.y = cy - (cy - state.y) * k;
      state.scale = next;
      apply();
    }

    function zoomAtCenter(factor) {
      zoomAt(state.W / 2, state.H / 2, factor);
    }

    function reset() {
      state.scale = 1;
      state.x = (state.W - state.baseW) / 2;
      state.y = (state.H - state.baseH) / 2;
      apply();
    }

    function stagePoint(e) {
      const r = stage.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    // --- video ---
    function togglePlay() {
      if (!isVideo) return;
      if (mediaEl.paused) mediaEl.play().catch(() => {});
      else mediaEl.pause();
    }
    function toggleMute() {
      if (!isVideo) return;
      mediaEl.muted = !mediaEl.muted;
    }
    if (isVideo) {
      mediaEl.addEventListener('play', () => (playBtn.innerHTML = ICONS.pause));
      mediaEl.addEventListener('pause', () => (playBtn.innerHTML = ICONS.play));
      mediaEl.addEventListener('volumechange', () => (muteBtn.innerHTML = mediaEl.muted ? ICONS.soundOff : ICONS.soundOn));
      mediaEl.addEventListener('timeupdate', () => {
        if (mediaEl.duration && !seek.matches(':active')) seek.value = String((mediaEl.currentTime / mediaEl.duration) * 1000);
      });
      seek.addEventListener('input', () => {
        if (mediaEl.duration) mediaEl.currentTime = (Number(seek.value) / 1000) * mediaEl.duration;
      });
      mediaEl.addEventListener('loadedmetadata', layout);
      mediaEl.play().catch(() => {
        // Sesli otomatik oynatma engellendiyse sessiz dene.
        mediaEl.muted = true;
        mediaEl.play().catch(() => {});
      });
    } else {
      if (mediaEl.complete && mediaEl.naturalWidth) requestAnimationFrame(layout);
      else mediaEl.addEventListener('load', layout);
    }
    mediaEl.addEventListener('error', () => toast('Medya yüklenemedi', true));

    // --- fare / dokunmatik ---
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [cx, cy] = stagePoint(e);
        // ctrlKey: touchpad'de iki parmakla sıkıştırma hareketi.
        const speed = e.ctrlKey ? 0.01 : 0.0015;
        zoomAt(cx, cy, Math.exp(-e.deltaY * speed));
      },
      { passive: false }
    );

    const pointers = new Map();
    let pinchStart = null;
    let dragMoved = false;

    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      dragMoved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: state.scale };
      }
      stage.classList.add('igsz-dragging');
    });

    stage.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);

      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const r = stage.getBoundingClientRect();
        const cx = (a[0] + b[0]) / 2 - r.left;
        const cy = (a[1] + b[1]) / 2 - r.top;
        const target = pinchStart.scale * (dist / pinchStart.dist);
        zoomAt(cx, cy, target / state.scale);
        dragMoved = true;
        return;
      }

      const dx = e.clientX - prev[0];
      const dy = e.clientY - prev[1];
      if (Math.abs(dx) + Math.abs(dy) > 0) dragMoved = true;
      state.x += dx;
      state.y += dy;
      apply();
    });

    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (!pointers.size) stage.classList.remove('igsz-dragging');
    };
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);

    stage.addEventListener('dblclick', (e) => {
      const [cx, cy] = stagePoint(e);
      if (state.scale > 1.05) reset();
      else zoomAt(cx, cy, 3);
    });

    // Boş alana tıklayınca kapat (sürükleme sonrası değil).
    stage.addEventListener('click', (e) => {
      if (e.target === stage && !dragMoved) closeViewer();
    });

    // --- klavye: Instagram'ın ok tuşlarıyla hikaye değiştirmesini engelle ---
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      const handled = (() => {
        switch (e.key) {
          case 'Escape': closeViewer(); return true;
          case '+': case '=': zoomAtCenter(1.4); return true;
          case '-': case '_': zoomAtCenter(1 / 1.4); return true;
          case '0': reset(); return true;
          case 'd': case 'D': doDownload(); return true;
          case ' ': togglePlay(); return true;
          case 'm': case 'M': toggleMute(); return true;
          case 'ArrowLeft': state.x += 60; apply(); return true;
          case 'ArrowRight': state.x -= 60; apply(); return true;
          case 'ArrowUp': state.y += 60; apply(); return true;
          case 'ArrowDown': state.y -= 60; apply(); return true;
          default: return false;
        }
      })();
      if (handled) e.preventDefault();
      e.stopImmediatePropagation();
    };
    const swallow = (e) => e.stopImmediatePropagation();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', swallow, true);
    window.addEventListener('keypress', swallow, true);

    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    async function doDownload() {
      try {
        await downloadMedia(media);
      } catch (err) {
        toast(err.message, true);
      }
    }

    viewer = {
      destroy() {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', swallow, true);
        window.removeEventListener('keypress', swallow, true);
        window.removeEventListener('resize', onResize);
        if (isVideo) {
          mediaEl.pause();
          mediaEl.removeAttribute('src');
          mediaEl.load();
        }
        overlay.remove();
        if (pausedStory) clickStoryControl(PLAY_LABELS, media.domNode?.isConnected ? media.domNode : null);
      }
    };
  }

  function closeViewer() {
    if (!viewer) return;
    const v = viewer;
    viewer = null;
    v.destroy();
  }

  // ---------------------------------------------------------------------------
  // Hikaye sayfasında yüzen butonlar
  // ---------------------------------------------------------------------------

  let busy = false;

  async function run(action) {
    if (busy) return;
    busy = true;
    root?.classList.add('igsz-busy');
    try {
      const media = await resolveCurrentMedia();
      if (action === 'zoom') openViewer(media);
      else await downloadMedia(media);
    } catch (err) {
      toast(err.message || String(err), true);
    } finally {
      busy = false;
      root?.classList.remove('igsz-busy');
    }
  }

  let root = null;

  function ensureToolbar() {
    if (root && root.isConnected) return;
    root = el('div', { id: ROOT_ID }, [
      el('button', { class: 'igsz-fab', type: 'button', title: 'Hikayeyi yakınlaştır (Alt+Z)', 'aria-label': 'Hikayeyi yakınlaştır', html: ICONS.zoom, onclick: () => run('zoom') }),
      el('button', { class: 'igsz-fab', type: 'button', title: 'Hikayeyi indir (Alt+D)', 'aria-label': 'Hikayeyi indir', html: ICONS.download, onclick: () => run('download') })
    ]);
    // Instagram tıklamayı "sonraki hikaye" olarak algılamasın.
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'touchstart']) {
      root.addEventListener(type, (e) => e.stopPropagation());
    }
    document.body.append(root);
  }

  function syncToolbar() {
    if (isStoryPage()) {
      ensureToolbar();
      root.hidden = false;
    } else {
      if (root) root.hidden = true;
      closeViewer();
    }
  }

  window.addEventListener('keydown', (e) => {
    if (viewer || !e.altKey || !isStoryPage()) return;
    if (e.code === 'KeyZ') {
      e.preventDefault();
      run('zoom');
    } else if (e.code === 'KeyD') {
      e.preventDefault();
      run('download');
    }
  });

  // Instagram tek sayfalık bir uygulama; URL değişimini izle.
  let lastPath = '';
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      syncToolbar();
    }
  }, 400);
  syncToolbar();
})();
