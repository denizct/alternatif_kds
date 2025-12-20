const mysql = require('mysql2');

const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'alternatif_market_kds'
});

db.connect((err) => {
    if (err) {
        console.error('Veritabanı bağlantı hatası:', err);
        throw err;
    }
    console.log('Veritabanına başarıyla bağlanıldı!');
});

module.exports = db;
