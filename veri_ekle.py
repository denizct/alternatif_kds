import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import mysql.connector
from tqdm import tqdm 

# --- VERİTABANI BAĞLANTI AYARLARI ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root', 
    'password': '',
    'database': 'alternatif_market_kds'
}

# --- SİMÜLASYON AYARLARI ---
NUM_TRANSACTIONS = 15000  # İşlem sayısı
START_DATE = datetime(2024, 1, 1) 
END_DATE = datetime(2026, 6, 1) 
DATE_RANGE = (END_DATE - START_DATE).days

def generate_synthetic_data():
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # 1. TEMİZLİK (Tabloları sıfırla)
        print("Tablolar temizleniyor (TRUNCATE)...")
        # Foreign key hatası almamak için kontrolü kapatıp siliyoruz
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
        cursor.execute("TRUNCATE TABLE satisdetay;") # Küçük harf düzeltildi
        cursor.execute("TRUNCATE TABLE satislar;")   # Küçük harf düzeltildi
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")
        conn.commit()

        # 2. VERİLERİ ÇEK (Market ve Ürünler)
        cursor.execute("SELECT market_id, ilce_id FROM Marketler")
        markets_data = {row[0]: row[1] for row in cursor.fetchall()} 
        
        cursor.execute("SELECT urun_id, kategori_id FROM Urunler")
        products_data = {row[0]: row[1] for row in cursor.fetchall()} 
        
        if not markets_data or not products_data:
            print("HATA: Marketler veya Ürünler tablosu boş!")
            return None, None

    except mysql.connector.Error as err:
        print(f"Veritabanı bağlantı hatası: {err}")
        return None, None
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

    market_ids = list(markets_data.keys())
    product_ids = list(products_data.keys())
    manisa_ilce_id = 5 

    sales_list = []
    detail_list = []
    current_satis_id = 1

    print(f"{NUM_TRANSACTIONS} adet satış işlemi üretiliyor...")
    
    # --- VERİ ÜRETİM DÖNGÜSÜ ---
    for _ in tqdm(range(NUM_TRANSACTIONS)):
        random_days = np.random.randint(0, DATE_RANGE)
        transaction_date = START_DATE + timedelta(days=random_days, hours=np.random.randint(8, 22), minutes=np.random.randint(0, 60))
        
        selected_market_id = np.random.choice(market_ids)
        selected_ilce_id = markets_data[selected_market_id]

        # Fiyat politikası (Manisa ucuz, Yazın manav ucuz vs.)
        base_price_factor = 0.95 if selected_ilce_id == manisa_ilce_id else 1.05
        is_summer = transaction_date.month in [6, 7, 8]
        
        num_items = np.random.randint(1, 8) 
        
        total_tutar = 0
        total_adet = 0
        
        for _ in range(num_items):
            selected_product_id = np.random.choice(product_ids)
            cat_id = products_data[selected_product_id]

            season_factor = 1.0
            if cat_id == 3: # Manav
                season_factor = 0.8 if is_summer else 1.3
            
            adet = np.random.randint(1, 5)
            
            # Fiyat hesapla (Negatif yok)
            base_price = np.random.uniform(10, 150) * base_price_factor * season_factor
            birim_fiyat = round(max(0.50, base_price + np.random.normal(0, 2)), 2)
            
            item_tutar = round(adet * birim_fiyat, 2)
            total_tutar += item_tutar
            total_adet += adet 

            # Detay tablosu için veri (satis_detay_id YOK, DB verecek)
            detail_list.append((
                current_satis_id,
                selected_product_id,
                adet,
                birim_fiyat
            ))

        # Satış tablosu için veri (Header)
        # DİKKAT: Sütun sırası DataFrame ile aynı olmalı
        sales_list.append((
            current_satis_id,
            selected_market_id,
            round(total_tutar, 2),
            transaction_date.strftime('%Y-%m-%d %H:%M:%S'), 
            int(total_adet)
        ))
        
        current_satis_id += 1
        
    # DataFrame oluştur
    # Satislar tablosundaki sütun adlarına tam uyumlu: 'tutar'
    sales_df = pd.DataFrame(sales_list, columns=['satis_id', 'market_id', 'tutar', 'tarih', 'toplam_adet'])
    
    # SatisDetay tablosu: 'satis_detay_id' otomatik olduğu için buraya eklemiyoruz.
    detail_df = pd.DataFrame(detail_list, columns=['satis_id', 'urun_id', 'adet', 'birim_fiyat'])

    return sales_df, detail_df

def write_to_sql(sales_df, detail_df):
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # 1. SATISLAR YÜKLEME
        print("\n[1/2] SATISLAR tablosuna yükleniyor...")
        # 'toplam_tutar' yerine 'tutar' yazıldı.
        sales_query = "INSERT INTO satislar (satis_id, market_id, tutar, tarih, toplam_adet) VALUES (%s, %s, %s, %s, %s)"
        
        chunk_size = 5000
        sales_records = [tuple(row) for row in sales_df.values]
        
        for i in range(0, len(sales_records), chunk_size):
            cursor.executemany(sales_query, sales_records[i:i+chunk_size])
            conn.commit()
            print(f"   -> {i + len(sales_records[i:i+chunk_size])} / {len(sales_records)} kayıt işlendi.")

        # 2. SATIS DETAY YÜKLEME
        print("[2/2] SATIS DETAY tablosuna yükleniyor...")
        # satis_detay_id listede yok, otomatik artacak.
        detail_query = "INSERT INTO satisdetay (satis_id, urun_id, adet, birim_fiyat) VALUES (%s, %s, %s, %s)"
        
        detail_records = [tuple(row) for row in detail_df.values]
        
        for i in range(0, len(detail_records), chunk_size):
            cursor.executemany(detail_query, detail_records[i:i+chunk_size])
            conn.commit()
            print(f"   -> {i + len(detail_records[i:i+chunk_size])} / {len(detail_records)} detay işlendi.")

    except mysql.connector.Error as err:
        print(f"SQL Yükleme Hatası: {err}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    sales_df, detail_df = generate_synthetic_data()
    if sales_df is not None:
        write_to_sql(sales_df, detail_df)
        print("\nVeritabanı yüklemesi bitti! Geçmiş olsun.")