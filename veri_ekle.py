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
NUM_TRANSACTIONS = 5000  # İşlem sayısı - DÜŞÜRÜLDÜ
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
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
        cursor.execute("TRUNCATE TABLE satisdetay;")
        cursor.execute("TRUNCATE TABLE satislar;")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")
        conn.commit()

        # 2. VERİLERİ ÇEK
        cursor.execute("SELECT market_id, ilce_id FROM Marketler")
        # Store as list of tuples for easier processing
        all_markets = cursor.fetchall() # [(id, ilce_id), ...]
        
        cursor.execute("SELECT urun_id, kategori_id FROM Urunler")
        products_data = {row[0]: row[1] for row in cursor.fetchall()} 
        
        if not all_markets or not products_data:
            print("HATA: Marketler veya Ürünler tablosu boş!")
            return None, None

    except mysql.connector.Error as err:
        print(f"Veritabanı bağlantı hatası: {err}")
        return None, None
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

    market_ids = [m[0] for m in all_markets]
    product_ids = list(products_data.keys())
    
    # --- STRATEJİK SENARYO AYARLARI ---
    # 1. İlçe Bazlı Fırsatlar (Opportunity Zones)
    # Rastgele 2 ilçe seç ve buraları "Potansiyeli Yüksek" yap (Çok satış, yüksek ciro)
    unique_districts = list(set([m[1] for m in all_markets]))
    opportunity_districts = []
    if len(unique_districts) > 2:
        opportunity_districts = np.random.choice(unique_districts, 2, replace=False)
    
    print(f"Fırsat İlçeleri (Opportunity Zones): {opportunity_districts}")

    # 2. Şube Performansları (Risk vs Star)
    # Her markete bir "ağırlık" (probabilty weight) ata.
    market_weights = {}
    
    # Grupları ayır
    num_markets = len(market_ids)
    risky_count = int(num_markets * 0.2) # %20 Riskli
    star_count = int(num_markets * 0.2)  # %20 Yıldız
    
    # Rastgele karıştır
    shuffled_markets = np.random.permutation(all_markets)
    
    risky_markets = [m[0] for m in shuffled_markets[:risky_count]]
    star_markets = [m[0] for m in shuffled_markets[risky_count:risky_count+star_count]]
    # Kalanlar normal

    # Ağırlıkları belirle
    prob_weights = []
    
    for market in all_markets:
        m_id = market[0]
        ilce_id = market[1]
        
        weight = 1.0 # Normal
        
        # Riskli ise az satış
        if m_id in risky_markets:
            weight = 0.4
            
        # Yıldız ise çok satış
        if m_id in star_markets:
            weight = 1.8
            
        # EĞER Fırsat İlçesindeyse market -> EKSTRA BOOST (Konum analizi için)
        if ilce_id in opportunity_districts:
            weight *= 2.5 # Çok ciddi trafik var ama market sayısı az olabilir -> ortalama ciro fırlar
        
        market_weights[m_id] = weight
        prob_weights.append(weight)

    # Olasılıkları normalize et (toplamı 1 olsun)
    prob_weights = np.array(prob_weights)
    prob_weights /= prob_weights.sum()

    print(f"Riskli Marketler: {risky_markets}")
    print(f"Yıldız Marketler: {star_markets}")

    sales_list = []
    detail_list = []
    current_satis_id = 1

    print(f"{NUM_TRANSACTIONS} adet satış işlemi üretiliyor...")
    
    # --- VERİ ÜRETİM DÖNGÜSÜ ---
    # Market seçimini önceden yap (Vektörize seçim daha hızlıdır ama döngü içinde kalalım şimdilik)
    # Olasılık dağılımına göre market ID'leri seç
    chosen_market_indices = np.random.choice(len(all_markets), NUM_TRANSACTIONS, p=prob_weights)
    
    for i in tqdm(range(NUM_TRANSACTIONS)):
        random_days = np.random.randint(0, DATE_RANGE)
        transaction_date = START_DATE + timedelta(days=random_days, hours=np.random.randint(8, 22), minutes=np.random.randint(0, 60))
        
        # Seçilen market
        market_idx = chosen_market_indices[i]
        selected_market_id = all_markets[market_idx][0]
        
        # Sepet büyüklüğü (Adet) - Bazı sepetler tek ürün, bazıları çok
        # Genelde 1-5 arası, ağırlık 1-3'te
        num_items = np.random.choice([1, 2, 3, 4, 5, 6], p=[0.3, 0.3, 0.2, 0.1, 0.05, 0.05])
        
        total_tutar = 0
        total_adet = 0
        
        for _ in range(num_items):
            selected_product_id = np.random.choice(product_ids)
            cat_id = products_data[selected_product_id]

            # Rastgelelik
            adet = np.random.randint(1, 4) # 1, 2, 3
            
            # Fiyat
            base_price = np.random.uniform(20, 200) 
            birim_fiyat = round(base_price, 2)
            
            item_tutar = round(adet * birim_fiyat, 2)
            
            total_tutar += item_tutar
            total_adet += adet 

            detail_list.append((
                current_satis_id,
                selected_product_id,
                adet,
                birim_fiyat
            ))

        sales_list.append((
            current_satis_id,
            selected_market_id,
            round(total_tutar, 2),
            transaction_date.strftime('%Y-%m-%d %H:%M:%S'), 
            int(total_adet)
        ))
        
        current_satis_id += 1
        
    sales_df = pd.DataFrame(sales_list, columns=['satis_id', 'market_id', 'tutar', 'tarih', 'toplam_adet'])
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