
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'alternatif_market_kds'
});

db.connect();

const queries = [
    "SELECT NOW() as current_db_time",
    "SELECT COUNT(*) as total_sales FROM Satislar",
    "SELECT MIN(tarih) as first_sale, MAX(tarih) as last_sale FROM Satislar",
    "SELECT market_id, COUNT(*) FROM Satislar GROUP BY market_id LIMIT 5",
    "SELECT * FROM Satislar WHERE tarih >= DATE_SUB(NOW(), INTERVAL 12 MONTH) LIMIT 5",
    // Test the breakdown query specifically
    `SELECT sehir.sehir_ad, SUM(s.tutar) as ciro 
     FROM Satislar s
     JOIN Marketler m ON s.market_id = m.market_id
     JOIN Ilceler ilce ON m.ilce_id = ilce.ilce_id
     JOIN Sehirler sehir ON ilce.sehir_id = sehir.sehir_id
     WHERE s.tarih >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
     GROUP BY sehir.sehir_ad`
];

async function runDebug() {
    for (const q of queries) {
        console.log(`\n--- QUERY: ${q} ---`);
        try {
            const [rows] = await db.promise().query(q);
            console.log(rows);
        } catch (err) {
            console.error("ERROR:", err.message);
        }
    }
    db.end();
}

runDebug();
