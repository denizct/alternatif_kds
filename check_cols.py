import mysql.connector

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'alternatif_market_kds'
}

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor()
cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='alternatif_market_kds' AND table_name='Urunler'")
print("URUNLER columns:")
for row in cursor.fetchall():
    print(row[0])

cursor.close()
conn.close()
