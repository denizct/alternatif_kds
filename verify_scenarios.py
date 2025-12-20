import mysql.connector
import pandas as pd

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'alternatif_market_kds'
}

def verify():
    conn = mysql.connector.connect(**DB_CONFIG)
    
    # 1. Check Market 11 Trend (Last 12 Months)
    print("--- SCENARIO 1: Market 11 Trend ---")
    query1 = """
        SELECT DATE_FORMAT(tarih, '%Y-%m') as ay, COUNT(*) as satis_adedi
        FROM Satislar 
        WHERE market_id = 11 AND tarih >= '2025-01-01'
        GROUP BY ay ORDER BY ay
    """
    df1 = pd.read_sql(query1, conn)
    print(df1)
    
    # 2. Check Basket Size (Market 3 vs Global)
    print("\n--- SCENARIO 2: Basket Size (Market 3 vs Avg) ---")
    query2 = """
        SELECT 
            CASE WHEN market_id = 3 THEN 'Market 3 (Bostanlı)' ELSE 'Diğer' END as grup,
            AVG(toplam_adet) as ort_sepet_adedi,
            AVG(tutar) as ort_sepet_tutari
        FROM Satislar
        GROUP BY grup
    """
    df2 = pd.read_sql(query2, conn)
    print(df2)

    # 3. Seasonal Fruit Sales (Summer vs Winter)
    print("\n--- SCENARIO 3: Seasonality (Meyve/Sebze) ---")
    # Need to check category ID for Meyve/Sebze first, or join
    query3 = """
        SELECT 
            CASE WHEN MONTH(s.tarih) IN (6,7,8) THEN 'Yaz' ELSE 'Kış' END as mevsim,
            SUM(sd.adet) as toplam_adet
        FROM SatisDetay sd
        JOIN Satislar s ON sd.satis_id = s.satis_id
        JOIN Urunler u ON sd.urun_id = u.urun_id
        JOIN Kategoriler k ON u.kategori_id = k.kategori_id
        WHERE k.kategori_ad = 'Meyve/Sebze'
        GROUP BY mevsim
    """
    df3 = pd.read_sql(query3, conn)
    print(df3)

    conn.close()

if __name__ == "__main__":
    verify()
