# mburakbilgic.com — Windows 95 Portfolio

**[Türkçe](#türkçe) · [English](#english)**

---

# Türkçe

Windows 95 görünümlü kişisel portfolyo sitesi. Site içeriği (biyografi, projeler,
fotoğraflar, CV, masaüstü ikonları…) sunucudaki bir SQLite veritabanında **sanal
bir C: sürücüsü** olarak durur ve sitenin içindeki **MS-DOS Prompt**'tan gerçek
DOS komutlarıyla (`MD`, `EDIT`, `COPY`, `DEL`, `ATTRIB`…) yönetilir. Ayrı bir
admin paneli yoktur.

> [Don Chia](https://github.com/dhs17y2adonchia)'nın
> [win95](https://github.com/dhs17y2adonchia/win95) projesinden türetilmiştir.

- [Teknolojiler](#teknolojiler)
- [Lokal kurulum](#lokal-kurulum)
- [Ortam değişkenleri](#ortam-değişkenleri)
- [Sunucuya kurulum (VPS)](#sunucuya-kurulum-vps)
- [Güncelleme, yedekleme, geri yükleme](#güncelleme-yedekleme-geri-yükleme)
- [DOS ile içerik yönetimi](#dos-ile-içerik-yönetimi)
- [Kullanım senaryoları](#kullanım-senaryoları)
- [Sorun giderme](#sorun-giderme)

---

## Teknolojiler

- Nuxt 3 (yalnızca SSR, Nitro sunucusu), Vue 3, Pinia, Tailwind CSS
- SQLite (`better-sqlite3`) — içerik, admin oturumları
- Nodemailer — iletişim formu Google Workspace SMTP ile gönderilir
- Node.js **20.6 veya üstü** (Node 22 ile geliştirildi), paket yöneticisi `npm`

Site `server/api` uç noktaları kullandığı için **yalnızca SSR** çalışır;
`npm run generate` ile statik çıktı alınamaz.

---

## Lokal kurulum

```bash
git clone https://github.com/mburakbilgic/mburakbilgic-win95.git
cd mburakbilgic-win95
npm install
cp .env.example .env
```

Admin şifresinin hash'ini üret (şifre en az 12 karakter, ekrana yazılmaz):

```bash
npm run admin:hash
```

Çıkan `scrypt$...` satırını `.env` içindeki `NUXT_ADMIN_PASSWORD_HASH=` değerine
yapıştır. Şifrenin kendisi hiçbir dosyaya yazılmaz.

Geliştirme sunucusunu başlat:

```bash
npm run dev
```

`http://localhost:3000` açılır. Veritabanı ilk açılışta yoksa
`.data/site.db` oluşturulur ve `server/seed/*.json` içeriğiyle doldurulur.

> **Dikkat:** Dev sunucusu açıkken `npm run build` çalıştırma. İkisi aynı
> `.nuxt/` klasörünü kullanır; build dev sunucusunun dosyalarını siler ve site
> 500 döner. Olursa: dev sunucusunu durdur, `.nuxt` klasörünü sil, `npm run dev`.

---

## Ortam değişkenleri

Hepsi `.env` dosyasında durur; `.env` repoya girmez, `.env.example` girer.
Sırlar yalnızca sunucuda okunur, hiçbiri `NUXT_PUBLIC_` önekiyle tanımlanmaz.

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `NUXT_ADMIN_PASSWORD_HASH` | DOS'ta `LOGIN` için | `npm run admin:hash` çıktısı |
| `NUXT_MAIL_SMTP_HOST` / `_PORT` | Mail için | Google Workspace: `smtp.gmail.com` / `465` |
| `NUXT_MAIL_SMTP_USER` | Mail için | Gönderen hesap, ör. `iletisim@alanadi.com` |
| `NUXT_MAIL_SMTP_PASS` | Mail için | Google **uygulama şifresi** (normal şifre değil) |
| `NUXT_MAIL_TO` | Hayır | Mesajların düşeceği kutu; boşsa SMTP kullanıcısı |
| `NUXT_DB_PATH` | Hayır | Veritabanı yolu; varsayılan `.data/site.db`. Yüklenen dosyalar aynı klasördeki `files/` altına yazılır |
| `NUXT_PUBLIC_RESUME_PDF_URL` / `_PREVIEW_URL` | Hayır | DOS'tan CV yüklenmemişse kullanılan yedek bağlantılar |
| `NUXT_PUBLIC_PHOTOS_*` | Hayır | Yalnızca boş veritabanını ilk doldururken okunur |
| `NITRO_HOST` / `NITRO_PORT` | Hayır | Production'da dinlenecek adres/port; varsayılan `0.0.0.0:3000` |

**Google uygulama şifresi:** Hesapta 2 Adımlı Doğrulama açık olmalı
(Workspace'te yönetici önce kendi hesabında açar). Sonra
myaccount.google.com → Güvenlik → Uygulama şifreleri → yeni şifre. Boşluklu
16 karakter olarak verilir; boşluklarıyla da yapıştırabilirsin.

---

## Sunucuya kurulum (VPS)

Örnek: Ubuntu, Node 22, PM2, Nginx, Let's Encrypt.

### 1. Kod ve bağımlılıklar

```bash
git clone https://github.com/mburakbilgic/mburakbilgic-win95.git /var/www/mburakbilgic
cd /var/www/mburakbilgic
npm ci
```

`better-sqlite3` yerel bir modüldür; `npm ci` derleme hatası verirse
`sudo apt install build-essential python3` kurup tekrar dene.

### 2. `.env`

```bash
cp .env.example .env
nano .env
```

SMTP değerlerini ve `NUXT_ADMIN_PASSWORD_HASH`'i doldur (hash'i sunucuda
`npm run admin:hash` ile üretebilirsin). Uygulamayı yalnızca Nginx'in
görmesi için şunları da ekle:

```bash
NITRO_HOST=127.0.0.1
NITRO_PORT=3000
```

### 3. Build ve PM2

```bash
npm run build
pm2 start .output/server/index.mjs --name mburakbilgic --node-args="--env-file=.env"
pm2 save
pm2 startup
```

PM2'yi **proje klasöründen** başlat: `.env` ve `.data/` çalışma klasörüne
göre bulunur.

### 4. Nginx

```nginx
server {
    server_name mburakbilgic.com www.mburakbilgic.com;

    # DOS'tan yüklenen görsel/PDF'ler için (dosya başı 15 MB sınırı var)
    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mburakbilgic.com -d www.mburakbilgic.com
```

`X-Forwarded-Host` ve `X-Forwarded-Proto` başlıkları **zorunlu**: DOS'taki
yazma komutları isteğin siteden geldiğini bu başlıklarla doğrular. Eksikse
`LOGIN` çalışır ama her yazma komutu `General failure reading drive C` verir.

Site HTTPS üzerinden açılmalı: production'da oturum çerezi yalnızca HTTPS'te
gönderilir. `http://` veya IP ile açarsan `LOGIN` başarılı görünür ama ilk
yazma komutunda `Session expired` alırsın.

---

## Güncelleme, yedekleme, geri yükleme

### Kodu güncellemek

```bash
cd /var/www/mburakbilgic
git pull --ff-only
npm ci
npm run build
pm2 restart mburakbilgic
```

İçerik (`.data/`) bu işlemden etkilenmez; site içeriği git'te değil
veritabanında yaşar.

### Yedek

Bütün içerik `.data/` klasöründedir: `site.db` (metinler, klasörler,
oturumlar) ve `files/` (yüklenen görsel ve PDF'ler). İkisi birlikte yedeklenir.

```bash
sudo apt install sqlite3
mkdir -p ~/backups
sqlite3 .data/site.db ".backup '$HOME/backups/site-$(date +%F).db'"
tar czf ~/backups/files-$(date +%F).tgz -C .data files
```

`.backup` komutu site çalışırken de tutarlı bir kopya alır; `site.db`'yi `cp`
ile kopyalama.

### Geri yükleme

```bash
pm2 stop mburakbilgic
cp ~/backups/site-2026-11-16.db .data/site.db
rm -f .data/site.db-wal .data/site.db-shm
tar xzf ~/backups/files-2026-11-16.tgz -C .data
pm2 start mburakbilgic
```

---

## DOS ile içerik yönetimi

**Start → MS-DOS Prompt** ile açılır. Herkes açabilir: ziyaretçiler dosyaları
okuyabilir (`DIR`, `TYPE`, `TREE`, `CD`) ama gizli dosyaları göremez ve hiçbir
şeyi değiştiremez. Değiştirmek için `LOGIN`.

### Giriş

```
C:\MBURAKBILGIC>LOGIN
Password: ************
Access granted. Session expires at 18:45.

ADMIN C:\MBURAKBILGIC>
```

- Oturum **2 saat** sürer ve uzamaz; süre dolunca prompt uyarır, yeniden `LOGIN`.
- Aynı IP'den 15 dakikada 5 hatalı deneme girişi 15 dakika kilitler.
- `LOGOUT` oturumu kapatır.

### Komutlar

| Komut | Örnek | İş |
|---|---|---|
| `HELP` | `HELP` | Komut listesi |
| `DIR [yol] [/A]` | `DIR PROJECTS`, `DIR *.TXT` | Listeler; `/A` gizlileri de gösterir |
| `CD` | `CD BIO\JOBS`, `CD ..`, `CD \` | Klasör değiştirir |
| `TREE [yol] [/F]` | `TREE /F` | Klasör ağacı; `/F` dosyalarla |
| `TYPE` | `TYPE SITE.INI` | Metin dosyasını gösterir |
| `MD` (`MKDIR`) | `MD "PHOTOS\Yeni Albüm"` | Klasör oluşturur |
| `RD` (`RMDIR`) | `RD ESKI` | Boş klasörü siler |
| `DELTREE [/Y]` | `DELTREE ESKI` | Klasörü içindekilerle siler (onay ister) |
| `DEL` (`ERASE`) | `DEL *.BAK` | Dosya siler; `DEL *.*` onay ister |
| `REN` (`RENAME`) | `REN ESKI.TXT YENI.TXT`, `REN *.TXT *.BAK` | Yeniden adlandırır |
| `COPY [/Y]` | `COPY ABOUT.TXT ABOUT.BAK` | Kopyalar; üzerine yazmadan önce sorar |
| `COPY A:` | `COPY A:\*.JPG` | Bilgisayarından dosya yükler (aşağıda) |
| `COPY CON` | `COPY CON NOT.TXT` | Yazarak dosya oluşturur; **Ctrl+Z, Enter** bitirir, Ctrl+C iptal |
| `MOVE [/Y]` | `MOVE *.JPG "PHOTOS\Albüm"` | Taşır; klasörün adını da değiştirir |
| `EDIT` | `EDIT BIO\ABOUT.TXT` | Tam ekran editör (aşağıda) |
| `ECHO` | `ECHO metin > A.TXT`, `ECHO metin >> A.TXT` | `>` üzerine yazar, `>>` sona ekler; `ECHO.` boş satır |
| `ATTRIB` | `ATTRIB +H DOSYA`, `ATTRIB -R DOSYA` | **H** gizli (sitede görünmez), **R** salt okunur |
| `CLS`, `VER`, `EXIT` | | Ekranı temizler, sürüm, pencereyi kapatır |

Adında boşluk olan yolları tırnağa al: `EDIT "BIO\JOBS\04 Yeni Şirket.TXT"`.
`*` ve `?` jokerleri `DIR`, `DEL`, `COPY`, `MOVE`, `REN`, `ATTRIB` ile çalışır;
`DEL`, `COPY`, `MOVE` ve `REN` gerçek DOS gibi gizli dosyaları atlar.

**Kısayollar:** ↑/↓ önceki komutlar · Esc satırı siler · Ctrl+Z veya F6 `COPY CON`'u bitirir · Ctrl+C `COPY CON`'u iptal eder.

### EDIT

| Tuş | İş |
|---|---|
| Ctrl+S | Kaydet |
| Esc | Çık; kaydedilmemiş değişiklik varsa sorar (Y kaydet / N at / Esc geri dön) |
| Alt+F | File menüsü |

Olmayan bir dosyayı açarsan boş açılır, ilk kayıtta oluşur. Kaydettiğin
dosyanın biçimi bozuksa durum çubuğunda hemen uyarı çıkar.

### Dosya yükleme: `COPY A:`

A: sürücüsü senin bilgisayarındır. `COPY A:\*.JPG` dosya seçme penceresini
açar; seçtiğin dosyalar bulunduğun klasöre (ya da verdiğin hedefe) yüklenir.

- Türler: **JPEG, PNG, GIF, WEBP, PDF** (dosyanın içeriğine bakılır, uzantıya değil)
- Dosya başı en fazla **15 MB**; metin dosyaları en fazla 256 KB
- Aynı adda dosya varsa `Overwrite …? (Yes/No/All)` sorar
- Pencereyi iptal edersen `Not ready reading drive A`

### Değişiklik ne zaman sitede görünür?

Hemen. Bir komut sitenin gösterdiği içeriği değiştirdiyse DOS içeriği arka
planda yeniden yükler ve şunu yazar:

```
The site has been updated.
```

Masaüstü ikonları, açık pencereler (Biography, Projects, Tech Monolith,
Photos, klasör ve Notepad pencereleri) ve Start menüsü **F5'e basmadan**
güncellenir. Silinen ya da gizlenen bir klasörün/dosyanın açık penceresi
kendiliğinden kapanır. Bu satır çıkmadıysa değişiklik yalnızca DOS'ta görünür
(ör. `.BAK` dosyası, sitenin okumadığı bir klasör).

Nadiren bir pencere eski hali gösterirse (ör. `ABOUT.TXT`'deki `Intro:`
satırı) pencereyi kapatıp aç ya da F5'e bas. Yeniden yükleme başarısız olursa
DOS bunun yerine `Press F5 to refresh the page.` yazar.

### Masaüstü

`DESKTOP` klasörü masaüstünün kendisidir:

- `.LNK` dosyaları → uygulama kısayolları (Biography, Projects…), `Order=` sırasıyla
- Klasörler → klasör ikonu; çift tıklayınca Win95 gezgin penceresi açılır, içindeki klasörler de açılabilir
- Metin dosyaları (`.TXT`, `.INI`, …) → çift tıklayınca **Notepad** (salt okunur; düzenleme DOS'ta `EDIT` ile)
- Görseller → resim önizleme penceresi · PDF'ler → yeni sekme

Kısayollardan sonra önce klasörler, sonra dosyalar alfabetik dizilir. Gizli
(`ATTRIB +H`) öğeler görünmez. Aynı klasörü ya da dosyayı tekrar açmak yeni
pencere açmaz, açık olanı öne getirir.

```
MD DESKTOP\NOTLAR
EDIT DESKTOP\NOTLAR\YAPILACAK.TXT
COPY A:\*.JPG DESKTOP\NOTLAR
```

Bu üç komuttan sonra masaüstünde `NOTLAR` klasörü belirir; içinde not ve
görseller açılır. Notepad açıkken dosyayı `EDIT` ile değiştirirsen Notepad
yeni hali gösterir.

### Sanal C: sürücüsü

```
C:\MBURAKBILGIC
├── SITE.INI             site adı, başlık, konum, doğum yılı
├── DESKTOP\             masaüstü: .LNK kısayollar, klasörler, dosyalar
├── BIO
│   ├── ABOUT.TXT        hakkımda metni + CV bağlantısı
│   ├── BADGES.INI       teknoloji rozetleri
│   └── JOBS\*.TXT       iş deneyimleri (ada göre sıralanır)
├── PROJECTS\*.INI       Projects penceresindeki GitHub projeleri
├── TECHMON              Tech Monolith penceresi
│   ├── TECHMON.INI      logo ve şirket bağlantısı
│   └── PHASE*.TXT       bölümler
├── PHOTOS\<albüm>\      Photos penceresindeki albümler ve görseller
└── SOCIAL\*.URL         Start menüsündeki sosyal bağlantılar
```

Bu klasörler (`BIO`, `DESKTOP`, `PROJECTS`…) silinemez, yeniden
adlandırılamaz ve gizlenemez; içlerindeki dosyalar serbestçe değiştirilir.

**İki dosya biçimi vardır:**

- **INI:** `[Bölüm]` başlığı ve altında `Anahtar=Değer` satırları.
- **Başlıklı metin (`.TXT`):** en üstte `Anahtar: değer` satırları, **bir boş
  satır**, sonra gövde. Gövdede paragraflar boş satırla ayrılır.

Anahtarların büyük/küçük harfi önemli değildir. Biçimi bozuk bir dosya siteyi
düşürmez: site o kaydı atlar, DOS da bir uyarı yazar.

**Görsel ve CV referansları** (`Image:`, `LogoUrl=`, `ResumePath:`) üç şekilde
yazılabilir:

1. Aynı klasördeki yüklenmiş dosyanın adı: `Image: onco-ai.png`
2. Tam yol: `Image: C:\MBURAKBILGIC\PHOTOS\Albüm\kapak.jpg`
3. Bir URL. Aynı klasörde **URL'deki dosya adıyla** yüklenmiş bir dosya varsa
   URL yerine o kullanılır; eski bağlantıları değiştirmeden dosyayı yükleyip
   geçebilirsin.

**İkonlar:** `.LNK` dosyalarındaki `Icon=`, `assets/win95Icons/` içindeki bir
dosya adıdır (`bio.png`, `mail.png`, `photos.png`, `folder.png`, `file.png`,
`msdos.png`…). `.URL` dosyalarındaki `IconFile=` ise `assets/iPhone-Icons/`
içinden (`Github.webp`, `Linkedin.webp`, `Twitter.webp`). Yeni bir ikon için
dosyayı o klasöre ekleyip siteyi yeniden build etmek gerekir.

---

## Kullanım senaryoları

Hepsi `LOGIN`'den sonra, `ADMIN C:\MBURAKBILGIC>` prompt'unda başlar.

> **Geri alma yok.** `DEL`, `DELTREE` ve üzerine yazma kalıcıdır. Önemli bir
> dosyayı değiştirmeden önce yedekle: `COPY BIO\ABOUT.TXT BIO\ABOUT.BAK`.
> `.BAK` dosyalarını site okumaz, sadece DOS'ta durur.

### 1. Yeni proje eklemek

```
EDIT PROJECTS\yeni-repo.INI
```

Editöre yaz, **Ctrl+S**, **Esc**:

```ini
[Project]
Title=Yeni Proje
Owner=mburakbilgic
Repo=yeni-repo
Branch=main
Description=Projenin tek satırlık açıklaması
```

**Sonuç:** Projects penceresinde yeni kutucuk. Kutucuğa tıklayınca
`Owner/Repo/Branch`'teki README gösterilir. `Title=` yoksa proje atlanır.

### 2. Projeyi gizlemek veya kaldırmak

```
ATTRIB +H PROJECTS\hrms.INI
```

Sitede görünmez ama dosya durur; `ATTRIB -H PROJECTS\hrms.INI` ile geri gelir.
Kalıcı silmek için `DEL PROJECTS\hrms.INI`.

### 3. CV'yi güncellemek

`BIO\ABOUT.TXT` içindeki `ResumePath:` satırı CV'yi gösterir
(ör. `ResumePath: /files/mburakbilgic_en.pdf`). BIO klasörüne **aynı adla**
bir PDF yüklemen yeterli:

```
CD BIO
COPY A:\*.PDF
```

Dosya penceresinden `mburakbilgic_en.pdf`'i seç; zaten varsa `Y` ile üzerine
yaz. **Sonuç:** Résumé penceresi, Start menüsündeki Résumé ve Biography'deki
bağlantı yeni dosyayı açar. Farklı adla yüklediysen `EDIT ABOUT.TXT` ile
`ResumePath:` değerini o adla değiştir.

### 4. Yeni fotoğraf albümü

```
MD "PHOTOS\Yeni Albüm (25-26)"
CD "PHOTOS\Yeni Albüm (25-26)"
COPY A:\*.JPG
```

Dosya penceresinde birden çok görsel seçebilirsin. **Sonuç:** Photos
penceresinde yeni klasör. Görsel silmek için `DEL "Kapak.JPG"`, albümü
tamamen kaldırmak için `CD \MBURAKBILGIC\PHOTOS` sonra
`DELTREE "Yeni Albüm (25-26)"`.

### 5. Yeni iş deneyimi

İş deneyimleri dosya adına göre sıralanır. Başa numara koymak sırayı belirler.

```
EDIT "BIO\JOBS\04 Yeni Şirket.TXT"
```

```
Company: Yeni Şirket
Period: 2021 - 2022
Role: Software Engineer

Bu pozisyonda yaptığın işlerin açıklaması.
```

`Company:` yoksa kayıt atlanır. En üste yeni bir iş eklemek için
önce diğerlerini kaydır, en sondan başlayarak:

```
CD BIO\JOBS
REN "03 Massive Bio.TXT" "04 Massive Bio.TXT"
REN "02 Farmakod.TXT" "03 Farmakod.TXT"
REN "01 Tech Monolith.TXT" "02 Tech Monolith.TXT"
EDIT "01 Yeni Şirket.TXT"
```

### 6. Hakkımda metnine paragraf eklemek

```
EDIT BIO\ABOUT.TXT
```

Gövdenin sonuna **bir boş satır** bırakıp yeni paragrafı yaz. En üstteki
`Intro:` satırındaki `{age}` sitede yaşa çevrilir.

Editör açmadan tek satır eklemek de mümkün:

```
ECHO. >> BIO\ABOUT.TXT
ECHO Yeni paragrafın metni. >> BIO\ABOUT.TXT
```

### 7. Tech Monolith görselleri ve yeni bölüm

Bölümlerdeki `Image:` satırları eski bucket URL'lerini gösteriyor
(ör. `.../onco-ai-web.PNG`). Görseli **aynı adla** TECHMON'a yüklemek yeterli:

```
CD TECHMON
COPY A:\*.*
```

Logo için `TECHMON.INI` içindeki `LogoUrl=` adıyla aynı dosyayı yükle.

Yeni bölüm:

```
EDIT TECHMON\PHASE5.TXT
```

```
Title: Phase Five: Yeni Bölüm
Image: yeni-gorsel.png
Caption: Görsel altı yazısı
Variant: full

Birinci paragraf.

İkinci paragraf.
```

`Variant: full` görseli tam genişlikte, başka herhangi bir değer (ör. `cover`)
kapak düzeninde gösterir. `Image:` satırı yoksa bölüm görselsiz çıkar.

### 8. Sosyal bağlantı eklemek

```
EDIT SOCIAL\Instagram.URL
```

```ini
[InternetShortcut]
URL=https://instagram.com/kullanici
IconFile=Instagram.webp

[Menu]
AccessKey=I
Order=4
```

Start menüsünde görünen ad dosya adıdır (`Instagram`). `Order=` sırayı,
`AccessKey=` altı çizili harfi belirler. `IconFile=` için
`assets/iPhone-Icons/` içinde o dosya olmalı (yoksa ikon boş görünür).

### 9. Masaüstü ikonunu düzenlemek veya gizlemek

```
EDIT DESKTOP\Photos.LNK
```

```ini
[Shortcut]
Target=PhotosWindow
Name=Fotoğraflar
Icon=photos.png
Order=6
X=5vw
Y=10vh
```

`Name=` ikonun ve pencerenin adını, `Icon=` ikonu, `Order=` sırayı, `X=`/`Y=`
pencerenin açılış konumunu değiştirir. `Target=`, `content/windows.json`'daki
pencere kimliğidir (`BiographyWindow`, `ProjectsWindow`, `ResumeWindow`,
`TechMonolithWindow`, `MailWindow`, `PhotosWindow`); ona dokunma.

İkonu gizlemek: `ATTRIB +H DESKTOP\Mail.LNK` · geri getirmek: `ATTRIB -H DESKTOP\Mail.LNK`.

### 10. Site başlığı ve kimlik bilgileri

```
EDIT SITE.INI
```

`Name=`, `Headline=`, `Location=`, `BirthYear=` (yaş hesabı),
`MailRecipientLabel=` (mail penceresindeki alıcı adı) burada.

### 11. Toplu işler

```
DIR PHOTOS\Albüm\*.PNG          albümdeki PNG'leri listele
ATTRIB +H "PHOTOS\Eski Albüm\*.*"   albümdeki tüm görselleri gizle
MOVE *.JPG "PHOTOS\Yeni Albüm"  bulunduğun klasördeki JPG'leri taşı
COPY BIO\JOBS\*.TXT YEDEK       iş dosyalarını YEDEK klasörüne kopyala
REN *.TXT *.BAK                 bulunduğun klasördeki .TXT'leri .BAK yap
```

`YEDEK` gibi sitenin okumadığı bir klasörü `MD YEDEK` ile ana klasörde
açabilirsin; site onu görmez.

### 12. Bir şey ters giderse

| Ekranda | Anlamı |
|---|---|
| `Warning: PROJECTS\x.INI: missing [Project] Title=, skipped` | Dosya kaydedildi ama biçimi eksik; site o kaydı atlıyor. `EDIT` ile düzelt |
| `Access denied` | Salt okunur dosya (`ATTRIB -R` ile aç) ya da korunan site klasörü |
| `Access denied. Type LOGIN…` | Oturum yok ya da süresi doldu |
| `File not found - …` | Yol veya ad yanlış (`.LNK`'yi `.INK` yazmak gibi); `DIR` ile kontrol et |
| `Unable to create directory` | Aynı adda klasör var ya da üst klasör yok |
| `Invalid path, not directory, or directory not empty` | `RD` yalnızca boş klasörü siler; dolu klasör için `DELTREE` |
| `Not ready reading drive A` | Dosya seçme penceresi iptal edildi |

---

## Sorun giderme

- **Site 500 dönüyor (lokal), loglarda `#internal/nuxt/paths`:** dev sunucusu
  açıkken build alınmış. Dev sunucusunu durdur, `.nuxt` klasörünü sil,
  `npm run dev`.
- **DOS'ta yeni komut "Bad command" diyor ya da eski davranıyor:** sayfa,
  kod güncellemesinden önce açılmış. **F5** ile yenile.
- **Production'da `LOGIN` başarılı ama yazma komutları `Session expired` ya
  da `General failure reading drive C` veriyor:** site HTTPS ile mi açıldı,
  Nginx `X-Forwarded-Host` / `X-Forwarded-Proto` gönderiyor mu?
  ([Nginx](#4-nginx))
- **Büyük görsel yüklenmiyor (`413`):** Nginx'te `client_max_body_size 16m` yok.
- **Mail gitmiyor:** `pm2 logs mburakbilgic` içinde `[mail]` satırlarına bak;
  çoğunlukla uygulama şifresi ya da `NUXT_MAIL_SMTP_USER` yanlıştır.
- **Admin şifresini unuttum:** `npm run admin:hash` ile yeni hash üret,
  `.env`'e yaz, `pm2 restart mburakbilgic`.

---

# English

A personal portfolio site that looks like Windows 95. All site content (bio,
projects, photos, résumé, desktop icons…) lives on the server in an SQLite
database as a **virtual C: drive** and is managed with real DOS commands
(`MD`, `EDIT`, `COPY`, `DEL`, `ATTRIB`…) from the **MS-DOS Prompt** inside the
site. There is no separate admin panel.

> Based on [win95](https://github.com/dhs17y2adonchia/win95) by
> [Don Chia](https://github.com/dhs17y2adonchia).

- [Tech stack](#tech-stack)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Deploying to a VPS](#deploying-to-a-vps)
- [Updates, backup and restore](#updates-backup-and-restore)
- [Managing content with DOS](#managing-content-with-dos)
- [Use cases](#use-cases)
- [Troubleshooting](#troubleshooting)

---

## Tech stack

- Nuxt 3 (SSR only, Nitro server), Vue 3, Pinia, Tailwind CSS
- SQLite (`better-sqlite3`) — content and admin sessions
- Nodemailer — the contact form sends mail through Google Workspace SMTP
- Node.js **20.6 or later** (developed on Node 22), package manager `npm`

The site uses `server/api` endpoints, so it runs **SSR only**; `npm run generate`
cannot produce a static build.

---

## Local setup

```bash
git clone https://github.com/mburakbilgic/mburakbilgic-win95.git
cd mburakbilgic-win95
npm install
cp .env.example .env
```

Generate the admin password hash (at least 12 characters, input is hidden):

```bash
npm run admin:hash
```

Paste the printed `scrypt$...` line into `NUXT_ADMIN_PASSWORD_HASH=` in `.env`.
The password itself is never written to any file.

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`. On first start `.data/site.db` is created and
filled from `server/seed/*.json`.

> **Careful:** do not run `npm run build` while the dev server is running.
> Both use the same `.nuxt/` folder; the build deletes the dev server's files
> and the site returns 500. If it happens: stop the dev server, delete `.nuxt`,
> run `npm run dev`.

---

## Environment variables

All of them live in `.env`; `.env` is not committed, `.env.example` is.
Secrets are read only on the server; none of them uses the `NUXT_PUBLIC_` prefix.

| Variable | Required | Description |
|---|---|---|
| `NUXT_ADMIN_PASSWORD_HASH` | For DOS `LOGIN` | Output of `npm run admin:hash` |
| `NUXT_MAIL_SMTP_HOST` / `_PORT` | For mail | Google Workspace: `smtp.gmail.com` / `465` |
| `NUXT_MAIL_SMTP_USER` | For mail | Sending account, e.g. `contact@yourdomain.com` |
| `NUXT_MAIL_SMTP_PASS` | For mail | Google **app password** (not the account password) |
| `NUXT_MAIL_TO` | No | Inbox for contact messages; defaults to the SMTP user |
| `NUXT_DB_PATH` | No | Database path; default `.data/site.db`. Uploaded files go to `files/` next to it |
| `NUXT_PUBLIC_RESUME_PDF_URL` / `_PREVIEW_URL` | No | Fallback links used until a résumé is uploaded from DOS |
| `NUXT_PUBLIC_PHOTOS_*` | No | Read only when seeding an empty database |
| `NITRO_HOST` / `NITRO_PORT` | No | Production listen address/port; default `0.0.0.0:3000` |

**Google app password:** 2-Step Verification must be on for the account (in
Workspace the admin turns it on for their own account first). Then
myaccount.google.com → Security → App passwords → create one. It is shown as
16 characters with spaces; pasting it with the spaces is fine.

---

## Deploying to a VPS

Example: Ubuntu, Node 22, PM2, Nginx, Let's Encrypt.

### 1. Code and dependencies

```bash
git clone https://github.com/mburakbilgic/mburakbilgic-win95.git /var/www/mburakbilgic
cd /var/www/mburakbilgic
npm ci
```

`better-sqlite3` is a native module; if `npm ci` fails to compile it, install
`sudo apt install build-essential python3` and try again.

### 2. Environment file

```bash
cp .env.example .env
nano .env
```

Fill in the SMTP values and `NUXT_ADMIN_PASSWORD_HASH` (you can run
`npm run admin:hash` on the server). Add these so only Nginx can reach the app:

```bash
NITRO_HOST=127.0.0.1
NITRO_PORT=3000
```

### 3. Build and PM2

```bash
npm run build
pm2 start .output/server/index.mjs --name mburakbilgic --node-args="--env-file=.env"
pm2 save
pm2 startup
```

Start PM2 **from the project folder**: `.env` and `.data/` are resolved
relative to the working directory.

### 4. Nginx configuration

```nginx
server {
    server_name mburakbilgic.com www.mburakbilgic.com;

    # Images/PDFs uploaded from DOS (the app limits each file to 15 MB)
    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mburakbilgic.com -d www.mburakbilgic.com
```

The `X-Forwarded-Host` and `X-Forwarded-Proto` headers are **required**: DOS
write commands use them to check that the request comes from the site itself.
Without them `LOGIN` works but every write command prints
`General failure reading drive C`.

Serve the site over HTTPS: in production the session cookie is only sent over
HTTPS. Opened via `http://` or an IP address, `LOGIN` appears to succeed but
the first write command prints `Session expired`.

---

## Updates, backup and restore

### Updating the code

```bash
cd /var/www/mburakbilgic
git pull --ff-only
npm ci
npm run build
pm2 restart mburakbilgic
```

Content (`.data/`) is not touched; site content lives in the database, not in git.

### Backing up

All content is in `.data/`: `site.db` (texts, folders, sessions) and `files/`
(uploaded images and PDFs). Back up both together.

```bash
sudo apt install sqlite3
mkdir -p ~/backups
sqlite3 .data/site.db ".backup '$HOME/backups/site-$(date +%F).db'"
tar czf ~/backups/files-$(date +%F).tgz -C .data files
```

`.backup` takes a consistent copy while the site is running; do not copy
`site.db` with `cp`.

### Restoring

```bash
pm2 stop mburakbilgic
cp ~/backups/site-2026-11-16.db .data/site.db
rm -f .data/site.db-wal .data/site.db-shm
tar xzf ~/backups/files-2026-11-16.tgz -C .data
pm2 start mburakbilgic
```

---

## Managing content with DOS

Open it with **Start → MS-DOS Prompt**. Anyone can open it: visitors can read
files (`DIR`, `TYPE`, `TREE`, `CD`) but cannot see hidden files or change
anything. To make changes, `LOGIN`.

### Signing in

```
C:\MBURAKBILGIC>LOGIN
Password: ************
Access granted. Session expires at 18:45.

ADMIN C:\MBURAKBILGIC>
```

- A session lasts **2 hours** and is not extended; when it expires the prompt
  says so and you `LOGIN` again.
- 5 failed attempts from the same IP within 15 minutes lock login for 15 minutes.
- `LOGOUT` ends the session.

### Command reference

| Command | Example | What it does |
|---|---|---|
| `HELP` | `HELP` | Lists commands |
| `DIR [path] [/A]` | `DIR PROJECTS`, `DIR *.TXT` | Lists files; `/A` includes hidden ones |
| `CD` | `CD BIO\JOBS`, `CD ..`, `CD \` | Changes directory |
| `TREE [path] [/F]` | `TREE /F` | Folder tree; `/F` includes files |
| `TYPE` | `TYPE SITE.INI` | Prints a text file |
| `MD` (`MKDIR`) | `MD "PHOTOS\New Album"` | Creates a folder |
| `RD` (`RMDIR`) | `RD OLD` | Removes an empty folder |
| `DELTREE [/Y]` | `DELTREE OLD` | Removes a folder and everything in it (asks first) |
| `DEL` (`ERASE`) | `DEL *.BAK` | Deletes files; `DEL *.*` asks first |
| `REN` (`RENAME`) | `REN OLD.TXT NEW.TXT`, `REN *.TXT *.BAK` | Renames |
| `COPY [/Y]` | `COPY ABOUT.TXT ABOUT.BAK` | Copies; asks before overwriting |
| `COPY A:` | `COPY A:\*.JPG` | Uploads files from your computer (see below) |
| `COPY CON` | `COPY CON NOTE.TXT` | Creates a file from typed lines; **Ctrl+Z, Enter** ends, Ctrl+C cancels |
| `MOVE [/Y]` | `MOVE *.JPG "PHOTOS\Album"` | Moves files; also renames folders |
| `EDIT` | `EDIT BIO\ABOUT.TXT` | Full-screen editor (see below) |
| `ECHO` | `ECHO text > A.TXT`, `ECHO text >> A.TXT` | `>` overwrites, `>>` appends; `ECHO.` is an empty line |
| `ATTRIB` | `ATTRIB +H FILE`, `ATTRIB -R FILE` | **H** hidden (not shown on the site), **R** read-only |
| `CLS`, `VER`, `EXIT` | | Clear screen, version, close the window |

Quote paths with spaces: `EDIT "BIO\JOBS\04 New Company.TXT"`.
The `*` and `?` wildcards work with `DIR`, `DEL`, `COPY`, `MOVE`, `REN` and
`ATTRIB`; like real DOS, `DEL`, `COPY`, `MOVE` and `REN` skip hidden files.

**Keys:** ↑/↓ previous commands · Esc clears the line · Ctrl+Z or F6 ends `COPY CON` · Ctrl+C cancels `COPY CON`.

### The editor (EDIT)

| Key | Action |
|---|---|
| Ctrl+S | Save |
| Esc | Exit; asks if there are unsaved changes (Y save / N discard / Esc go back) |
| Alt+F | File menu |

Opening a file that does not exist starts an empty buffer; the file is created
on the first save. If the saved file is malformed, the status bar shows a
warning right away.

### Uploading files (COPY A:)

Drive A: is your computer. `COPY A:\*.JPG` opens the file picker; the files you
choose are uploaded to the current folder (or to the destination you give).

- Types: **JPEG, PNG, GIF, WEBP, PDF** (detected from the file contents, not the extension)
- At most **15 MB** per file; text files at most 256 KB
- If a file with the same name exists it asks `Overwrite …? (Yes/No/All)`
- Cancelling the picker prints `Not ready reading drive A`

### When does a change show up on the site?

Right away. If a command changed what the site displays, DOS reloads the
content in the background and prints:

```
The site has been updated.
```

Desktop icons, open windows (Biography, Projects, Tech Monolith, Photos,
folder and Notepad windows) and the Start menu update **without pressing F5**.
An open window of a folder or file that was deleted or hidden closes by itself.
If the line does not appear, the change is only visible in DOS (e.g. a `.BAK`
file or a folder the site does not read).

If a window occasionally still shows the old state (e.g. the `Intro:` line in
`ABOUT.TXT`), close and reopen it or press F5. If the reload fails, DOS prints
`Press F5 to refresh the page.` instead.

### The desktop

The `DESKTOP` folder is the desktop itself:

- `.LNK` files → application shortcuts (Biography, Projects…), ordered by `Order=`
- Folders → folder icons; double-click opens a Win95 Explorer window, and folders inside it open too
- Text files (`.TXT`, `.INI`, …) → double-click opens **Notepad** (read-only; edit with `EDIT` in DOS)
- Images → the image viewer · PDFs → a new browser tab

After the shortcuts come folders, then files, alphabetically. Hidden
(`ATTRIB +H`) items are not shown. Opening the same folder or file again does
not open a second window; it brings the open one to the front.

```
MD DESKTOP\NOTES
EDIT DESKTOP\NOTES\TODO.TXT
COPY A:\*.JPG DESKTOP\NOTES
```

After these three commands a `NOTES` folder appears on the desktop; the note
and the images open from inside it. If you change the file with `EDIT` while
its Notepad is open, Notepad shows the new version.

### The virtual C: drive

```
C:\MBURAKBILGIC
├── SITE.INI             site name, headline, location, birth year
├── DESKTOP\             the desktop: .LNK shortcuts, folders, files
├── BIO
│   ├── ABOUT.TXT        about text + résumé link
│   ├── BADGES.INI       technology badges
│   └── JOBS\*.TXT       work experience (sorted by file name)
├── PROJECTS\*.INI       GitHub projects in the Projects window
├── TECHMON              Tech Monolith window
│   ├── TECHMON.INI      logo and company link
│   └── PHASE*.TXT       sections
├── PHOTOS\<album>\      albums and images in the Photos window
└── SOCIAL\*.URL         social links in the Start menu
```

These folders (`BIO`, `DESKTOP`, `PROJECTS`…) cannot be deleted, renamed or
hidden; the files inside them can be changed freely.

**There are two file formats:**

- **INI:** a `[Section]` header followed by `Key=Value` lines.
- **Header document (`.TXT`):** `Key: value` lines at the top, **one empty
  line**, then the body. Paragraphs in the body are separated by empty lines.

Keys are case-insensitive. A malformed file never takes the site down: the site
skips that record and DOS prints a warning.

**Image and résumé references** (`Image:`, `LogoUrl=`, `ResumePath:`) can be
written three ways:

1. The name of an uploaded file in the same folder: `Image: onco-ai.png`
2. A full path: `Image: C:\MBURAKBILGIC\PHOTOS\Album\cover.jpg`
3. A URL. If a file with **the URL's file name** has been uploaded to the same
   folder, it is used instead of the URL, so you can switch away from old links
   by uploading the file without editing anything.

**Icons:** `Icon=` in `.LNK` files is a file name from `assets/win95Icons/`
(`bio.png`, `mail.png`, `photos.png`, `folder.png`, `file.png`, `msdos.png`…).
`IconFile=` in `.URL` files comes from `assets/iPhone-Icons/` (`Github.webp`,
`Linkedin.webp`, `Twitter.webp`). A new icon means adding the file to that
folder and rebuilding the site.

---

## Use cases

Each one starts after `LOGIN`, at the `ADMIN C:\MBURAKBILGIC>` prompt.

> **There is no undo.** `DEL`, `DELTREE` and overwrites are permanent. Back up
> an important file before changing it: `COPY BIO\ABOUT.TXT BIO\ABOUT.BAK`.
> The site never reads `.BAK` files; they only stay in DOS.

### 1. Add a new project

```
EDIT PROJECTS\new-repo.INI
```

Type this in the editor, then **Ctrl+S**, **Esc**:

```ini
[Project]
Title=New Project
Owner=mburakbilgic
Repo=new-repo
Branch=main
Description=A one-line description of the project
```

**Result:** a new tile in the Projects window. Clicking it shows the README from
`Owner/Repo/Branch`. Without `Title=` the project is skipped.

### 2. Hide or remove a project

```
ATTRIB +H PROJECTS\hrms.INI
```

It disappears from the site but the file stays; `ATTRIB -H PROJECTS\hrms.INI`
brings it back. To delete it permanently: `DEL PROJECTS\hrms.INI`.

### 3. Update the résumé

The `ResumePath:` line in `BIO\ABOUT.TXT` points to the résumé
(e.g. `ResumePath: /files/mburakbilgic_en.pdf`). Uploading a PDF with
**the same name** to the BIO folder is enough:

```
CD BIO
COPY A:\*.PDF
```

Pick `mburakbilgic_en.pdf` in the file picker; if it already exists, answer `Y`
to overwrite. **Result:** the Résumé window, the Start menu Résumé entry and the
link in Biography open the new file. If you uploaded it under another name,
`EDIT ABOUT.TXT` and change `ResumePath:` to that name.

### 4. New photo album

```
MD "PHOTOS\New Album (25-26)"
CD "PHOTOS\New Album (25-26)"
COPY A:\*.JPG
```

You can select several images in the file picker. **Result:** a new folder in the
Photos window. Delete an image with `DEL "Cover.JPG"`; remove the whole album
with `CD \MBURAKBILGIC\PHOTOS` and then `DELTREE "New Album (25-26)"`.

### 5. New work experience

Jobs are sorted by file name; a number prefix sets the order.

```
EDIT "BIO\JOBS\04 New Company.TXT"
```

```
Company: New Company
Period: 2021 - 2022
Role: Software Engineer

What you did in this role.
```

Without `Company:` the entry is skipped. To put a new job at the top, shift the
others first, starting from the last one:

```
CD BIO\JOBS
REN "03 Massive Bio.TXT" "04 Massive Bio.TXT"
REN "02 Farmakod.TXT" "03 Farmakod.TXT"
REN "01 Tech Monolith.TXT" "02 Tech Monolith.TXT"
EDIT "01 New Company.TXT"
```

### 6. Add a paragraph to the About text

```
EDIT BIO\ABOUT.TXT
```

Leave **one empty line** after the last paragraph and type the new one.
`{age}` in the `Intro:` line at the top is replaced with your age on the site.

You can also append without opening the editor:

```
ECHO. >> BIO\ABOUT.TXT
ECHO The new paragraph. >> BIO\ABOUT.TXT
```

### 7. Tech Monolith images and a new section

The `Image:` lines in the sections still point to old bucket URLs
(e.g. `.../onco-ai-web.PNG`). Uploading the image to TECHMON under
**the same name** is enough:

```
CD TECHMON
COPY A:\*.*
```

For the logo, upload a file with the same name as in `LogoUrl=` in `TECHMON.INI`.

A new section:

```
EDIT TECHMON\PHASE5.TXT
```

```
Title: Phase Five: A New Chapter
Image: new-image.png
Caption: Image caption
Variant: full

First paragraph.

Second paragraph.
```

`Variant: full` shows the image full width; any other value (e.g. `cover`) uses
the cover layout. Without an `Image:` line the section has no image.

### 8. Add a social link

```
EDIT SOCIAL\Instagram.URL
```

```ini
[InternetShortcut]
URL=https://instagram.com/username
IconFile=Instagram.webp

[Menu]
AccessKey=I
Order=4
```

The name shown in the Start menu is the file name (`Instagram`). `Order=` sets
the position, `AccessKey=` the underlined letter. `IconFile=` must exist in
`assets/iPhone-Icons/` (otherwise the icon is blank).

### 9. Edit or hide a desktop icon

```
EDIT DESKTOP\Photos.LNK
```

```ini
[Shortcut]
Target=PhotosWindow
Name=My Photos
Icon=photos.png
Order=6
X=5vw
Y=10vh
```

`Name=` changes the icon and window title, `Icon=` the icon, `Order=` the
order, `X=`/`Y=` where the window opens. `Target=` is the window id from
`content/windows.json` (`BiographyWindow`, `ProjectsWindow`, `ResumeWindow`,
`TechMonolithWindow`, `MailWindow`, `PhotosWindow`); leave it as it is.

Hide an icon: `ATTRIB +H DESKTOP\Mail.LNK` · bring it back: `ATTRIB -H DESKTOP\Mail.LNK`.

### 10. Site title and identity

```
EDIT SITE.INI
```

`Name=`, `Headline=`, `Location=`, `BirthYear=` (used for the age) and
`MailRecipientLabel=` (recipient name in the Mail window) live here.

### 11. Bulk operations

```
DIR PHOTOS\Album\*.PNG              list the PNGs in an album
ATTRIB +H "PHOTOS\Old Album\*.*"    hide every image in an album
MOVE *.JPG "PHOTOS\New Album"       move the JPGs in the current folder
COPY BIO\JOBS\*.TXT BACKUP          copy the job files to BACKUP
REN *.TXT *.BAK                     rename .TXT files in the current folder to .BAK
```

A folder the site does not read, such as `BACKUP`, can be created in the home
folder with `MD BACKUP`; the site ignores it.

### 12. When something goes wrong

| On screen | Meaning |
|---|---|
| `Warning: PROJECTS\x.INI: missing [Project] Title=, skipped` | The file was saved but is incomplete; the site skips it. Fix it with `EDIT` |
| `Access denied` | Read-only file (clear it with `ATTRIB -R`) or a protected site folder |
| `Access denied. Type LOGIN…` | Not signed in, or the session expired |
| `File not found - …` | Wrong path or name (e.g. `.INK` instead of `.LNK`); check with `DIR` |
| `Unable to create directory` | A folder with that name exists, or the parent folder does not |
| `Invalid path, not directory, or directory not empty` | `RD` only removes empty folders; use `DELTREE` for full ones |
| `Not ready reading drive A` | The file picker was cancelled |

---

## Troubleshooting

- **The site returns 500 locally, logs show `#internal/nuxt/paths`:** a build
  ran while the dev server was running. Stop the dev server, delete `.nuxt`,
  run `npm run dev`.
- **A new DOS command says "Bad command" or behaves the old way:** the page was
  opened before the code changed. Reload with **F5**.
- **In production `LOGIN` succeeds but write commands print `Session expired`
  or `General failure reading drive C`:** is the site served over HTTPS, and
  does Nginx send `X-Forwarded-Host` / `X-Forwarded-Proto`?
  ([Nginx configuration](#4-nginx-configuration))
- **Large images fail to upload (`413`):** Nginx is missing `client_max_body_size 16m`.
- **Mail is not delivered:** check the `[mail]` lines in `pm2 logs mburakbilgic`;
  usually the app password or `NUXT_MAIL_SMTP_USER` is wrong.
- **Forgot the admin password:** generate a new hash with `npm run admin:hash`,
  put it in `.env`, `pm2 restart mburakbilgic`.
