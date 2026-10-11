// Story Zoom arka plan servisi
//  - İndirmeler (chrome.downloads)
//  - Kendini yenileme: eklenti klasörü `git pull` (update.bat / update.sh) ile güncellenince
//    diskteki manifest.json'un sürümü değişir; eklenti bunu fark edip kendini yeniden yükler.
//  - Yeni sürüm bildirimi: GitHub'daki manifest.json'un sadece sürüm numarasına bakılır
//    (uzaktan kod indirilmez / çalıştırılmaz).

const REMOTE_MANIFEST = 'https://raw.githubusercontent.com/burakbagdat-py/in/refs/heads/claude/cool-darwin-86wi8h/manifest.json';
const LOCAL_CHECK_MINUTES = 1;
const REMOTE_CHECK_MINUTES = 60;

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const loadedVersion = chrome.runtime.getManifest().version;

// Klasördeki dosyalar güncellendiyse (git pull) eklentiyi diskten yeniden yükle.
async function checkLocalFiles() {
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const { version } = await res.json();
    if (version && version !== loadedVersion) {
      await chrome.storage.local.set({ justUpdatedFrom: loadedVersion });
      chrome.runtime.reload();
    }
  } catch {
    // manifest.json yazılırken okunduysa bir sonraki kontrolde tekrar denenir.
  }
}

async function checkRemoteVersion() {
  let remoteVersion = null;
  let lastError = null;
  try {
    const res = await fetch(`${REMOTE_MANIFEST}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`GitHub'a ulaşılamadı (${res.status})`);
    remoteVersion = (await res.json()).version || null;
  } catch (err) {
    lastError = err.message || String(err);
  }
  await chrome.storage.local.set({ remoteVersion, lastCheck: Date.now(), lastError });
  await updateBadge();
}

async function updateBadge() {
  const { remoteVersion } = await chrome.storage.local.get('remoteVersion');
  const hasUpdate = remoteVersion && compareVersions(remoteVersion, loadedVersion) > 0;
  await chrome.action.setBadgeText({ text: hasUpdate ? 'YENİ' : '' });
  if (hasUpdate) await chrome.action.setBadgeBackgroundColor({ color: '#e1306c' });
}

async function getStatus() {
  const s = await chrome.storage.local.get(['remoteVersion', 'lastCheck', 'lastError', 'justUpdatedFrom']);
  return { ...s, version: loadedVersion, hasUpdate: Boolean(s.remoteVersion && compareVersions(s.remoteVersion, loadedVersion) > 0) };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg?.type) {
    case 'igsz-download':
      // CDN adresleri farklı origin'de olduğu için <a download> çalışmaz; downloads API çalışır.
      chrome.downloads.download({ url: msg.url, filename: msg.filename, conflictAction: 'uniquify', saveAs: false }, (id) => {
        if (chrome.runtime.lastError || id === undefined) {
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'İndirme başlatılamadı' });
        } else {
          sendResponse({ ok: true, id });
        }
      });
      return true;

    case 'igsz-status':
      getStatus().then(sendResponse);
      return true;

    case 'igsz-check-now':
      checkRemoteVersion().then(getStatus).then(sendResponse);
      return true;

    default:
      return false;
  }
});

function setup() {
  chrome.alarms.create('igsz-local', { periodInMinutes: LOCAL_CHECK_MINUTES });
  chrome.alarms.create('igsz-remote', { periodInMinutes: REMOTE_CHECK_MINUTES });
  checkRemoteVersion();
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'igsz-local') checkLocalFiles();
  else if (alarm.name === 'igsz-remote') checkRemoteVersion();
});
