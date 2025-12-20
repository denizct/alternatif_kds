import mysql.connector
import random
import sys

# --- CONFIG ---
DB_CONFIG = {
    'host': 'localhost', # Revert to localhost to test
    'user': 'root',
    'password': '',
    'database': 'alternatif_market_kds',
    'connect_timeout': 60 # Increase timeout to 60 seconds
}

def get_db_connection():
    try:
        print("Initiating connection...", flush=True)
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}", flush=True)
        sys.exit(1)

def cleanup_data(percentage=30):
    print(f"Connecting to database at {DB_CONFIG['host']}...")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 1. Get total count
        cursor.execute("SELECT COUNT(*) FROM Satislar")
        total_sales = cursor.fetchone()[0]
        
        if total_sales == 0:
            print("Table 'Satislar' is empty. Nothing to delete.")
            return

        print(f"Total Sales records: {total_sales}")
        
        target_delete_count = int(total_sales * (percentage / 100))
        print(f"Targeting removal of ~{target_delete_count} records ({percentage}%)")

        # 2. Delete logic
        # Deleting randomly can be slow with ORDER BY RAND().
        # Faster approach for bulk delete:
        # Delete records where ID % 10 < 3 (approx 30%) if IDs are sequential.
        # OR just use DELETE ... LIMIT n with random order if dataset isn't huge (20k is small).
        # For 20k-100k records, ORDER BY RAND() LIMIT N is acceptable.
        
        print("Deleting data...")
        
        # We need to delete from Satislar. 
        # If cascading delete is ON, SatisDetay goes automatically.
        # If not, we might error. Let's assume we might need to handle it, 
        # but usually KDS setups might have cascade. 
        # Safest is to specific IDs.
        
        # Select IDs to delete
        cursor.execute(f"SELECT satis_id FROM Satislar ORDER BY RAND() LIMIT {target_delete_count}")
        ids_to_delete = [row[0] for row in cursor.fetchall()]
        
        if not ids_to_delete:
            print("No records selected for deletion.")
            return

        print(f"Selected {len(ids_to_delete)} records for deletion.")
        
        # Delete from SatisDetay first (to be safe against FK constraints without Cascade)
        format_strings = ','.join(['%s'] * len(ids_to_delete))
        
        print("Deleting from SatisDetay...")
        cursor.execute(f"DELETE FROM SatisDetay WHERE satis_id IN ({format_strings})", tuple(ids_to_delete))
        
        print("Deleting from Satislar...")
        cursor.execute(f"DELETE FROM Satislar WHERE satis_id IN ({format_strings})", tuple(ids_to_delete))
        
        conn.commit()
        print(f"Successfully deleted {cursor.rowcount} sales records (and associated details).")
        
        # Verify
        cursor.execute("SELECT COUNT(*) FROM Satislar")
        new_total = cursor.fetchone()[0]
        print(f"New Total Sales records: {new_total}")

    except mysql.connector.Error as err:
        print(f"Database Error: {err}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            pct = int(sys.argv[1])
        except ValueError:
            pct = 30
    else:
        pct = 30
        
    cleanup_data(pct)
