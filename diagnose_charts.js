const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'alternatif_market_kds'
});

db.connect();

// Helper to simulate the query conditions from server.js
// Defaults: ay=12 (Last 12 months), sehir_id=all, market_id=all
const whereSql = "WHERE s.tarih >= DATE_SUB(NOW(), INTERVAL 12 MONTH)";

const queries = [
    {
        name: "Branch Breakdown (Marketler)",
        sql: `
            SELECT m.market_ad, SUM(s.tutar) as ciro 
            FROM Satislar s
            JOIN Marketler m ON s.market_id = m.market_id
            ${whereSql}
            GROUP BY m.market_ad
            ORDER BY ciro DESC
        `
    },
    {
        name: "City Breakdown (Sehirler)",
        sql: `
            SELECT sehir.sehir_ad, SUM(s.tutar) as ciro 
            FROM Satislar s
            JOIN Marketler m ON s.market_id = m.market_id
            JOIN Ilceler ilce ON m.ilce_id = ilce.ilce_id
            JOIN Sehirler sehir ON ilce.sehir_id = sehir.sehir_id
            ${whereSql}
            GROUP BY sehir.sehir_ad
            ORDER BY ciro DESC
        `
    }
];

async function runDiagnostics() {
    console.log("Starting Diagnostics...");
    
    for (const q of queries) {
        console.log(`\n--- checking: ${q.name} ---`);
        try {
            const [rows] = await db.promise().query(q.sql);
            console.log(`Row Count: ${rows.length}`);
            if (rows.length > 0) {
                console.log("First 3 rows:", rows.slice(0, 3));
                // Check data types
                const firstRow = rows[0];
                console.log("Data Types:", {
                    name_type: typeof firstRow[Object.keys(firstRow)[0]],
                    ciro_type: typeof firstRow.ciro
                });
            } else {
                console.log("WARNING: No data returned!");
            }
        } catch (err) {
            console.error("ERROR executing query:", err.message);
        }
    }
    db.end();
}

runDiagnostics();
