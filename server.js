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
            res.json({ success: true, message: 'Giriş Başarılı!', user: results[0].ad_soyad || results[0].kullanici_adi });
        } else {
            res.json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
        }
    });
});

// Helper for Date Filtering
function buidDateFilter(period) {
    if (!period || period === 'all') return '';
    if (period.length === 4) return ` AND YEAR(s.tarih) = ${period}`; // 2024, 2025 etc.
    return ` AND s.tarih >= DATE_SUB(NOW(), INTERVAL ${period} MONTH)`; // 6, 9, 12
}

// 2. DASHBOARD İSTATİSTİKLERİ
app.get('/api/dashboard/stats', (req, res) => {
    const { ay } = req.query;
    let dateFilter = buidDateFilter(ay).replace('AND', 'WHERE'); // Fix for first clause
    if (!dateFilter) dateFilter = '';

    const sqlTotal = `
        SELECT 
            SUM(s.tutar) as toplam_ciro, 
            SUM(s.toplam_adet) as toplam_satis_adedi 
        FROM Satislar s
        ${dateFilter}
    `;

    const sqlTopMarket = `
        SELECT m.market_ad, SUM(s.tutar) as ciro
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        ${dateFilter}
        GROUP BY m.market_ad
        ORDER BY ciro DESC
        LIMIT 1
    `;

    db.query(sqlTotal, (err, totalResults) => {
        if (err) return res.status(500).json({ error: err });

        db.query(sqlTopMarket, (err, topMarketResults) => {
            if (err) return res.status(500).json({ error: err });

            const ciro = totalResults[0].toplam_ciro || 0;
            const kar = ciro * 0.25;

            res.json({
                toplam_ciro: ciro,
                toplam_kar: kar,
                toplam_satis_adedi: totalResults[0].toplam_satis_adedi || 0,
                en_iyi_sube: topMarketResults.length > 0 ? topMarketResults[0].market_ad : '-'
            });
        });
    });
});

// 3. FİLTRELER İÇİN VERİ (Şehirler, Marketler, Kategoriler)
app.get('/api/filters', (req, res) => {
    const sqlCities = "SELECT sehir_id, sehir_ad FROM Sehirler";
    const sqlMarkets = "SELECT market_id, market_ad, sehir_id FROM Marketler m JOIN Ilceler i ON m.ilce_id = i.ilce_id";
    const sqlCategories = "SELECT kategori_id, kategori_ad FROM Kategoriler";

    db.query(sqlCities, (err, cities) => {
        if (err) return res.status(500).json({ error: err });
        db.query(sqlMarkets, (err, markets) => {
            if (err) return res.status(500).json({ error: err });
            db.query(sqlCategories, (err, categories) => {
                if (err) return res.status(500).json({ error: err });
                res.json({ cities, markets, categories });
            });
        });
    });
});

