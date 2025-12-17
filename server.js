const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// HTML dosyalarını sunmak için 'public' klasörünü statik yapıyoruz
app.use(express.static(path.join(__dirname, 'public')));

// VERİTABANI BAĞLANTISI
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Şifren varsa buraya yaz
    database: 'alternatif_market_kds'
});

db.connect((err) => {
    if (err) throw err;
    console.log('Veritabanına başarıyla bağlanıldı!');
});

// 1. GİRİŞ YAPMA API'Sİ (LOGIN)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM Yoneticiler WHERE kullanici_adi = ? AND sifre = ?";
    
    db.query(sql, [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        
        if (results.length > 0) {
            res.json({ success: true, message: 'Giriş Başarılı!', user: results[0].ad_soyad });
        } else {
            res.json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
        }
    });
});

// 2. RAPOR ÇEKME API'Sİ (En Çok Satış Yapan Marketler)
app.get('/api/rapor-market', (req, res) => {
    const sql = `
        SELECT m.market_ad, SUM(s.tutar) as toplam_ciro 
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        GROUP BY m.market_ad
        ORDER BY toplam_ciro DESC
        LIMIT 5
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// Ana sayfa yönlendirmesi
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(3000, () => {
    console.log('Sunucu çalışıyor: http://localhost:3000');
});