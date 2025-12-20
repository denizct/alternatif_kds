import mysql.connector

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'alternatif_market_kds'
}

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor()
cursor.execute("DESCRIBE Urunler")
print("URUNLER columns:")
for row in cursor.fetchall():
    print(row)

cursor.close()
conn.close()
