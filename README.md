# Story Zoom & İndir — Brave / Chrome eklentisi

Instagram'da **fareyi bir fotoğrafın, videonun ya da hikayenin üstüne getirdiğiniz anda** onu tam çözünürlükte büyük açar.
Klavyeyle büyütür, indirir, hikayeler ve kaydırmalı gönderiler arasında geçer.

## Kurulum (bir kerelik)

Güncellemeleri tek tıkla alabilmek için eklentiyi ZIP yerine **git** ile indirin.

1. Git yüklü değilse kurun: <https://git-scm.com/download/win> (kurulumda her şeyi varsayılan bırakın).
2. Eklentinin duracağı klasörde bir komut penceresi açın (ör. Belgeler klasöründe adres çubuğuna `cmd` yazıp Enter) ve şunu çalıştırın:

   ```
   git clone -b claude/cool-darwin-86wi8h https://github.com/burakbagdat-py/in.git story-zoom
   ```

3. Brave'de `brave://extensions` adresine gidin, sağ üstten **Geliştirici modu**nu açın.
4. Eski sürümü kurduysanız onu **Kaldır** ile silin.
5. **Paketlenmemiş öğe yükle** butonuna basın ve az önce oluşan `story-zoom` klasörünü seçin.
6. Instagram sekmesini yenileyin (F5).

> Chrome, Edge, Opera gibi Chromium tabanlı tüm masaüstü tarayıcılarda da çalışır.
> Brave'in telefon (Android / iOS) sürümü eklenti desteklemez.

## Güncelleme

Eklenti GitHub'da yeni sürüm olup olmadığını saatte bir kontrol eder. Yeni sürüm varsa araç çubuğundaki
ikonunda pembe **YENİ** etiketi çıkar.

1. `story-zoom` klasöründeki **`update.bat`** dosyasına çift tıklayın (Mac/Linux: `update.sh`).
2. Eklenti **1 dakika içinde kendini yeniler**; `brave://extensions`'a girmenize gerek yoktur.
3. Instagram sekmesini yenileyin.

Eklenti ikonuna tıklayınca açılan pencerede yüklü sürümü, GitHub'daki sürümü görebilir ve elle kontrol edebilirsiniz.

İsterseniz güncellemeyi tamamen otomatik yapmak için Windows'ta komut penceresinde bir kez şunu çalıştırın
(yolu kendi klasörünüze göre değiştirin); `update.bat` her saat kendiliğinden çalışır:

```
schtasks /create /tn "Story Zoom guncelle" /sc hourly /f /tr "\"C:\Users\KULLANICI\Documents\story-zoom\update.bat\" /sessiz"
```

## Kullanım

**Fareyle üzerine gelin**: akıştaki gönderiler, profil kılavuzu, reels, açık hikaye ve hikaye halkaları
(halkanın üstüne gelince o kişinin hikayeleri açılır, görüldü olarak işaretlenmez). Fareyi çekince kapanır.

| Tuş | Ne yapar |
|---|---|
| `W` | Büyüt (önizleme açık değilse farenin altındakini açar) |
| `Q` | Küçült |
| `S` | İndir (farenin altındakini ya da açık olanı) |
| `A` / `D` | Önceki / sonraki: hikayeler, kaydırmalı gönderinin fotoğrafları |
| `F` | Tam ekran görüntüleyici (fareyle sürükle, tekerlekle yakınlaştır) |
| `M` | Videonun sesini aç/kapat |
| `H` | Fareyle açmayı aç/kapat |
| `Esc` | Kapat |

Büyütülmüş önizlemede fareyi kaynak görselin üstünde gezdirerek görüntünün farklı yerlerine bakabilirsiniz.

Tam ekran görüntüleyicide ayrıca: fare tekerleği / touchpad'de iki parmakla sıkıştırma ile yakınlaştırma,
sürükleyerek kaydırma, çift tık ile 1× ↔ 3×, `0` ile ekrana sığdırma, videolarda `Boşluk` ile oynat/duraklat ve
alttaki çubukla sarma. Yüzde göstergesi gerçek piksel boyutuna göredir: **100% = orijinal çözünürlük**.

Hikaye sayfasında sağ ortada 🔍 (büyüt) ve ⬇ (indir) butonları da vardır.
Bir yere yazı yazarken (ör. hikayeye yanıt) tuşlar devre dışıdır.

İndirilen dosyalar `İndirilenler/Instagram/kullaniciadi_<id>.jpg|mp4` olarak kaydedilir.

## Nasıl çalışır

- Medya, Instagram'ın kendi web API'sinden sizin oturumunuzla alınır (`/api/v1/media/<id>/info/`,
  `/api/v1/feed/reels_media/`, `/api/v1/users/web_profile_info/`). Böylece ekrandaki küçültülmüş sürüm yerine
  **en yüksek çözünürlüklü** fotoğraf / video kullanılır. Instagram videoları sayfada `blob:` olarak oynattığı için
  videolar ancak bu yolla indirilebilir.
- API'ye ulaşılamazsa sayfadaki görsel yedek olarak kullanılır (sadece fotoğraflar için).
- Güncelleme kontrolü GitHub'daki `manifest.json`'un yalnızca sürüm numarasına bakar; kod `update.bat` ile
  `git pull` yapılarak sizin bilgisayarınıza iner, eklenti de klasördeki sürüm değişince kendini yeniden yükler.
- Hiçbir veri üçüncü bir sunucuya gönderilmez.

## Sorun giderme

- **Hiçbir şey açılmıyor**: Instagram sekmesini yenileyin. `F12` → **Console**'da `[Story Zoom] v… yüklendi`
  yazısı yoksa eklenti yüklenmemiştir; `brave://extensions`'ta açık olduğundan emin olun.
- **Kırmızı uyarı çıkıyor**: uyarıdaki mesaj sebebi söyler (oturum yok, çok fazla istek, vb.).
- **"Eklenti güncellendi, sayfayı yenileyin"**: güncellemeden sonra açık kalan sekmeler için; F5'e basın.
- Instagram arayüzünü sık değiştirir; bir şey bozulursa güncellemeyi kontrol edin.

İndirdiğiniz içerikleri sahibinin izni olmadan paylaşmayın; telif ve gizlilik hakları içerik sahibine aittir.

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `manifest.json` | Eklenti tanımı (Manifest V3) |
| `content.js` | Fareyle önizleme, tam ekran görüntüleyici, medya tespiti, klavye kısayolları |
| `content.css` | Stiller |
| `background.js` | İndirme, güncelleme kontrolü, kendini yenileme |
| `popup.html` / `popup.js` | Eklenti ikonuna tıklayınca açılan pencere |
| `update.bat` / `update.sh` | Klasörü GitHub'daki son sürüme getirir (`git pull`) |
| `icons/` | Eklenti ikonları |
