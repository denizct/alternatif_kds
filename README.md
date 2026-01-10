# Alternatif Market KDS - Karar Destek Sistemi

Bu proje, Sunucu Tabanlı Programlama dersi kapsamında **MVC (Model-View-Controller)** mimarisi ve **RESTful API** prensipleri kullanılarak geliştirilmiş bir Karar Destek Sistemi (Decision Support System) web uygulamasıdır.

## 1. Proje Açıklaması
Alternatif Market KDS, perakende sektöründe faaliyet gösteren bir market zincirinin satış verilerini analiz etmek, şube performanslarını izlemek ve stratejik kararlar almak için geliştirilmiştir. Sistem, yöneticilere görsel paneller (dashboard) üzerinden geçmiş satış verilerini sunar, trend analizleri yapar ve geleceğe yönelik satış tahminlerinde bulunur.

**Teknolojiler:**
*   **Backend:** Node.js, Express.js
*   **Veritabanı:** MySQL
*   **Mimarisi:** MVC
*   **Frontend:** HTML5, CSS3, JavaScript (Chart.js)

## 2. Senaryo Tanımı
Proje, "Alternatif Market" adlı kurgusal bir market zinciri senaryosu üzerine kuruludur.
*   Zincirin farklı şehir ve ilçelerde şubeleri bulunmaktadır.
*   Yöneticiler, hangi şubenin verimsiz olduğunu, hangi ürün kategorilerinin yükselişte olduğunu ve bölgesel fırsatları görmek istemektedir.
*   Sistem, geçmiş verileri analiz ederek **"Kapatılması Gereken Şubeler"**, **"Yatırım Yapılması Gereken Bölgeler"** ve **"Gelecek Ay Ciro Tahminleri"** gibi stratejik çıktılar üretir.

**İş Kuralları (Business Rules):**
1.  **Silme Koruması:** Satış geçmişi olan bir ürün sistemden silinemez. Bu, veri bütünlüğünü korumak için zorunludur.
2.  **Tahmin Kısıtlaması:** Gelecek tahmini (Forecast) yapılabilmesi için ilgili kategoride en az 12 aylık geçmiş veri bulunmalıdır. Veri yetersizse sistem tahmin yapmayı reddeder ve kullanıcıyı uyarır. 


## 4. API Endpoint Listesi

### Ürün Yönetimi (CRUD)
| Metot | Endpoint | Açıklama |
| :--- | :--- | :--- |
| `GET` | `/api/products` | Tüm ürünleri listeler. |
| `POST` | `/api/products` | Yeni ürün ekler. (Body: `{ urun_ad, kategori_id }`) |
| `PUT` | `/api/products/:id` | Ürün bilgilerini günceller. |
| `DELETE` | `/api/products/:id` | Ürünü siler. *(Satışı varsa silinmez)* |

### Dashboard & Analiz
| Metot | Endpoint | Açıklama |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard/stats` | Toplam ciro ve özet istatistikler. |
| `GET` | `/api/dashboard/sales-over-time` | Zaman bazlı satış grafiği verisi. |
| `GET` | `/api/dashboard/breakdown` | Kategori ve şube bazlı dağılım. |
| `GET` | `/api/dashboard/forecast` | Gelecek 6 aylık ciro tahmini. |
| `GET` | `/api/dashboard/top-products` | En çok satan ürünler. |

### Stratejik Planlama
| Metot | Endpoint | Açıklama |
| :--- | :--- | :--- |
| `GET` | `/api/strategic/branch-performance` | Şube verimlilik puanları ve öneriler. |
| `GET` | `/api/strategic/location-analysis` | İlçe bazlı fırsat ve doygunluk analizi. |
| `GET` | `/api/strategic/trend-analysis` | Yükselen ve düşen kategoriler. |

### Kimlik Doğrulama
| Metot | Endpoint | Açıklama |
| :--- | :--- | :--- |
| `POST` | `/api/login` | Yönetici girişi. |