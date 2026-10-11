# Story Zoom & İndir — Brave / Chrome eklentisi

Instagram'da açtığınız hikayeyi **tam çözünürlükte yakınlaştırmanızı** ve **indirmenizi** sağlar.
Fotoğraf ve video hikayeleri, öne çıkanlar (highlights) dahil çalışır.

## Kurulum (Brave)

1. Bu repoyu indirin (`Code → Download ZIP`) ve bir klasöre çıkarın.
2. Brave'de adres çubuğuna `brave://extensions` yazın.
3. Sağ üstteki **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** (Load unpacked) butonuna basın ve `manifest.json` dosyasının bulunduğu klasörü seçin.
5. Instagram sekmesini yenileyin.

> Chrome, Edge, Opera gibi Chromium tabanlı tüm tarayıcılarda da aynı şekilde çalışır (`chrome://extensions`).

## Kullanım

Bir hikaye açtığınızda ekranın sağ ortasında iki buton belirir:

| Buton | Kısayol | İşlev |
|---|---|---|
| 🔍 | `Alt + Z` | Hikayeyi tam ekran görüntüleyicide açar (hikaye arka planda duraklatılır) |
| ⬇ | `Alt + D` | Hikayeyi orijinal kalitede indirir |

Görüntüleyicideyken:

- **Fare tekerleği / touchpad'de iki parmakla sıkıştırma**: imlecin olduğu noktaya yakınlaştır
- **Sürükle**: kaydır · **Çift tık**: 1× ↔ 3×
- `+` / `-` yakınlaştır/uzaklaştır, `0` ekrana sığdır, ok tuşları kaydır
- `D` indir, `Esc` kapat
- Videolarda: `Boşluk` oynat/duraklat, `M` ses, alttaki çubukla ileri/geri sarma

Yüzde göstergesi gerçek piksel boyutuna göredir: **100% = orijinal çözünürlük**.

İndirilen dosyalar `İndirilenler/Instagram Stories/kullaniciadi_<id>.jpg|mp4` olarak kaydedilir.

## Nasıl çalışır

- Hikayenin medyası, Instagram'ın kendi web API'sinden (`/api/v1/feed/reels_media/`) sizin oturumunuzla alınır.
  Böylece ekranda gösterilen küçültülmüş sürüm yerine **en yüksek çözünürlüklü** fotoğraf / video adresi kullanılır.
  Instagram videoları sayfada `blob:` olarak oynattığı için videolar ancak bu yolla indirilebilir.
- API'ye ulaşılamazsa sayfadaki en büyük görünür görsel yedek olarak kullanılır (sadece fotoğraflar için).
- Hiçbir veri üçüncü bir sunucuya gönderilmez; tek izin `downloads`'tır.

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `manifest.json` | Eklenti tanımı (Manifest V3) |
| `content.js` | Instagram sayfasına eklenen butonlar, medya tespiti, zoom görüntüleyici |
| `content.css` | Buton ve görüntüleyici stilleri |
| `background.js` | `chrome.downloads` ile indirme |
| `icons/` | Eklenti ikonları |

## Notlar

- Instagram arayüzünü / API'sini sık değiştirir; eklenti çalışmayı bırakırsa önce sayfayı yenileyin.
- Sadece görüntüleme izniniz olan hikayeler indirilebilir. İndirdiğiniz içerikleri sahibinin izni olmadan
  paylaşmayın; telif ve gizlilik hakları içerik sahibine aittir.
