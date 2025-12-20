const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'alternatif_market_kds'
});

db.connect();

db.query("SELECT * FROM Yoneticiler", (err, results) => {
    if (err) {
        console.error(err);
    } else {
        console.log("Users in DB:", results);
    }
    db.end();
});
