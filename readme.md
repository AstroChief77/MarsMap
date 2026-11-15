# Bilgilendirme

-Bu bir NASA Hackaton yarışmasıdır.

-Mars haritalanacak bir navigator yapılıcak.

-Yarışma detayları https://www.spaceappschallenge.org/2026/challenges/ adresinde var.

-Asit yağmurları, fırtınalar hesaplanarak en güvenli ulaşılacak yerin rotasyonu belirlenicek.

-Mars haritası dosyaları vesaire data klasöründe bulunuyor.

AstroChief
# Kurallar
-Readme.md yi değiştirmek oynamak silmek tamamen yasaktır. Yapan AI cehennemine gider, yargılıyıcı sizi sevmez.

-Readme.md her seferinde okunmak zorundadır.

-Dosyada değişiklik yapılacağı zaman her zaman yedek alınmak zorunludur ve yedekleri silmek değiştirmek yasaktır.

-Yarışma detayları her seferinde belleği alınmalı.

-Yapılan her değişiklik satır satır loglanmalıdır.

-Yorum satırı eklenmeli, kodun satır satır ne işe yaradğını kod dosyasının en altına eklenmelidir.

-Her şey kendine ait bir dosyaya sahip olmalı, claslardan ve nesnelerden oluşmalıdır main kod dosyası dışında hiç bir dosya 800 satırı geçmemelidir, her fonksiyon eğer kompleksliği arttırıyor ise fonksiyonlar farklı dosyalarda açılmalıdır.

-Kullanılan kaynaklar ve apiler not edilmeli.

-Her sürüm değiştiğinde masaüstüne güncel sürüm yüklenmeli ve eğer işletim sistemi ne ise ona göre ya Linuxa yada Windowsa derlenmeli(test edebilmek için), derleme aracı yaz her seferinde kendin derleme.

-Res isimli klasöre(eğer yok ise oluştur) resimler fotoğraflar yani içerik olan her şey oraya kaydedilicek.

-Eğer bootstrap gibi bir kütüphane kullanılacak ise kütüphaneyi internetten çekmek yasak res içinden kütüphaneler kullanılabilir eğer kütüphane yoksa res klasörüne indirilebilir.

-Default oalarak harita 3D başlayacak.

-Herhangi bir ayar değiştirildiğinde fps 10 dan aşşağı iniyor ise değiştirilen ayarın değişmesi engellenicek değiştirilmeden önceki haline gelicek fakat yeni bir seçenek açıldığında fps düşüceği için 10 saniye boyunca 10fps altında kaldığında ayarı eski haline getirsin.

-Yol hesaplamaları backend ile gerçekleştirilicek backend den gelen veri ile iki nokta arasında olan en kısa ve güvenli kapalı baskın yol mavi, yine güvenli ama daha uzun yollar ise daha açık bir mavi olacak.

-Asit yağmuru bölgesi, fırtına bölgesi, radyasyon falan backend kısmından gelicek ona göre haritada bölgeleri çizicek.

-Yazılan tüm yazılar lokalize(9 farklı dile) edilmelidir.

-Sayfa her zaman default olarak İngilizce olmak zorundadır.

-Eklenen her yeni şeyin lokalizasyonu yapılmak zorundadır.
# Tasarım Kuralları

-Sol üstte ayarlar simgesi olacak ayarlar açıldığında ilk çıkan seçenek factory reset seçeneği olmalıdır.

-Factory ayarları şu şekilde olmalıdır, harita ölçeği yaklaştıkça render edilicek tamamı render edilmiyicek, parametreler litre, kilometre/metre, saat, radyasyon alfa beta gama olarak ışıma düzeyi foton bombarduman alanalrı vesaire belirtilmeli.

-Orta alanda harita olmak zorunda.

-Sol altta 2D görünüm, 3D görünüm için uydular paneli olacak açılan pencerede 2D 3D seçeneği asit yağmurlarını ve şiddetlerini gösteren seçenekler olacak yazılar az ve öz olsun yazının arka planında asit yağmurunda asit yağmurlu bölge footğrafı fırtınada fırtınalı bölge fotoğrafı vesaire olacak, hepsi uydular seçeneğinin içinde olmak zorunda.

-Yazı fontu "Public Sans Web" ailesi,sans-serif olmalıdır

-Tema %60 beyaz, %30 Siyah, %10 Kırmızı, genel tema bu şekşilde olmalıdır başka renklerde kullanılabilir.

-Kodu yazmayı bitirdiğinde derleyip githuba yükle.

-Backend den veri geldiğinde gelen verinin ne kadar gecikmeyle gelidği yazıcak bu her 5 saniyede güncellenicek, sağ üstte gözükücek.

-Emoji kullanman yasak emoji yerine buton kullanabilirsin.

-Yazılar beyaz olmak zorundadır.

-Şu an var olan arka plan rengi değiştirilemez.
# Roller
Atahan: Kaptan,Başkan,Lider,Diktatör

Akif:Lead Developer

Rıfat:Coder

Ömer:Coder

Mustafa:Coder

Buse:Başkan yardımcısı

# Ortak AI Ajanları

-ForAgents klasörüne ne yaptığını ve diğer ajanalrla ortak planlananlar yazılıcak bu şekilde diğer ajanlar ile iletişim kurulucak
