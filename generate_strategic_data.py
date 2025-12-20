import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import mysql.connector
from tqdm import tqdm

# --- CONFIG ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'alternatif_market_kds'
}

NUM_TRANSACTIONS = 20000
START_DATE = datetime(2023, 1, 1)
END_DATE = datetime(2025, 12, 31)
DATE_RANGE_DAYS = (END_DATE - START_DATE).days

def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)

def fetch_metadata():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # 1. Markets
    cursor.execute("SELECT market_id, market_ad, ilce_id, (SELECT sehir_id FROM Ilceler WHERE ilce_id = Marketler.ilce_id) as sehir_id FROM Marketler")
    markets = {row['market_id']: row for row in cursor.fetchall()}
    
    # 2. Categories (Map Name -> ID)
    cursor.execute("SELECT kategori_id, kategori_ad FROM Kategoriler")
    categories = {row['kategori_ad']: row['kategori_id'] for row in cursor.fetchall()}
    
    # 3. Products (Map ID -> Category ID, and Name -> ID for specific products)
    cursor.execute("SELECT urun_id, urun_ad, kategori_id FROM Urunler")
    products = cursor.fetchall()
    
    # Generate stable random base prices since DB has no price column
    product_map = {}
    for row in products:
        base_price = np.random.uniform(20, 200) # Random base price
        product_map[row['urun_id']] = {
            'cat': row['kategori_id'], 
            'price': float(base_price), 
            'name': row['urun_ad']
        }
    
    # Helper to find specific product IDs by name match
    def find_prod_id(name_partial):
        for pid, data in product_map.items():
            if name_partial.lower() in data['name'].lower():
                return pid
        return None

    special_product_ids = {
        'muz': find_prod_id('Muz'),
        'ekmek': find_prod_id('Ekmek'),
        'un': find_prod_id('Un')
    }
    
    cursor.close()
    conn.close()
    return markets, categories, product_map, special_product_ids

