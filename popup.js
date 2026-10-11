const $ = (id) => document.getElementById(id);

function render(s) {
  $('version').textContent = s.version || '–';
  $('remote').textContent = s.remoteVersion || '–';
  $('checked').textContent = s.lastCheck ? new Date(s.lastCheck).toLocaleString('tr-TR') : '–';
  $('update').hidden = !s.hasUpdate;

  $('error').hidden = !s.lastError;
  $('error').textContent = s.lastError ? `Kontrol edilemedi: ${s.lastError}` : '';

  $('updated').hidden = !s.justUpdatedFrom;
  if (s.justUpdatedFrom) {
    $('updated').textContent = `✓ ${s.justUpdatedFrom} → ${s.version} sürümüne güncellendi. Açık Instagram sekmelerini yenileyin.`;
    chrome.storage.local.remove('justUpdatedFrom');
  }
}

chrome.runtime.sendMessage({ type: 'igsz-status' }).then(render);

$('check').addEventListener('click', async () => {
  const btn = $('check');
  btn.disabled = true;
  btn.textContent = 'Kontrol ediliyor…';
  try {
    render(await chrome.runtime.sendMessage({ type: 'igsz-check-now' }));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Güncellemeyi kontrol et';
  }
});
