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
NUM_TRANSACTIONS = 15000 
START_DATE = datetime(2023, 1, 1) 
END_DATE = datetime(2024, 12, 31) 
DATE_RANGE = (END_DATE - START_DATE).days

def generate_synthetic_data():
    
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        cursor.execute("SELECT market_id, ilce_id FROM Marketler")
        markets_data = {row[0]: row[1] for row in cursor.fetchall()} 
        
        cursor.execute("SELECT urun_id, kategori_id FROM Urunler")
        products_data = {row[0]: row[1] for row in cursor.fetchall()} 

        manisa_ilce_id = 5 # Manisa Merkez ilçe ID'si
        
    except mysql.connector.Error as err:
        print(f"Veritabanı bağlantı hatası: {err}")
        return None, None
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

    market_ids = list(markets_data.keys())
    product_ids = list(products_data.keys())

    sales_list = []
    detail_list = []
    current_satis_id = 1

    print("Satış işlemleri üretiliyor...")
    
    for _ in tqdm(range(NUM_TRANSACTIONS)):
        random_days = np.random.randint(0, DATE_RANGE)
        transaction_date = START_DATE + timedelta(days=random_days, hours=np.random.randint(8, 22), minutes=np.random.randint(0, 60))
        selected_market_id = np.random.choice(market_ids)
        selected_ilce_id = markets_data[selected_market_id]

        # Bölgesel Simülasyon (Manisa'da daha küçük sepet)
        if selected_ilce_id == manisa_ilce_id:
            num_items = np.random.randint(1, 4) 
            base_price_factor = 0.95 
        else:
            num_items = np.random.randint(2, 6)
            base_price_factor = 1.0 

        # Mevsimsellik (Yaz aylarında Meyve/Sebze satışlarını artır)
        if transaction_date.month in [6, 7, 8]:
            fruit_veg_boost = 1.5 
        else:
            fruit_veg_boost = 1.0

        total_tutar = 0
        total_adet = 0
        
        for item_index in range(num_items):
            selected_product_id = np.random.choice(product_ids)
            
            # Adet ve Fiyat Belirleme
            if products_data[selected_product_id] == 3: # Meyve/Sebze ise
                adet = round(np.random.uniform(0.5, 3.5) * fruit_veg_boost, 2)
            else:
                adet = np.random.randint(1, 5)
            
            base_price = np.random.uniform(10, 200) * base_price_factor
            birim_fiyat = round(max(0.01, base_price + (np.random.normal(0, 5))), 2)
            
            item_tutar = round(adet * birim_fiyat, 2)
            total_tutar += item_tutar
            total_adet += adet 

            # SATIS DETAY kaydı
            detail_list.append((
                current_satis_id,
                selected_product_id,
                adet,
                birim_fiyat
            ))
        # Sepet Detaylarını Üretme
        total_tutar = 0
        # ... (Tüm loop'lar ve item_tutar hesaplamaları)

        # SATISLAR kaydı (Header)
        sales_list.append((
            selected_market_id,
            round(max(0, total_tutar), 2), # YENİ HALİ: total_tutar negatifse 0 yap
            transaction_date.strftime('%Y-%m-%d %H:%M:%S'), 
            int(total_adet)
        ))
        # SATISLAR kaydı (Header)
        sales_list.append((
            selected_market_id,
            round(total_tutar, 2),
            transaction_date.strftime('%Y-%m-%d %H:%M:%S'), 
            int(total_adet)
        ))
        
        current_satis_id += 1
        
    sales_df = pd.DataFrame(sales_list, columns=['market_id', 'tutar', 'tarih', 'toplam_adet'])
    detail_df = pd.DataFrame(detail_list, columns=['satis_id', 'urun_id', 'adet', 'birim_fiyat'])

    return sales_df, detail_df

def write_to_sql(sales_df, detail_df):
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # 1. SATISLAR Tablosuna Yükleme
        print("\n[1/2] SATISLAR tablosuna yükleniyor...")
        sales_cols = ['market_id', 'tutar', 'tarih', 'toplam_adet']
        sales_insert_query = f"INSERT INTO Satislar ({', '.join(sales_cols)}) VALUES (%s, %s, %s, %s)"
        sales_records = [tuple(row) for row in sales_df[sales_cols].values]
        cursor.executemany(sales_insert_query, sales_records)
        conn.commit()
        print(f"  -> {len(sales_records)} adet SATISLAR kaydı başarıyla eklendi.")


        # 2. SATIS DETAY Tablosuna Yükleme
        print("[2/2] SATIS DETAY tablosuna yükleniyor...")
        detail_cols = ['satis_id', 'urun_id', 'adet', 'birim_fiyat']
        
        
        detail_insert_query = f"INSERT INTO SatisDetay ({', '.join(detail_cols)}) VALUES (%s, %s, %s, %s)"
        
        detail_records = [tuple(row) for row in detail_df[detail_cols].values]
        cursor.executemany(detail_insert_query, detail_records)
        conn.commit()
        print(f"  -> {len(detail_records)} adet SATIS DETAY kaydı başarıyla eklendi.")

    except mysql.connector.Error as err:
        print(f"Veri yükleme sırasında SQL hatası: {err}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    sales_df, detail_df = generate_synthetic_data()
    if sales_df is not None:
        write_to_sql(sales_df, detail_df)
        print("\nVeritabanı yüklemesi tamamlandı!.")