def generate_data():
    markets, categories, product_map, special_prod_ids = fetch_metadata()
    
    # Category IDs for logic
    cat_temizlik = categories.get('Temizlik')
    cat_temel_gida = categories.get('Temel Gıda')
    cat_kisisel = categories.get('Kişisel Bakım')
    cat_atistirmalik = categories.get('Atıştırmalık')
    cat_meyve_sebze = categories.get('Meyve/Sebze')

    # Group Products by Category for faster sampling
    products_by_cat = {}
    for pid, data in product_map.items():
        cid = data['cat']
        if cid not in products_by_cat: products_by_cat[cid] = []
        products_by_cat[cid].append(pid)

    all_product_ids = list(product_map.keys())
    market_ids = list(markets.keys())

    sales_list = []
    detail_list = []
    current_satis_id = 1
    
    print(f"Generating {NUM_TRANSACTIONS} transactions...")
    
    db_conn = get_db_connection()
    cursor = db_conn.cursor()
    # TRUNCATE
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    cursor.execute("TRUNCATE TABLE satislar")
    cursor.execute("TRUNCATE TABLE satisdetay")
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    db_conn.commit()
    cursor.close()
    db_conn.close()

    for _ in tqdm(range(NUM_TRANSACTIONS)):
        # 1. Random Date
        d_offset = np.random.randint(0, DATE_RANGE_DAYS)
        t_date = START_DATE + timedelta(days=float(d_offset))
        # Add random time (08:00 - 22:00)
        t_date = t_date.replace(hour=np.random.randint(8, 22), minute=np.random.randint(0, 60))
        
        # 2. Pick Market
        # Weights? Assume uniform for now, but scenarios might imply traffic.
        m_id = np.random.choice(market_ids)
        market_info = markets[m_id]
        
        # --- SCENARIO 1: Riskli Şube (Market 11 - Manisa Merkez 3) ---
        # "Son 8 aydır %5 düşüş" -> Reduce probability of transaction occurrence? 
        # Since we are iterating loop N times and picking market, we can just reject/skip this iteration 
        # based on probability, OR reduce basket size/value. 
        # User said "Sales declining", could mean count or volume. Let's reduce Count.
        
        if m_id == 11:
            months_from_now = (END_DATE - t_date).days / 30
            if months_from_now < 8:
                # Closer to present = fewer sales.
                # 8 months ago = 1.0 factor. Now = 0.6 factor (approx 5% per month compounded or linear)
                # Let's say drop is linear 5% per month. 
                # decline_months = 8 - months_from_now (0 to 8)
                decline_months = 8 - months_from_now
                drop_prob = decline_months * 0.05
                if np.random.random() < drop_prob:
                    continue # SKIP transaction (Sale declined)

        # --- Base Basket Settings ---
        num_items = np.random.randint(1, 8) 
        
        # --- SCENARIO 2: Yüksek Potansiyelli (Market 2, 3) ---
        if m_id in [2, 3]:
            # "Sepet ortalamasını 2 katına çıkar" -> increase items count
            num_items = np.random.randint(5, 15) 

        total_tutar = 0
        total_adet = 0
        
        # Basket Items Loop
        for _ in range(num_items):
            # Select Product Logic
            p_id = None
            
            # --- SCENARIO 1 Skew: Market 11 ---
            if m_id == 11 and np.random.random() < 0.7: # 70% bias logic
                # "Temizlik" near zero, "Temel Gıda" high
                if np.random.random() < 0.9: 
                    # Pick Temel Gıda
                    if cat_temel_gida and products_by_cat.get(cat_temel_gida):
                        p_id = np.random.choice(products_by_cat[cat_temel_gida])
                else:
                    # Avoid Temizlik
                    valid_cats = [c for c in products_by_cat.keys() if c != cat_temizlik]
                    if valid_cats:
                        rand_cat = np.random.choice(valid_cats)
                        p_id = np.random.choice(products_by_cat[rand_cat])
            
            # --- SCENARIO 2 Skew: Market 2, 3 (Bostanlı, Çiğli) ---
            elif m_id in [2, 3] and np.random.random() < 0.6: # 60% bias
                # "Kişisel Bakım" + "Atıştırmalık" = 40% of revenue approx (via frequency)
                target_cats = []
                if cat_kisisel: target_cats.append(cat_kisisel)
                if cat_atistirmalik: target_cats.append(cat_atistirmalik)
                
                if target_cats and np.random.random() < 0.7: # High chance for these
                    rand_cat = np.random.choice(target_cats)
                    if products_by_cat.get(rand_cat):
                        p_id = np.random.choice(products_by_cat[rand_cat])

            # Default Selection if no specific skew applied
            if p_id is None:
                p_id = np.random.choice(all_product_ids)
            
            # --- SCENARIO 3: "Muz Kg" Logic ---
            # Bostanlı (3) sells a lot, others dead stock
            if special_prod_ids.get('muz') == p_id:
                if m_id == 3:
                     # Boost chance - keep it
                     pass
                else:
                    # "Ölü stok" - highly likely to reject this item and pick another
                    if np.random.random() < 0.9: # 90% reject
                        p_id = np.random.choice(all_product_ids) # Re-roll once
            
            prod_info = product_map[p_id]
            
            # --- SCENARIO 3: Seasonality (Meyve/Sebze) ---
            season_multiplier = 1.0
            if prod_info['cat'] == cat_meyve_sebze:
                month = t_date.month
                is_summer = month in [6, 7, 8]
                is_winter = month in [12, 1, 2]
                
                if is_summer:
                    season_multiplier = 2.0 # Boom
                elif is_winter:
                    # Izmir (e.g., 35 code, but here markets 1-10 are Izmir usually?) 
                    # Let's assume sehir_id for Manisa is different.
                    # Manisa Markets: 11, 12, ... (We need to check metadata)
                    # From prompt: 11 is Manisa. 2,3 is Izmir.
                    
                    # NOTE: market_info['sehir_id'] tells us city.
                    # Assume Izmir ID vs Manisa ID.
                    # Usually 35 is Izmir, 45 is Manisa.
                    # If we don't know IDs, we can deduce from market_id logic in prompt.
                    # Let's use simple logic: If market_id >= 11 (Manisa based on prompt), Low sales.
                    # If market_id < 11 (Izmir), High sales.
                    if m_id >= 11: 
                        season_multiplier = 0.2 # Low in Manisa
                    else:
                        season_multiplier = 1.5 # High in Izmir
            
            # Calculate Price & Amount
            base_price = prod_info['price']
            # Add some variance
            final_price = max(0.5, base_price * np.random.normal(1.0, 0.1))
            
            qty = np.random.randint(1, 5)
            # Boost qty for fruit/veg in summer
            if season_multiplier > 1.5:
                qty = np.random.randint(3, 10)
            
            # Apply seasonality to count/price volume implicitly by count
            qty = int(qty * season_multiplier if season_multiplier < 1 else qty)
            if qty < 1: qty = 1
            
            line_total = qty * final_price
            
            total_tutar += line_total
            total_adet += qty
            
            detail_list.append((
                int(current_satis_id),
                int(p_id),
                int(qty),
                float(round(final_price, 2))
            ))
        
        # Add Header
        if total_adet > 0: # Only add if basket not empty
            sales_list.append((
                int(current_satis_id),
                int(m_id),
                float(round(total_tutar, 2)),
                t_date.strftime('%Y-%m-%d %H:%M:%S'),
                int(total_adet)
            ))
            current_satis_id += 1
            
    # BULK INSERT
    print("Writing to DB...")
    
    # 1. Sales
    chunk_size = 5000
    conn = get_db_connection()
    cursor = conn.cursor()
    
    q_sales = "INSERT INTO satislar (satis_id, market_id, tutar, tarih, toplam_adet) VALUES (%s, %s, %s, %s, %s)"
    for i in range(0, len(sales_list), chunk_size):
        batch = sales_list[i:i+chunk_size]
        cursor.executemany(q_sales, batch)
        conn.commit()
    
    print(f"Sales inserted: {len(sales_list)}")
    
    # 2. Details
    q_details = "INSERT INTO satisdetay (satis_id, urun_id, adet, birim_fiyat) VALUES (%s, %s, %s, %s)"
    for i in range(0, len(detail_list), chunk_size):
        batch = detail_list[i:i+chunk_size]
        cursor.executemany(q_details, batch)
        conn.commit()
        
    print(f"Details inserted: {len(detail_list)}")
    
    cursor.close()
    conn.close()
    print("DONE.")

if __name__ == "__main__":
    generate_data()
