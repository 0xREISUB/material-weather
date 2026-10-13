# GNOME Extensions’a gönderme

Bu proje henüz GNOME Extensions’da yayımlanmamıştır. Yayımlanacak sürüm yalnız GNOME Shell 46 desteği bildirir. Diğer sürümleri test etmeden `shell-version` listesine ekleme.

## Gönderimden önce

1. Kaynak kodun bulunduğu herkese açık GitHub/GitLab deposunu oluştur ve güncel kaynakları gönder. `metadata.json` içine `url` alanını ekle; değeri bu deponun gerçek HTTPS adresi olmalı. Kullanıcı adı veya örnek URL ile paket gönderme.
2. Kaynak kodu incele ve bakımını üstlen. GNOME, gönderilen kodun sahibi tarafından açıklanabilir olmasını bekler. [İnceleme kuralları](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) ve [bakım sorumluluğu](https://gjs.guide/extensions/review-guidelines/best-practices.html#submissions-require-maintainership) bölümlerini oku.
3. İngilizce/Türkçe, açık/koyu/sistem teması, farklı koordinatlar, saatlik kaydırma ve sürükleme, günlük tahmin, ağ hatası ve eklentiyi kapatıp açma davranışını GNOME 46 üzerinde kontrol et. Otomatik testler bu görsel kontrollerin yerini tutmaz.
4. Güncel sürümden bir ekran görüntüsü al. `previews/` içindeki mevcut görseller önceki geliştirme sürümlerini gösterir; mağaza sayfasında güncel görünümü kullan. Masaüstü duvar kâğıdı yerine mümkünse sadece eklenti panelini gösteren bir görüntü kullan.
5. Lisans `GPL-2.0-or-later` olarak belirtilmiştir; tam metin `LICENSE` dosyasındadır. Üçüncü taraf kod/varlık eklediysen gerekli atıf ve lisansları ayrıca koru. Open-Meteo verilerinin CC BY 4.0 atfı arayüzde ve README’de bulunur.

## ZIP dosyasını oluştur

Proje klasöründe:

```bash
npm test
bash scripts/package.sh --ego
```

Gereken araçlar: Node.js, Bash, Python 3, `zip` ve `glib-compile-schemas`.

Gönderilecek dosya:

```text
dist/material-weather@reisub.local.ego.shell-extension.zip
```

`--ego`, gerçek depo URL’si yoksa hata verir. GNOME kendi sürüm numarasını belirlediği için ZIP içindeki `version` alanını kaldırır; proje metadata dosyasını değiştirmez. Paket yalnız çalışma dosyaları, şema, dil katalogları, simgeler ve lisansı içerir. Kaynak depo ZIP’ini veya `previews/`, test/kurulum betikleri ve kişisel ayarları yükleme.

## Siteye yükle

1. [extensions.gnome.org](https://extensions.gnome.org/) üzerinde hesabına giriş yap; hesabın yoksa kayıt ol.
2. [Add yours / Upload](https://extensions.gnome.org/upload/) sayfasını aç.
3. Yukarıdaki `.ego.shell-extension.zip` dosyasını seçip gönder.
4. Site yönlendirmelerini takip et; eklenti sayfasındaki açıklama ve ekran görüntüsünü güncel tut. Açıklamada koordinatla konum seçimi, Open-Meteo, API anahtarı gerektirmemesi ve İngilizce/Türkçe desteğini belirtebilirsin.
5. İncelemeyi takip et. Onay anında veya belirli bir sürede garanti edilmez. İstenen düzeltmeleri uygula, paketi yeniden üret ve aynı UUID ile yeni sürümü gönder.

Onaylanan eklenti GNOME Extensions kataloğunda yayımlanır; Extension Manager bu katalogdan arama ve kurulum yapar. GNOME 46 desteği bildiren bir sürüm, diğer GNOME sürümlerinde uyumlu olarak listelenmeyebilir.

## Güncelleme gönderme

UUID’yi değiştirme: `material-weather@reisub.local`. UUID değişikliği mevcut kurulumlar için farklı bir eklenti anlamına gelir. Kaynakları depoya gönder, kontrolleri çalıştır, `--ego` paketini yeniden oluştur ve hesabınla aynı eklenti için yükle. GNOME sitesinin verdiği sürüm numarasını elle artırmana gerek yok.

Resmî kaynaklar: [GNOME inceleme kuralları](https://gjs.guide/extensions/review-guidelines/review-guidelines.html), [yükleme sayfası](https://extensions.gnome.org/upload/), [Extension Manager](https://github.com/mjakeman/extension-manager).
