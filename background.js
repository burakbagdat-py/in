// Content script'ten gelen indirme isteklerini chrome.downloads ile karşılar.
// CDN adresleri farklı origin'de olduğu için <a download> çalışmaz; downloads API çalışır.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'igsz-download' || !msg.url) return false;

  chrome.downloads.download(
    {
      url: msg.url,
      filename: msg.filename,
      conflictAction: 'uniquify',
      saveAs: false
    },
    (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'İndirme başlatılamadı' });
      } else {
        sendResponse({ ok: true, id: downloadId });
      }
    }
  );
  return true; // sendResponse asenkron çağrılacak
});
