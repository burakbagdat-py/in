(() => {
  'use strict';

  // Aynı sayfaya iki kez yüklenmesin (gömülü kod + uzaktan güncellenen kod).
  if (window.__igszLoaded) return;
  window.__igszLoaded = true;

  const VERSION = '2.2.0';

  // Instagram web istemcisinin kendi kullandığı uygulama kimliği.
  const IG_APP_ID = '936619743392459';
  const UI_SELECTOR = '#igsz-root, #igsz-overlay, #igsz-preview, #igsz-toast';
  const CACHE_MS = 60_000;
  const HOVER_DELAY = 250;
  const MIN_MEDIA = 100; // Bundan küçük görseller (avatarlar vb.) sadece hikaye halkasıysa açılır.

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  // İkonlar innerHTML olmadan kurulur: Instagram "Trusted Types" ile innerHTML'i engelleyebiliyor.
  const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const F = { fill: 'currentColor' };
  const ICONS = {
    zoom: [S, ['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'M21 21l-4.3-4.3M11 8v6M8 11h6' }]],
    download: [S, ['path', { d: 'M12 3v12M7 10l5 5 5-5M5 21h14' }]],
    close: [S, ['path', { d: 'M6 6l12 12M18 6L6 18' }]],
    plus: [S, ['path', { d: 'M12 5v14M5 12h14' }]],
    minus: [S, ['path', { d: 'M5 12h14' }]],
    reset: [S, ['path', { d: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6' }]],
    prev: [S, ['path', { d: 'M15 5l-7 7 7 7' }]],
    next: [S, ['path', { d: 'M9 5l7 7-7 7' }]],
    play: [F, ['path', { d: 'M7 4.5v15l13-7.5z' }]],
    pause: [F, ['rect', { x: 6, y: 4.5, width: 4, height: 15, rx: 1 }], ['rect', { x: 14, y: 4.5, width: 4, height: 15, rx: 1 }]],
    soundOn: [S, ['path', { d: 'M4 9v6h4l5 4V5L8 9z' }], ['path', { d: 'M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12' }]],
    soundOff: [S, ['path', { d: 'M4 9v6h4l5 4V5L8 9z' }], ['path', { d: 'M17 9l5 6M22 9l-5 6' }]]
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function icon(name, size = 20) {
    const [rootAttrs, ...children] = ICONS[name];
    const svg = document.createElementNS(SVG_NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, ...rootAttrs })) svg.setAttribute(k, v);
    for (const [tag, attrs] of children) {
      const child = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
      svg.append(child);
    }
    return svg;
  }

  function setIcon(button, name, size) {
    button.replaceChildren(icon(name, size));
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.append(c);
    return node;
  }

  function iconButton(cls, name, title, onclick, size) {
    return el('button', { class: cls, type: 'button', title, 'aria-label': title, onclick }, [icon(name, size)]);
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isTyping(e) {
    const t = e.target;
    return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
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

  function wwwClaim() {
    try {
      return sessionStorage.getItem('www-claim-v2') || '0';
    } catch {
      return '0';
    }
  }

  async function igApi(path) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-IG-App-ID': IG_APP_ID,
        'X-CSRFToken': csrfToken(),
        'X-Requested-With': 'XMLHttpRequest',
        'X-ASBD-ID': '129477',
        // Instagram web istemcisi bu başlığı her istekte gönderir; bazı uç noktalar onsuz boş döner.
        'X-IG-WWW-Claim': wwwClaim()
      }
    });
    if (res.status === 401 || res.status === 403) throw new Error('Instagram oturumu bulunamadı, giriş yapıp sayfayı yenileyin');
    if (res.status === 429) throw new Error('Instagram çok fazla istek dedi, biraz bekleyip tekrar deneyin');
    if (!res.ok) throw new Error(`Instagram API hatası (${res.status})`);
    return res.json();
  }

  // Aynı isteği kısa süre içinde tekrar atmamak için basit önbellek.
  const apiCache = new Map();
  function cached(key, loader, force = false) {
    const hit = apiCache.get(key);
    if (!force && hit && Date.now() - hit.time < CACHE_MS) return hit.promise;
    const promise = loader();
    apiCache.set(key, { time: Date.now(), promise });
    promise.catch(() => apiCache.delete(key));
    return promise;
  }

  function getProfile(username) {
    return cached(`profile:${username}`, async () => {
      const json = await igApi(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
      const user = json?.data?.user;
      if (!user?.id) throw new Error('Kullanıcı bulunamadı');
      return user;
    });
  }

  function getReel(reelId, force = false) {
    return cached(
      `reel:${reelId}`,
      async () => {
        let firstError = null;
        try {
          const json = await igApi(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`);
          const reel = json?.reels?.[reelId] || json?.reels_media?.find((r) => String(r.id) === String(reelId)) || json?.reels_media?.[0];
          if (reel?.items?.length) return reel;
        } catch (err) {
          firstError = err;
        }
        // Yedek uç nokta (sadece kullanıcı hikayeleri için, öne çıkanlar için değil).
        if (!String(reelId).startsWith('highlight:')) {
          try {
            const json = await igApi(`/api/v1/feed/user/${encodeURIComponent(reelId)}/story/`);
            const reel = json?.reel || json?.story;
            if (reel?.items?.length) return reel;
          } catch (err) {
            firstError ||= err;
          }
        }
        if (firstError) throw firstError;
        return null;
      },
      force
    );
  }

  function getMediaInfo(pk) {
    return cached(`media:${pk}`, async () => {
      const json = await igApi(`/api/v1/media/${pk}/info/`);
      const item = json?.items?.[0];
      if (!item) throw new Error('Gönderi bulunamadı');
      return item;
    });
  }

  const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function shortcodeToPk(code) {
    let n = 0n;
    for (const ch of code.slice(0, 11)) n = n * 64n + BigInt(SHORTCODE_ALPHABET.indexOf(ch));
    return n.toString();
  }

  // ---------------------------------------------------------------------------
  // API öğelerini medya nesnelerine çevir
  // ---------------------------------------------------------------------------

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

  function itemToMedia(item, owner) {
    const video = largest(item.video_versions);
    const image = largest(item.image_versions2?.candidates);
    const base = { id: itemPk(item), owner: item.user?.username || owner || 'instagram' };
    if (video) return { ...base, type: 'video', url: video.url, poster: image?.url || '', w: video.width, h: video.height };
    if (image) return { ...base, type: 'image', url: image.url, w: image.width, h: image.height };
    return null;
  }

  function fileKey(url) {
    try {
      return new URL(url, location.href).pathname.split('/').pop() || '';
    } catch {
      return '';
    }
  }

  function itemUrls(item) {
    return [...(item.image_versions2?.candidates || []).map((c) => c.url), ...(item.video_versions || []).map((v) => v.url)];
  }

  function indexByFile(items, domUrls) {
    const keys = new Set(domUrls.map(fileKey).filter(Boolean));
    if (!keys.size) return -1;
    return items.findIndex((item) => itemUrls(item).some((u) => keys.has(fileKey(u))));
  }

  // ---------------------------------------------------------------------------
  // DOM'daki medya
  // ---------------------------------------------------------------------------

  function bestFromSrcset(img) {
    let bestUrl = img.currentSrc || img.src;
    let bestW = 0;
    for (const part of (img.getAttribute('srcset') || '').split(',')) {
      const [url, size] = part.trim().split(/\s+/);
      const w = parseInt(size, 10) || 0;
      if (url && w > bestW) {
        bestW = w;
        bestUrl = url;
      }
    }
    return bestUrl;
  }

  function domMedia(node) {
    if (node.tagName === 'VIDEO') {
      const src = node.currentSrc || node.src || node.querySelector('source')?.src || '';
      return { type: 'video', url: src, poster: node.poster || '', urls: [src, node.poster].filter(Boolean) };
    }
    const url = bestFromSrcset(node);
    return { type: 'image', url, urls: [url, node.currentSrc || node.src].filter(Boolean) };
  }

  const usable = (m) => m && m.url && !m.url.startsWith('blob:');

  function visibleArea(node) {
    const r = node.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  // Hikaye sayfasında ortadaki (en büyük) hikaye medyası.
  function findActiveStoryNode() {
    let best = null;
    let bestArea = 0;
    let bestVideo = null;
    let bestVideoArea = 0;
    for (const node of document.querySelectorAll('img, video')) {
      if (node.closest(UI_SELECTOR)) continue;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const area = visibleArea(node);
      if (area > bestArea) {
        best = node;
        bestArea = area;
      }
      if (node.tagName === 'VIDEO' && area > bestVideoArea) {
        bestVideo = node;
        bestVideoArea = area;
      }
    }
    if (bestVideo && bestVideoArea >= bestArea * 0.8) best = bestVideo;
    if (!best || bestArea < 40_000) return null;
    return best;
  }

  // Avatarın etrafında hikaye halkası (Instagram bunu <canvas> ile çiziyor) ya da hikaye bağlantısı var mı?
  function storyRingUser(node) {
    const link = node.closest('a[href*="/stories/"]');
    if (link) {
      const info = parseStoryPath(new URL(link.href, location.href).pathname);
      if (info?.username) return info.username;
    }
    let hasRing = false;
    let anc = node.parentElement;
    for (let i = 0; i < 4 && anc && !hasRing; i++, anc = anc.parentElement) {
      if (anc.querySelector(':scope > canvas, :scope > * > canvas')) hasRing = true;
      const label = anc.getAttribute('aria-label') || '';
      if (/story|hikaye|hikâye/i.test(label)) hasRing = true;
    }
    return hasRing ? avatarUser(node) : null;
  }

  // Profildeki öne çıkan (highlight) dairesi: /stories/highlights/<id>/
  function highlightFor(node) {
    const link = node.closest('a[href*="/stories/highlights/"]');
    const m = link?.getAttribute('href').match(/\/stories\/highlights\/(\d+)/);
    return m ? `highlight:${m[1]}` : null;
  }

  function profileOwnerFromPath() {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length >= 1 && !RESERVED.has(parts[0]) ? parts[0] : null;
  }

  const RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'direct', 'accounts', 'about', 'legal', 'web']);

  function avatarUser(node) {
    const link = node.closest('a[href]');
    if (link) {
      const parts = new URL(link.href, location.href).pathname.split('/').filter(Boolean);
      if (parts.length === 1 && !RESERVED.has(parts[0])) return parts[0];
      if (parts[0] === 'stories' && parts[1] && parts[1] !== 'highlights') return parts[1];
    }
    const m = (node.getAttribute('alt') || '').match(/^([A-Za-z0-9._]{1,30})(?:'s|’s|\s)/);
    return m ? m[1] : null;
  }

  const isProfilePic = (node) => node.tagName === 'IMG' && /profil|profile/i.test(node.getAttribute('alt') || '');

  function shortcodeFor(node) {
    const re = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;
    const link = node.closest('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
    if (link) {
      const m = link.getAttribute('href').match(re);
      if (m) return m[1];
    }
    const article = node.closest('article');
    if (article) {
      for (const a of article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]')) {
        const m = a.getAttribute('href').match(re);
        if (m) return m[1];
      }
    }
    const m = location.pathname.match(re);
    return m ? m[1] : null;
  }

  // ---------------------------------------------------------------------------
  // Bir DOM öğesi için tam çözünürlüklü medya listesini bul
  //   → { list: [medya...], index, story: bool }
  // ---------------------------------------------------------------------------

  async function resolveStory(node, dom) {
    const info = parseStoryPath();
    let apiError = null;
    try {
      const reelId = info.reelId || (await getProfile(info.username)).id;
      const pick = (reel) => {
        const items = reel?.items || [];
        let idx = info.mediaId ? items.findIndex((it) => itemPk(it) === info.mediaId) : -1;
        if (idx < 0 && dom) idx = indexByFile(items, dom.urls);
        if (idx < 0 && items.length === 1) idx = 0;
        return { items, idx };
      };
      let { items, idx } = pick(await getReel(reelId));
      if (idx < 0) ({ items, idx } = pick(await getReel(reelId, true)));
      if (idx >= 0) {
        const list = items.map((it) => itemToMedia(it, info.label)).filter(Boolean);
        return { list, index: Math.min(idx, list.length - 1), story: true };
      }
    } catch (err) {
      apiError = err;
      console.warn('[Story Zoom] Hikaye API ile alınamadı:', err);
    }
    if (usable(dom)) return { list: [{ ...dom, id: info.mediaId || String(Date.now()), owner: info.label }], index: 0, story: true };
    throw new Error(apiError ? `Hikaye alınamadı: ${apiError.message}` : 'Hikaye medyası bulunamadı');
  }

  // --- Hikaye dizileri: bir kişinin hikayeleri → öne çıkanları (pinler) → tepsideki diğer kişiler ---
  // "loaders" kuyruğu: sıradaki parça gerektiğinde (tekerlek / D) yüklenir, böylece geçiş sonsuz olur.

  function getHighlightsTray(userId) {
    return cached(`hl:${userId}`, async () => {
      const json = await igApi(`/api/v1/highlights/${encodeURIComponent(userId)}/highlights_tray/`);
      return (json?.tray || []).map((h) => ({
        id: String(h.id).startsWith('highlight:') ? String(h.id) : `highlight:${h.id}`,
        title: h.title || ''
      }));
    });
  }

  function getReelsTray() {
    return cached('tray', async () => {
      const json = await igApi('/api/v1/feed/reels_tray/');
      return (json?.tray || []).filter((t) => t.user?.username).map((t) => ({ id: String(t.user.pk ?? t.id), username: t.user.username }));
    });
  }

  function reelToMedia(reel, owner, label) {
    return (reel?.items || [])
      .map((it) => {
        const m = itemToMedia(it, owner);
        if (m) {
          m.taken_at = it.taken_at;
          m.label = label || '';
        }
        return m;
      })
      .filter(Boolean);
  }

  function highlightsLoader(user, afterId = null) {
    const fn = async (queue) => {
      let tray = await getHighlightsTray(user.id).catch(() => []);
      if (afterId) tray = tray.slice(tray.findIndex((h) => h.id === afterId) + 1);
      queue.unshift(...tray.map((h) => async () => reelToMedia(await getReel(h.id).catch(() => null), user.username, `📌 ${h.title}`)));
      return [];
    };
    return fn;
  }

  function trayLoader(skipUsers) {
    const fn = async (queue) => {
      const tray = await getReelsTray().catch(() => []);
      queue.push(
        ...tray
          .filter((t) => !skipUsers.has(t.username))
          .map((t) => async () => reelToMedia(await getReel(t.id).catch(() => null), t.username, ''))
      );
      return [];
    };
    fn.isTray = true;
    return fn;
  }

  // Kuyruktan medya gelene kadar yükle. stopAtTray: başkalarının hikayelerine geçme.
  async function takeMore(queue, stopAtTray = false) {
    while (queue.length) {
      if (stopAtTray && queue[0].isTray) return [];
      const items = await queue.shift()(queue);
      if (items.length) return items;
    }
    return [];
  }

  async function resolveUserSequence(username) {
    const user = await getProfile(username);
    const loaders = [highlightsLoader({ id: user.id, username }), trayLoader(new Set([username]))];
    let list = [];
    let index = 0;
    let note = null;
    try {
      const reel = await getReel(user.id);
      list = reelToMedia(reel, username, '');
      // İlk görülmemiş hikayeden başla.
      index = Math.max(0, (reel?.items || []).findIndex((it) => reel.seen && it.taken_at > reel.seen));
    } catch (err) {
      console.warn('[Story Zoom] Hikaye alınamadı:', err);
      note = `Hikaye alınamadı (${err.message})`;
    }
    if (!list.length) {
      list = await takeMore(loaders, true);
      if (list.length) note ||= 'Aktif hikaye yok, öne çıkanlar gösteriliyor';
    }
    if (!list.length) {
      const url = user.profile_pic_url_hd || user.profile_pic_url;
      if (url) list = [{ type: 'image', url, id: 'profil', owner: username, label: 'Profil resmi' }];
      note ||= 'Aktif hikaye ve öne çıkan yok';
    }
    if (!list.length) throw new Error(note || 'Bu kişi için bir şey bulunamadı');
    return { list, index: Math.min(index, list.length - 1), story: true, note, loaders };
  }

  async function resolveHighlight(reelId, username) {
    const reel = await getReel(reelId);
    const list = reelToMedia(reel, username || 'instagram', '📌');
    if (!list.length) throw new Error('Öne çıkan boş');
    const loaders = [];
    if (username) {
      const user = await getProfile(username).catch(() => null);
      if (user) loaders.push(highlightsLoader({ id: user.id, username }, reelId));
    }
    loaders.push(trayLoader(new Set(username ? [username] : [])));
    return { list, index: 0, story: true, loaders };
  }

  async function resolvePost(code, dom) {
    const item = await getMediaInfo(shortcodeToPk(code));
    const owner = item.user?.username;
    const children = item.carousel_media?.length ? item.carousel_media : [item];
    const list = children.map((c) => itemToMedia(c, owner)).filter(Boolean);
    list.forEach((m) => (m.taken_at = item.taken_at));
    let index = dom ? indexByFile(children, dom.urls) : -1;
    if (index < 0 && dom?.type === 'video') index = list.findIndex((m) => m.type === 'video');
    return { list, index: Math.max(0, index), story: false };
  }

  async function resolveNode(node) {
    const dom = node ? domMedia(node) : null;

    // Hikaye sayfasında ortadaki büyük medya her zaman hikayedir (avatar değilse).
    if (isStoryPage() && (!node || node === findActiveStoryNode() || (!isProfilePic(node) && visibleArea(node) >= 40_000))) {
      const res = await resolveStory(node, dom);
      const info = parseStoryPath();
      return { ...res, loaders: [trayLoader(new Set(info?.username ? [info.username] : []))] };
    }

    try {
      const hl = node && highlightFor(node);
      if (hl) return await resolveHighlight(hl, profileOwnerFromPath());

      // Avatar ya da hikaye halkası: hikayeler → öne çıkanlar → (yoksa) HD profil resmi.
      const user = node && (storyRingUser(node) || (isProfilePic(node) ? avatarUser(node) : null));
      if (user) return await resolveUserSequence(user);

      const code = node && shortcodeFor(node);
      if (code) return await resolvePost(code, dom);
    } catch (err) {
      console.warn('[Story Zoom] API ile alınamadı, sayfadaki medya kullanılıyor:', err);
      if (!usable(dom)) throw err;
    }

    if (usable(dom)) return { list: [{ ...dom, id: String(Date.now()), owner: 'instagram' }], index: 0, story: false };
    throw new Error('Bu medya bulunamadı');
  }

  // ---------------------------------------------------------------------------
  // İndirme
  // ---------------------------------------------------------------------------

  function buildFilename(media) {
    let ext = media.type === 'video' ? 'mp4' : 'jpg';
    const m = fileKey(media.url).match(/\.([a-z0-9]{2,5})$/i);
    if (m) ext = m[1].toLowerCase();
    const safe = (s) => String(s || 'instagram').replace(/[^\w.-]+/g, '_').slice(0, 80);
    return `Instagram/${safe(media.owner)}_${safe(media.id)}.${ext}`;
  }

  async function downloadMedia(media) {
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'igsz-download', url: media.url, filename: buildFilename(media) });
    } catch (err) {
      // Eklenti güncellenip yeniden yüklendiyse bu sekmedeki eski kod arka planla konuşamaz.
      if (/context invalidated|receiving end/i.test(String(err))) throw new Error('Eklenti güncellendi, sayfayı yenileyin (F5)');
      throw err;
    }
    if (!res?.ok) throw new Error(res?.error || 'İndirme başarısız');
    toast('İndirme başladı ✓');
  }

  async function safeDownload(media) {
    try {
      await downloadMedia(media);
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }

  // ---------------------------------------------------------------------------
  // Instagram hikaye oynatıcısı: duraklat / devam / ileri / geri (en iyi çaba)
  // ---------------------------------------------------------------------------

  const PAUSE_LABELS = /^(pause|duraklat|pausar|pausieren|mettre en pause|pausa|metti in pausa|приостановить|пауза)$/i;
  const PLAY_LABELS = /^(play|oynat|reproducir|abspielen|wiedergeben|lire|riproduci|воспроизвести)$/i;
  const NEXT_LABELS = /^(next|ileri|sonraki|siguiente|weiter|suivant|avanti|далее)$/i;
  const PREV_LABELS = /^(previous|önceki|geri|anterior|zurück|précédent|indietro|назад)$/i;

  function clickLabeled(labelRe, near) {
    const nearRect = near?.isConnected ? near.getBoundingClientRect() : null;
    for (const node of document.querySelectorAll('[aria-label]')) {
      if (node.closest(UI_SELECTOR)) continue;
      if (!labelRe.test(node.getAttribute('aria-label').trim())) continue;
      const target = node.closest('[role="button"], button') || node;
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (nearRect && (r.right < nearRect.left || r.left > nearRect.right || r.bottom < nearRect.top - 80 || r.top > nearRect.bottom)) continue;
      target.click();
      return true;
    }
    return false;
  }

  function pauseStory(near) {
    if (!isStoryPage()) return false;
    const paused = clickLabeled(PAUSE_LABELS, near);
    document.querySelectorAll('video').forEach((v) => {
      if (!v.closest(UI_SELECTOR)) v.pause();
    });
    return paused;
  }

  function resumeStory(near) {
    if (isStoryPage()) clickLabeled(PLAY_LABELS, near);
  }

  function navigateStory(dir) {
    if (clickLabeled(dir > 0 ? NEXT_LABELS : PREV_LABELS)) return;
    const key = dir > 0 ? 'ArrowRight' : 'ArrowLeft';
    const init = { key, code: key, keyCode: dir > 0 ? 39 : 37, which: dir > 0 ? 39 : 37, bubbles: true, cancelable: true };
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  async function waitForPathChange(before, timeout = 2500) {
    const start = Date.now();
    while (location.pathname === before && Date.now() - start < timeout) await sleep(100);
    await sleep(400); // yeni hikayenin DOM'a gelmesini bekle
  }

  // ---------------------------------------------------------------------------
  // Ortak medya öğesi
  // ---------------------------------------------------------------------------

  let muted = true;
  try {
    muted = localStorage.getItem('igsz-muted') !== '0';
  } catch {}

  function createMediaElement(media, cls) {
    if (media.type === 'video') {
      const v = el('video', { class: cls, src: media.url, autoplay: '', loop: '', playsinline: '' });
      if (media.poster) v.poster = media.poster;
      v.muted = muted;
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(() => {});
      });
      return v;
    }
    return el('img', { class: cls, src: media.url, alt: '', draggable: 'false' });
  }

  function naturalSize(node, media) {
    if (node.tagName === 'VIDEO') return [node.videoWidth || media.w || 0, node.videoHeight || media.h || 0];
    return [node.naturalWidth || media.w || 0, node.naturalHeight || media.h || 0];
  }

  function onMediaReady(node, cb) {
    if (node.tagName === 'VIDEO') {
      if (node.readyState >= 1) requestAnimationFrame(cb);
      else node.addEventListener('loadedmetadata', cb, { once: true });
    } else if (node.complete && node.naturalWidth) requestAnimationFrame(cb);
    else node.addEventListener('load', cb, { once: true });
  }

  function setMuted(v, value) {
    muted = value;
    v.muted = value;
    try {
      localStorage.setItem('igsz-muted', value ? '1' : '0');
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Fareyle üzerine gelince açılan önizleme
  //
  // Kararlılık kuralları:
  //  - Önizleme açıkken başka hiçbir şey açılmaya çalışılmaz.
  //  - Açık önizleme DOM öğesine değil, kaynağın ekrandaki alanına bağlıdır (Instagram öğeleri
  //    sürekli yeniden çizer; video oynamaya başlayınca görselin yerine video gelir vb.).
  //  - Kaydırma sırasında ve hemen sonrasında hiçbir şey açılmaz; tarayıcının kaydırma sonrası
  //    gönderdiği sahte "fare hareketi" olayları yok sayılır.
  // ---------------------------------------------------------------------------

  let hoverEnabled = true;
  try {
    hoverEnabled = localStorage.getItem('igsz-hover') !== 'off';
  } catch {}

  const CLOSE_DELAY = 140;
  const SCROLL_QUIET = 350;
  const mouse = { x: -1, y: -1 };
  const hover = { candidate: null, timer: 0, closeTimer: 0, token: 0, preview: null, suppressRect: null, quietUntil: 0 };

  const contains = (r, x, y, pad = 0) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  const rectOf = (node) => {
    const r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };

  function acceptMedia(node, x, y) {
    if (node.tagName !== 'IMG' && node.tagName !== 'VIDEO') return false;
    const r = node.getBoundingClientRect();
    if (!contains(r, x, y)) return false;
    if (r.width >= MIN_MEDIA && r.height >= MIN_MEDIA) return true;
    return r.width >= 28 && r.height >= 28 && Boolean(highlightFor(node) || storyRingUser(node));
  }

  function mediaAtPoint(x, y) {
    if (x < 0 || y < 0) return null;
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (node.closest(UI_SELECTOR)) return null;
      if (acceptMedia(node, x, y)) return preferVideo(node);
    }
    // Görselin üstünde pointer-events:none ya da şeffaf katman olabilir: yakın çevresinde ara.
    for (const node of stack.slice(0, 3)) {
      const scope = node.parentElement?.parentElement || node.parentElement;
      if (!scope || scope === document.body || scope === document.documentElement) continue;
      for (const m of scope.querySelectorAll('video, img')) {
        if (!m.closest(UI_SELECTOR) && acceptMedia(m, x, y)) return preferVideo(m);
      }
    }
    return null;
  }

  // Videonun kapak görseli üstteyse, aynı yerdeki videoyu tercih et.
  function preferVideo(node) {
    if (node.tagName === 'VIDEO') return node;
    const r = node.getBoundingClientRect();
    const scope = node.parentElement?.parentElement?.parentElement;
    for (const v of scope?.querySelectorAll('video') || []) {
      const vr = v.getBoundingClientRect();
      if (Math.abs(vr.left - r.left) < 8 && Math.abs(vr.top - r.top) < 8 && Math.abs(vr.width - r.width) < 16) return v;
    }
    return node;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} dk`;
    if (s < 86400) return `${Math.round(s / 3600)} sa`;
    if (s < 86400 * 30) return `${Math.round(s / 86400)} g`;
    return new Date(ts * 1000).toLocaleDateString('tr-TR');
  }

  function showPreview(node, startScale = 1) {
    hidePreview();
    const token = ++hover.token;
    hover.candidate = null;

    const dom = domMedia(node);
    const frame = el('div', { class: 'igsz-pv-frame igsz-pv-loading' });
    const head = el('div', { class: 'igsz-pv-head igsz-glass' });
    const info = el('div', { class: 'igsz-pv-info igsz-glass', text: 'Yükleniyor…' });
    const box = el('div', { id: 'igsz-preview' }, [frame, head, info]);
    document.body.append(box);

    const pv = {
      box, frame, head, info, node, rect: rectOf(node), token,
      list: null, index: 0, story: false, note: null, loaders: null, loading: false,
      media: null, mediaEl: null, scale: startScale, paused: false, pausedVideo: null, wheelAcc: 0, wheelAt: 0
    };
    hover.preview = pv;
    head.hidden = true;
    pv.expectSeq = Boolean(isStoryPage() || highlightFor(node) || storyRingUser(node) || isProfilePic(node));

    // Hikaye sayfasında Instagram'ın hikayeyi geçmesini, akışta da arkadaki videonun çalmasını durdur.
    if (isStoryPage()) pv.paused = pauseStory(node);
    if (node.tagName === 'VIDEO' && !node.paused) {
      node.pause();
      pv.pausedVideo = node;
    }

    // Yüksek çözünürlük gelene kadar sayfadaki sürümü (video ise o anki kareyi) göster.
    if (usable(dom)) renderPreviewMedia(pv, dom);
    else if (node.tagName === 'VIDEO') showVideoFrame(pv, node);

    resolveNode(node).then(
      (res) => {
        if (hover.preview !== pv) return;
        pv.list = res.list;
        pv.index = res.index;
        pv.story = res.story;
        pv.note = res.note || null;
        pv.loaders = res.loaders || null;
        renderPreviewMedia(pv, res.list[res.index]);
        prefetch(pv);
      },
      (err) => {
        if (hover.preview !== pv) return;
        updatePreviewInfo(pv, err.message || String(err));
      }
    );
  }

  function showVideoFrame(pv, video) {
    if (!video.videoWidth) return;
    const c = el('canvas', { class: 'igsz-pv-media' });
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    try {
      c.getContext('2d').drawImage(video, 0, 0);
    } catch {
      return;
    }
    pv.media = { type: 'frame', w: c.width, h: c.height };
    pv.mediaEl = c;
    pv.frame.replaceChildren(c);
    pv.frame.classList.remove('igsz-pv-loading');
    layoutPreview(pv);
  }

  function renderPreviewMedia(pv, media) {
    if (!media) return;
    pv.media = media;
    const node = createMediaElement(media, 'igsz-pv-media');
    if (pv.mediaEl?.tagName === 'VIDEO') pv.mediaEl.pause();
    pv.mediaEl = node;
    // Yeni medya yüklenene kadar eskisi görünsün (tekerlekle hızlı geçişte titreme olmasın).
    onMediaReady(node, () => {
      if (pv.mediaEl !== node) return;
      pv.frame.replaceChildren(node);
      pv.frame.classList.remove('igsz-pv-loading');
      layoutPreview(pv);
    });
    node.addEventListener('error', () => pv.mediaEl === node && updatePreviewInfo(pv, 'Medya yüklenemedi'));
    updatePreviewInfo(pv);
  }

  function updatePreviewInfo(pv, error, status) {
    const m = pv.media;
    const headParts = [];
    if (m?.owner) headParts.push(`@${m.owner}`);
    if (m?.label) headParts.push(m.label);
    if (m?.taken_at) headParts.push(timeAgo(m.taken_at));
    pv.head.textContent = headParts.join('  ·  ');
    pv.head.hidden = !headParts.length;

    const parts = [];
    if (pv.list && (pv.list.length > 1 || pv.loaders?.length)) parts.push(`${pv.index + 1}/${pv.list.length}${pv.loaders?.length ? '+' : ''}`);
    if (pv.scale > 1.01) parts.push(`${Math.round(pv.scale * 100)}%`);
    if (status) parts.push(status);
    else if (pv.note && !error) parts.push(pv.note);
    const canStep = pv.list && (pv.list.length > 1 || pv.loaders?.length);
    parts.push(error || (canStep ? 'Tekerlek / A·D: geçiş · ' : '') + 'W büyüt · Q küçült · S indir · F tam ekran' + (m?.type === 'video' ? ' · M ses' : ''));
    pv.info.textContent = parts.join('  ·  ');
    pv.info.classList.toggle('igsz-error', Boolean(error));
  }

  function layoutPreview(pv) {
    const node = pv.mediaEl;
    if (!node || !pv.media) return;
    const [nw, nh] = naturalSize(node, pv.media);
    if (!nw || !nh) return;
    const W = innerWidth;
    const H = innerHeight;
    const fit = Math.min((W * 0.9) / nw, (H * 0.86) / nh);
    const w = nw * fit * pv.scale;
    const h = nh * fit * pv.scale;

    // Büyütülmüşse, fare kaynak alanın neresindeyse önizlemenin orası görünsün.
    const r = pv.rect;
    const px = r.width ? Math.min(1, Math.max(0, (mouse.x - r.left) / r.width)) : 0.5;
    const py = r.height ? Math.min(1, Math.max(0, (mouse.y - r.top) / r.height)) : 0.5;
    const x = w <= W ? (W - w) / 2 : -(w - W) * px;
    const y = h <= H ? (H - h) / 2 : -(h - H) * py;
    pv.frame.style.width = `${w}px`;
    pv.frame.style.height = `${h}px`;
    pv.frame.style.transform = `translate(${x}px, ${y}px)`;
  }

  function zoomPreview(factor) {
    const pv = hover.preview;
    if (!pv) return;
    pv.scale = Math.min(8, Math.max(1, pv.scale * factor));
    layoutPreview(pv);
    updatePreviewInfo(pv);
  }

  // Sona yaklaşınca sıradaki parçayı arka planda yükle, sonraki görseli önden indir.
  function prefetch(pv) {
    const next = pv.list?.[pv.index + 1];
    if (next?.type === 'image') new Image().src = next.url;
    if (pv.loaders?.length && !pv.loading && pv.index >= pv.list.length - 2) loadMore(pv);
  }

  async function loadMore(pv) {
    if (pv.loading) return pv.loading;
    pv.loading = (async () => {
      try {
        const more = await takeMore(pv.loaders);
        pv.list.push(...more);
      } catch (err) {
        console.warn('[Story Zoom] Sonraki hikayeler alınamadı:', err);
      } finally {
        pv.loading = false;
      }
    })();
    return pv.loading;
  }

  async function stepPreview(dir) {
    const pv = hover.preview;
    if (!pv?.list) return false;
    let next = pv.index + dir;
    if (next >= pv.list.length && pv.loaders?.length) {
      updatePreviewInfo(pv, null, 'Sıradaki hikayeler yükleniyor…');
      await loadMore(pv);
      if (hover.preview !== pv) return true;
      next = pv.index + dir;
    }
    if (next < 0 || next >= pv.list.length) {
      updatePreviewInfo(pv, null, dir > 0 ? 'Hepsi bu kadar' : 'En baştasın');
      return true;
    }
    pv.index = next;
    pv.scale = 1;
    renderPreviewMedia(pv, pv.list[next]);
    prefetch(pv);
    return true;
  }

  // suppress: fare bu alandan çıkana kadar tekrar açma (Esc, tıklama, kaydırma sonrası).
  function hidePreview(suppress = false) {
    clearTimeout(hover.timer);
    clearTimeout(hover.closeTimer);
    hover.candidate = null;
    const pv = hover.preview;
    hover.preview = null;
    if (!pv) return;
    if (suppress) hover.suppressRect = pv.node?.isConnected ? rectOf(pv.node) : pv.rect;
    if (pv.mediaEl?.tagName === 'VIDEO') {
      pv.mediaEl.pause();
      pv.mediaEl.removeAttribute('src');
      pv.mediaEl.load();
    }
    pv.box.classList.add('igsz-closing');
    setTimeout(() => pv.box.remove(), 120);
    if (pv.paused) resumeStory(pv.node);
    if (pv.pausedVideo?.isConnected) pv.pausedVideo.play().catch(() => {});
  }

  function onMouseMove(e) {
    // Kaydırma sonrası tarayıcının gönderdiği sahte olaylar: konum değişmemişse yok say.
    if (e.clientX === mouse.x && e.clientY === mouse.y) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (onMouseMove.raf) return;
    onMouseMove.raf = requestAnimationFrame(() => {
      onMouseMove.raf = 0;
      if (viewer) return;
      const pv = hover.preview;

      if (pv) {
        // Açık önizleme: fare kaynak alanda kaldıkça açık kalır, başka hiçbir şey açılmaz.
        if (pv.node?.isConnected) {
          const r = rectOf(pv.node);
          if (r.width && r.height) pv.rect = r;
        }
        if (contains(pv.rect, mouse.x, mouse.y, 10)) {
          clearTimeout(hover.closeTimer);
          hover.closeTimer = 0;
          layoutPreview(pv);
        } else if (!hover.closeTimer) {
          hover.closeTimer = setTimeout(() => {
            hover.closeTimer = 0;
            if (hover.preview === pv && !contains(pv.rect, mouse.x, mouse.y, 10)) hidePreview();
          }, CLOSE_DELAY);
        }
        return;
      }

      if (hover.suppressRect && !contains(hover.suppressRect, mouse.x, mouse.y)) hover.suppressRect = null;
      if (!hoverEnabled || Date.now() < hover.quietUntil) return;

      const node = mediaAtPoint(mouse.x, mouse.y);
      if (node && hover.suppressRect && contains(hover.suppressRect, mouse.x, mouse.y)) return;
      if (node === hover.candidate) return;
      clearTimeout(hover.timer);
      hover.candidate = node;
      if (!node) return;
      const rect = rectOf(node);
      hover.timer = setTimeout(() => {
        if (hover.candidate !== node || hover.preview || viewer || Date.now() < hover.quietUntil) return;
        // Bu arada fare başka yere gittiyse ya da sayfa kaydıysa açma.
        if (!contains(rect, mouse.x, mouse.y)) return;
        const now = node.isConnected ? rectOf(node) : null;
        if (!now || Math.abs(now.top - rect.top) > 4 || Math.abs(now.left - rect.left) > 4) return;
        showPreview(node);
      }, HOVER_DELAY);
    });
  }

  function onScroll() {
    hover.quietUntil = Date.now() + SCROLL_QUIET;
    clearTimeout(hover.timer);
    hover.candidate = null;
    const pv = hover.preview;
    if (!pv) return;
    // Sadece kaynak gerçekten yer değiştirdiyse kapat (Instagram'ın iç kaydırmaları sayılmaz).
    if (pv.node?.isConnected) {
      const r = rectOf(pv.node);
      if (Math.abs(r.top - pv.rect.top) > 30 || Math.abs(r.left - pv.rect.left) > 30) hidePreview(true);
    }
  }

  // Tekerlek: önizlemede geçilecek bir şey varsa hikayeler/fotoğraflar arasında gezinir,
  // yoksa önizlemeyi kapatır ve sayfa normal kayar.
  function onWheel(e) {
    const pv = hover.preview;
    if (!pv || viewer || e.ctrlKey) return;
    const canStep = pv.list && (pv.list.length > 1 || pv.loaders?.length);
    if (!canStep) {
      // Hikaye dizisi hâlâ yükleniyorsa tekerleği yut; değilse kapat ve sayfa kaysın.
      if (!pv.list && pv.expectSeq) e.preventDefault();
      else hidePreview(true);
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    pv.wheelAcc += delta;
    const now = Date.now();
    if (Math.abs(pv.wheelAcc) >= 50 && now - pv.wheelAt > 160) {
      const dir = pv.wheelAcc > 0 ? 1 : -1;
      pv.wheelAcc = 0;
      pv.wheelAt = now;
      stepPreview(dir);
    }
  }

  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mousedown', (e) => hover.preview && e.button !== 1 && hidePreview(true), true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('blur', () => hidePreview());
  window.addEventListener('resize', () => hover.preview && layoutPreview(hover.preview));

  // ---------------------------------------------------------------------------
  // Tam ekran görüntüleyici (sürükle, tekerlekle yakınlaştır)
  // ---------------------------------------------------------------------------

  let viewer = null;

  // ctx: { list, index, story, sourceNode }
  function openViewer(ctx) {
    closeViewer(true);
    const media = ctx.list[ctx.index];
    if (!media) return;

    const pausedStory = ctx.pausedStory ?? pauseStory(ctx.sourceNode);
    document.querySelectorAll('video').forEach((v) => {
      if (!v.closest(UI_SELECTOR)) v.pause();
    });

    const state = { scale: 1, x: 0, y: 0, baseW: 0, baseH: 0, W: 0, H: 0 };
    const MIN = 1;
    const MAX = 12;
    const isVideo = media.type === 'video';
    const mediaEl = createMediaElement(media, 'igsz-media');

    const stage = el('div', { class: 'igsz-stage' }, [mediaEl]);
    const zoomLabel = el('span', { class: 'igsz-zoom-label', text: '100%' });
    const counter = ctx.list.length > 1 ? el('span', { class: 'igsz-zoom-label', text: `${ctx.index + 1}/${ctx.list.length}` }) : null;

    const playBtn = isVideo ? iconButton('igsz-btn', 'pause', 'Oynat / Duraklat (Boşluk)', () => togglePlay()) : null;
    const muteBtn = isVideo ? iconButton('igsz-btn', mediaEl.muted ? 'soundOff' : 'soundOn', 'Ses (M)', () => setMuted(mediaEl, !mediaEl.muted)) : null;
    const seek = isVideo ? el('input', { class: 'igsz-seek', type: 'range', min: '0', max: '1000', value: '0', title: 'Sar' }) : null;
    const canStep = ctx.list.length > 1 || ctx.story;

    const bar = el('div', { class: 'igsz-bar' }, [
      ...(canStep ? [iconButton('igsz-btn', 'prev', 'Önceki (A)', () => step(-1))] : []),
      ...(counter ? [counter] : []),
      ...(canStep ? [iconButton('igsz-btn', 'next', 'Sonraki (D)', () => step(1)), el('span', { class: 'igsz-sep' })] : []),
      ...(isVideo ? [playBtn, muteBtn, seek, el('span', { class: 'igsz-sep' })] : []),
      iconButton('igsz-btn', 'minus', 'Uzaklaştır (Q)', () => zoomAtCenter(1 / 1.4)),
      zoomLabel,
      iconButton('igsz-btn', 'plus', 'Yakınlaştır (W)', () => zoomAtCenter(1.4)),
      iconButton('igsz-btn', 'reset', 'Sığdır (0)', () => reset()),
      el('span', { class: 'igsz-sep' }),
      iconButton('igsz-btn', 'download', 'İndir (S)', () => safeDownload(media)),
      iconButton('igsz-btn', 'close', 'Kapat (Esc)', () => closeViewer())
    ]);

    const hint = el('div', { class: 'igsz-hint', text: 'W/Q veya tekerlek: yakınlaştır · Sürükle: kaydır · S: indir · A/D: önceki/sonraki · Esc: kapat' });
    const overlay = el('div', { id: 'igsz-overlay', tabindex: '-1' }, [stage, bar, hint]);
    document.body.append(overlay);
    overlay.focus();
    setTimeout(() => hint.classList.add('igsz-fade'), 2500);

    function layout() {
      const [nw, nh] = naturalSize(mediaEl, media);
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
      const [nw] = naturalSize(mediaEl, media);
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

    const zoomAtCenter = (factor) => zoomAt(state.W / 2, state.H / 2, factor);

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

    function togglePlay() {
      if (!isVideo) return;
      if (mediaEl.paused) mediaEl.play().catch(() => {});
      else mediaEl.pause();
    }

    async function step(dir) {
      const next = ctx.index + dir;
      if (next >= 0 && next < ctx.list.length) {
        openViewer({ ...ctx, index: next, pausedStory });
        return;
      }
      if (!ctx.story || !isStoryPage()) {
        toast(dir > 0 ? 'Son öğe' : 'İlk öğe');
        return;
      }
      // Bu kişinin hikayeleri bitti: Instagram'da bir sonraki kişiye geç ve onu aç.
      closeViewer(true);
      const before = location.pathname;
      navigateStory(dir);
      await waitForPathChange(before);
      if (isStoryPage()) runOnStory('zoom');
    }

    if (isVideo) {
      mediaEl.addEventListener('play', () => setIcon(playBtn, 'pause'));
      mediaEl.addEventListener('pause', () => setIcon(playBtn, 'play'));
      mediaEl.addEventListener('volumechange', () => setIcon(muteBtn, mediaEl.muted ? 'soundOff' : 'soundOn'));
      mediaEl.addEventListener('timeupdate', () => {
        if (mediaEl.duration && !seek.matches(':active')) seek.value = String((mediaEl.currentTime / mediaEl.duration) * 1000);
      });
      seek.addEventListener('input', () => {
        if (mediaEl.duration) mediaEl.currentTime = (Number(seek.value) / 1000) * mediaEl.duration;
      });
    }
    onMediaReady(mediaEl, layout);
    mediaEl.addEventListener('error', () => toast('Medya yüklenemedi', true));

    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [cx, cy] = stagePoint(e);
        const speed = e.ctrlKey ? 0.01 : 0.0015; // ctrlKey: touchpad'de sıkıştırma
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
        const target = pinchStart.scale * (dist / pinchStart.dist);
        zoomAt((a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, target / state.scale);
        dragMoved = true;
        return;
      }
      const dx = e.clientX - prev[0];
      const dy = e.clientY - prev[1];
      if (dx || dy) dragMoved = true;
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

    stage.addEventListener('click', (e) => {
      if (e.target === stage && !dragMoved) closeViewer();
    });

    // Instagram'ın tuşlarla hikaye değiştirmesini engelle.
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      const handled = (() => {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        switch (e.key.toLowerCase()) {
          case 'escape': closeViewer(); return true;
          case 'w': case '+': case '=': zoomAtCenter(1.4); return true;
          case 'q': case '-': case '_': zoomAtCenter(1 / 1.4); return true;
          case '0': reset(); return true;
          case 's': safeDownload(media); return true;
          case 'a': step(-1); return true;
          case 'd': step(1); return true;
          case ' ': togglePlay(); return true;
          case 'm': if (isVideo) setMuted(mediaEl, !mediaEl.muted); return true;
          case 'arrowleft': state.x += 60; apply(); return true;
          case 'arrowright': state.x -= 60; apply(); return true;
          case 'arrowup': state.y += 60; apply(); return true;
          case 'arrowdown': state.y -= 60; apply(); return true;
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
    window.addEventListener('resize', layout);

    viewer = {
      destroy(keepPaused) {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', swallow, true);
        window.removeEventListener('keypress', swallow, true);
        window.removeEventListener('resize', layout);
        if (isVideo) {
          mediaEl.pause();
          mediaEl.removeAttribute('src');
          mediaEl.load();
        }
        overlay.remove();
        if (pausedStory && !keepPaused) resumeStory(ctx.sourceNode);
      }
    };
  }

  function closeViewer(keepPaused = false) {
    if (!viewer) return;
    const v = viewer;
    viewer = null;
    v.destroy(keepPaused);
  }

  // ---------------------------------------------------------------------------
  // Hikaye sayfasındaki yüzen butonlar
  // ---------------------------------------------------------------------------

  let busy = false;
  let root = null;

  async function runOnStory(action) {
    if (busy) return;
    busy = true;
    root?.classList.add('igsz-busy');
    try {
      const node = findActiveStoryNode();
      const res = await resolveStory(node, node ? domMedia(node) : null);
      if (action === 'zoom') openViewer({ ...res, sourceNode: node });
      else await downloadMedia(res.list[res.index]);
    } catch (err) {
      toast(err.message || String(err), true);
    } finally {
      busy = false;
      root?.classList.remove('igsz-busy');
    }
  }

  async function downloadNode(node) {
    try {
      const res = await resolveNode(node);
      await downloadMedia(res.list[res.index]);
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }

  function ensureToolbar() {
    if (root && root.isConnected) return;
    root = el('div', { id: 'igsz-root' }, [
      iconButton('igsz-fab', 'zoom', 'Hikayeyi büyüt (W)', () => runOnStory('zoom'), 22),
      iconButton('igsz-fab', 'download', 'Hikayeyi indir (S)', () => runOnStory('download'), 22)
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

  // ---------------------------------------------------------------------------
  // Klavye (görüntüleyici kapalıyken)
  //   W büyüt · Q küçült · S indir · A/D önceki/sonraki · F tam ekran · H fareyle açmayı aç/kapat
  // ---------------------------------------------------------------------------

  window.addEventListener(
    'keydown',
    (e) => {
      if (viewer || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
      const key = e.key.toLowerCase();
      const pv = hover.preview;
      const action = (() => {
        switch (key) {
          case 'h':
            return () => {
              hoverEnabled = !hoverEnabled;
              try {
                localStorage.setItem('igsz-hover', hoverEnabled ? 'on' : 'off');
              } catch {}
              if (!hoverEnabled) hidePreview();
              toast(hoverEnabled ? 'Fareyle açma: AÇIK' : 'Fareyle açma: KAPALI');
            };
          case 'escape':
            return pv ? () => hidePreview(true) : null;
          case 'w': {
            if (pv) return () => zoomPreview(1.5);
            const node = mediaAtPoint(mouse.x, mouse.y);
            if (node) return () => showPreview(node, 1.5);
            return isStoryPage() && !e.repeat ? () => runOnStory('zoom') : null;
          }
          case 'q':
            return pv ? () => zoomPreview(1 / 1.5) : null;
          case 's': {
            if (e.repeat) return null;
            if (pv?.list) return () => safeDownload(pv.list[pv.index]);
            const node = pv?.node || mediaAtPoint(mouse.x, mouse.y);
            if (node) return () => downloadNode(node);
            return isStoryPage() ? () => runOnStory('download') : null;
          }
          case 'f':
            if (pv?.list) {
              return () => {
                const ctx = { list: pv.list, index: pv.index, story: pv.story, sourceNode: pv.node, pausedStory: pv.paused };
                pv.paused = false; // görüntüleyici kapanınca devam ettirecek
                hidePreview(true);
                openViewer(ctx);
              };
            }
            return isStoryPage() && !e.repeat ? () => runOnStory('zoom') : null;
          case 'm':
            return pv?.mediaEl?.tagName === 'VIDEO' ? () => {
              setMuted(pv.mediaEl, !pv.mediaEl.muted);
              updatePreviewInfo(pv);
            } : null;
          case 'a':
          case 'd': {
            const dir = key === 'd' ? 1 : -1;
            if (pv?.list && (pv.list.length > 1 || pv.loaders?.length)) return () => stepPreview(dir);
            return isStoryPage() ? () => navigateStory(dir) : null;
          }
          default:
            return null;
        }
      })();
      if (!action) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      action();
    },
    true
  );

  // Instagram tek sayfalık bir uygulama; URL değişimini izle.
  let lastPath = '';
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      syncToolbar();
    }
  }, 400);
  syncToolbar();
  console.info(`[Story Zoom] v${VERSION} yüklendi`);
})();