// 4. ZAMAN BAZLI SATIŞ GRAFİĞİ
app.get('/api/dashboard/sales-over-time', (req, res) => {
    const { ay, sehir_id, market_id, kategori_id } = req.query;

    let whereClauses = [];
    if (ay) {
        if (ay.length === 4) whereClauses.push(`YEAR(s.tarih) = ${ay}`);
        else if (ay !== 'all') whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`);
    }

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
    if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

    let join = "JOIN Marketler m ON s.market_id = m.market_id";
    if (kategori_id && kategori_id !== 'all') {
        join += " JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id";
        whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sql = `
        SELECT 
            DATE_FORMAT(s.tarih, '%Y-%m') as ay, 
            SUM(s.tutar) as toplam_ciro
        FROM Satislar s
        ${join}
        ${whereSql}
        GROUP BY DATE_FORMAT(s.tarih, '%Y-%m')
        ORDER BY ay ASC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// 5. ŞUBE ve KATEGORİ BAZLI PASTA GRAFİK VERİLERİ
app.get('/api/dashboard/breakdown', (req, res) => {
    const { ay, sehir_id, market_id } = req.query;

    let whereClauses = [];
    if (ay) {
        if (ay.length === 4) whereClauses.push(`YEAR(s.tarih) = ${ay}`);
        else if (ay !== 'all') whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`);
    }

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
    if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Tüm Marketler
    const sqlMarket = `
        SELECT m.market_ad, SUM(s.tutar) as ciro 
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        ${whereSql}
        GROUP BY m.market_ad
        ORDER BY ciro DESC
    `;

    // Kategori Dağılımı
    const sqlCategory = `
        SELECT k.kategori_ad, SUM(sd.adet * sd.birim_fiyat) as ciro
        FROM SatisDetay sd
        JOIN Satislar s ON sd.satis_id = s.satis_id
        JOIN Urunler u ON sd.urun_id = u.urun_id
        JOIN Kategoriler k ON u.kategori_id = k.kategori_id
        JOIN Marketler m ON s.market_id = m.market_id  -- Market join needed for filtering by city/market
        ${whereSql}
        GROUP BY k.kategori_ad
    `;

    // Şehir Bazlı Dağılım
    const sqlCity = `
        SELECT sehir.sehir_ad, SUM(s.tutar) as ciro 
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        JOIN Ilceler ilce ON m.ilce_id = ilce.ilce_id
        JOIN Sehirler sehir ON ilce.sehir_id = sehir.sehir_id
        ${whereSql}
        GROUP BY sehir.sehir_ad
        ORDER BY ciro DESC
    `;

    db.query(sqlMarket, (err, markets) => {
        if (err) return res.status(500).json({ error: err });
        db.query(sqlCategory, (err, categories) => {
            if (err) return res.status(500).json({ error: err });
            db.query(sqlCity, (err, cities) => {
                if (err) return res.status(500).json({ error: err });
                res.json({ markets, categories, cities });
            });
        });
    });
});

// 6. GELECEK TAHMİNİ (FORECAST) API
app.get('/api/dashboard/forecast', (req, res) => {
    // Forecast her zaman geçmiş 12-24 aya bakarak yapılır, 
    // Kullanıcının seçtiği filtreye göre değil, genel trende göre çalışmalı.

    const sqlHistory = `
        SELECT 
            DATE_FORMAT(s.tarih, '%Y-%m') as ay, 
            SUM(s.tutar) as toplam_ciro
        FROM Satislar s
        WHERE s.tarih >= DATE_SUB(NOW(), INTERVAL 24 MONTH) 
        GROUP BY DATE_FORMAT(s.tarih, '%Y-%m')
        ORDER BY ay ASC
    `;

    db.query(sqlHistory, (err, history) => {
        if (err) return res.status(500).json({ error: err });
        if (history.length < 2) return res.json([{ ay: 'Veri Yok', tahmini_ciro: 0 }]);

        // Basit Büyüme Oranı Hesabı
        let lastRevenue = parseFloat(history[history.length - 1].toplam_ciro);
        let avgGrowth = 0.02; // Default %2 büyüme

        let forecastData = [];
        let currentDate = new Date();

        for (let i = 1; i <= 6; i++) { // Gelecek 6 ay
            lastRevenue = lastRevenue * (1 + avgGrowth);
            currentDate.setMonth(currentDate.getMonth() + 1);
            let dateStr = currentDate.toISOString().slice(0, 7);

            forecastData.push({ ay: dateStr, tahmini_ciro: lastRevenue });
        }
        res.json(forecastData);
    });
});

// 7. EN ÇOK SATAN ÜRÜNLER (Top Products)
app.get('/api/dashboard/top-products', (req, res) => {
    const { ay, kategori_id } = req.query;
    let whereClauses = [];

    if (ay) {
        if (ay.length === 4) whereClauses.push(`YEAR(s.tarih) = ${ay}`);
        else if (ay !== 'all') whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`);
    }

    if (kategori_id && kategori_id !== 'all') {
        whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sql = `
        SELECT 
            u.urun_ad, 
            k.kategori_ad,
            SUM(sd.adet) as toplam_adet,
            SUM(sd.adet * sd.birim_fiyat) as toplam_ciro
        FROM SatisDetay sd
        JOIN Satislar s ON sd.satis_id = s.satis_id
        JOIN Urunler u ON sd.urun_id = u.urun_id
        JOIN Kategoriler k ON u.kategori_id = k.kategori_id
        ${whereSql}
        GROUP BY u.urun_id, u.urun_ad, k.kategori_ad
        ORDER BY toplam_ciro DESC
        LIMIT 20
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