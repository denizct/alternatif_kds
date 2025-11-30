-- MySQL CREATE TABLE Komutları (Güncel ve Normalleştirilmiş)

-- 1. SEHIRLER TABLOSU
CREATE TABLE Sehirler (
    sehir_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sehir_ad VARCHAR(50) NOT NULL UNIQUE
);

-- 2. ILCELER TABLOSU
CREATE TABLE Ilceler (
    ilce_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ilce_ad VARCHAR(100) NOT NULL,
    sehir_id INT NOT NULL,
    FOREIGN KEY (sehir_id) REFERENCES Sehirler (sehir_id)
);

-- 3. KATEGORILER TABLOSU (NORMALLEŞTİRİLDİ)
CREATE TABLE Kategoriler (
    kategori_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kategori_ad VARCHAR(50) NOT NULL UNIQUE
);

-- 4. URUNLER TABLOSU (GÜNCELLENDİ)
CREATE TABLE Urunler (
    urun_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    urun_ad VARCHAR(100) NOT NULL,
    kategori_id INT NOT NULL,
    FOREIGN KEY (kategori_id) REFERENCES Kategoriler (kategori_id)
);

-- 5. MARKETLER TABLOSU (Şubeler)
CREATE TABLE Marketler (
    market_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    market_ad VARCHAR(100) NOT NULL,
    acilis_tarihi DATE NOT NULL,
    ilce_id INT NOT NULL,
    FOREIGN KEY (ilce_id) REFERENCES Ilceler (ilce_id)
);

-- 6. SATISLAR TABLOSU (Ana İşlem Başlığı)
CREATE TABLE Satislar (
    satis_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    market_id INT NOT NULL,
    tutar DECIMAL(10, 2) NOT NULL CHECK (tutar >= 0),
    tarih DATETIME NOT NULL,
    toplam_adet INT NOT NULL CHECK (toplam_adet >= 0),
    FOREIGN KEY (market_id) REFERENCES Marketler (market_id)
);

-- 7. SATIS DETAY TABLOSU (Her bir ürün satırının detayı)
CREATE TABLE SatisDetay (
    satis_detay_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    satis_id BIGINT NOT NULL,
    urun_id INT NOT NULL,
    adet INT NOT NULL CHECK (adet > 0),
    birim_fiyat DECIMAL(10, 2) NOT NULL CHECK (birim_fiyat >= 0),
    FOREIGN KEY (satis_id) REFERENCES Satislar (satis_id),
    FOREIGN KEY (urun_id) REFERENCES Urunler (urun_id)
);