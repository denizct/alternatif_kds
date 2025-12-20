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

    const sqlBestProduct = `
        SELECT u.urun_ad, SUM(sd.adet) as toplam_adet
        FROM SatisDetay sd
        JOIN Satislar s ON sd.satis_id = s.satis_id
        JOIN Urunler u ON sd.urun_id = u.urun_id
        ${dateFilter}
        GROUP BY u.urun_id
        ORDER BY toplam_adet DESC
        LIMIT 1
    `;

    db.query(sqlTotal, (err, totalResults) => {
        if (err) return res.status(500).json({ error: err });

        db.query(sqlTopMarket, (err, topMarketResults) => {
            if (err) return res.status(500).json({ error: err });

            db.query(sqlBestProduct, (err, bestProductResults) => {
                if (err) return res.status(500).json({ error: err });

                const ciro = totalResults[0].toplam_ciro || 0;

                res.json({
                    toplam_ciro: ciro,
                    toplam_satis_adedi: totalResults[0].toplam_satis_adedi || 0,
                    en_iyi_sube: topMarketResults.length > 0 ? topMarketResults[0].market_ad : '-',
                    en_cok_satan_urun: bestProductResults.length > 0 ? bestProductResults[0].urun_ad : '-'
                });
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
        else if (ay !== 'all') {
            whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`);
        }
    }

    // Ensure we don't show future data for historical trends
    whereClauses.push('s.tarih <= NOW()');

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


// 6. GELECEK TAHMİNİ (FORECAST) API - GELİŞMİŞ
// Mantık: Basit Regresyon yerine Mevsimsellik + CAGR (Yıllık Büyüme)
app.get('/api/dashboard/forecast', (req, res) => {
    const { ay, sehir_id, market_id, kategori_id } = req.query;

    let whereClauses = [];
    // For forecast history, we always want 24 months for calculation, 
    // BUT we should filter by city/market/category if selected to give a relevant forecast.

    whereClauses.push("s.tarih >= DATE_SUB(NOW(), INTERVAL 24 MONTH)"); // Fixed requirement for model

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
    if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

    let join = "JOIN Marketler m ON s.market_id = m.market_id";
    if (kategori_id && kategori_id !== 'all') {
        join += " JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id";
        whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sqlHistory = `
        SELECT 
            DATE_FORMAT(s.tarih, '%Y-%m') as ay, 
            SUM(s.tutar) as toplam_ciro
        FROM Satislar s
        ${join}
        ${whereSql}
        GROUP BY DATE_FORMAT(s.tarih, '%Y-%m')
        ORDER BY ay ASC
    `;

    db.query(sqlHistory, (err, history) => {
        if (err) return res.status(500).json({ error: err });

        // Veri yetersizse
        if (history.length < 12) {
            return res.json({
                history: history,
                forecast: [],
                recommendation: "Yeterli veri yok. En az 12 aylık veri gerekli.",
                growthRate: 0
            });
        }

        // 1. CAGR (Yıllık Büyüme Oranı) Hesapla
        // Son 12 ayın cirosu vs Önceki 12 ayın cirosu
        let last12Months = history.slice(-12);
        let previous12Months = history.slice(-24, -12);

        // Eğer 24 ay yoksa, sadece son aylara bakarak basit trend çıkaracağız
        let growthRate = 0.05; // Varsayılan %5

        if (previous12Months.length > 0) {
            const sumLast = last12Months.reduce((a, b) => a + parseFloat(b.toplam_ciro), 0);
            const sumPrev = previous12Months.reduce((a, b) => a + parseFloat(b.toplam_ciro), 0);
            if (sumPrev > 0) growthRate = (sumLast - sumPrev) / sumPrev;
        }

        // 2. Mevsimsellik İndeksi (Basitleştirilmiş)
        // Her ayın önceki yılın aynı ayına göre oranı
        // Biz burada basitçe son yılın trendine büyüme oranını ekleyeceğiz.

        let forecastData = [];
        let currentDate = new Date();
        let formattedHistory = history.map(h => ({ ay: h.ay, ciro: parseFloat(h.toplam_ciro) }));

        let recommendation = "";
        let growthRatePercent = (growthRate * 100).toFixed(1);

        if (growthRate < 0) {
            recommendation = "DİKKAT: Satışlarda yıllık bazda düşüş var. Stok maliyetlerini düşürün ve verimsiz ürünleri temizleyin.";
        } else if (growthRate > 0.20) {
            recommendation = "BÜYÜME: Güçlü büyüme trendi. Stok seviyelerini artırın ve popüler ürünlere kampanya yapın.";
        } else {
            recommendation = "STABİL: Dengeli büyüme. Mevcut stratejiyi koruyun, müşteri sadakatine odaklanın.";
        }

        for (let i = 1; i <= 6; i++) { // 6 Ay İleri
            let targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + i);
            let monthStr = targetDate.toISOString().slice(5, 7); // "05"

            let pastMonthData = last12Months.find(d => d.ay.endsWith(monthStr));
            let baseVal = pastMonthData ? parseFloat(pastMonthData.toplam_ciro) : (formattedHistory[formattedHistory.length - 1].ciro);

            let forecastVal = baseVal * (1 + growthRate);
            let dateStr = targetDate.toISOString().slice(0, 7);
            forecastData.push({ ay: dateStr, tahmini_ciro: forecastVal });
        }

        // 3. Prepare Final Response Data (Respect User Filter)
        // We used 24 months for MATH, but user might want to see only "Last 6 Months" of history.

        let displayHistory = formattedHistory;

        if (ay) {
            if (ay.length === 4) {
                // Year Filter (e.g. 2023)
                // If user selected 2023, show only 2023 history.
                // Forecast (future) might look disconnected but user requested "divide that period".
                displayHistory = formattedHistory.filter(h => h.ay.startsWith(ay));
            } else if (ay !== 'all') {
                // "Last X Months" -> Slice the end
                const monthsToShow = parseInt(ay);
                if (!isNaN(monthsToShow) && displayHistory.length > monthsToShow) {
                    displayHistory = displayHistory.slice(-monthsToShow);
                }
            }
        }

        res.json({
            history: displayHistory,
            forecast: forecastData,
            growthRate: growthRatePercent,
            recommendation: recommendation
        });
    });
});

// 8. STRATEJİK: ŞUBE PERFORMANS MATRİSİ (Kapatma/İyileştirme Kararı)
app.get('/api/strategic/branch-performance', (req, res) => {
    const { ay, sehir_id, kategori_id } = req.query;

    let whereClauses = [];
    // Date Filter
    if (ay) {
        if (ay.length === 4) whereClauses.push(`YEAR(s.tarih) = ${ay}`);
        else if (ay !== 'all') whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`);
        else whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`);
    } else {
        whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`);
    }

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`s_sehir.sehir_id = ${mysql.escape(sehir_id)}`);

    // Category filter requires joining SatisDetay and Urunler
    let extraJoins = "";
    if (kategori_id && kategori_id !== 'all') {
        extraJoins = "JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id";
        whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sql = `
        SELECT 
            m.market_ad,
            s_sehir.sehir_ad,
            SUM(s.tutar) as toplam_ciro,
            COUNT(s.satis_id) as islem_sayisi,
            SUM(s.tutar) / COUNT(s.satis_id) as sepet_ortalamasi
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        JOIN Ilceler i ON m.ilce_id = i.ilce_id
        JOIN Sehirler s_sehir ON i.sehir_id = s_sehir.sehir_id
        ${extraJoins}
        ${whereSql}
        GROUP BY m.market_id, m.market_ad, s_sehir.sehir_ad, s_sehir.sehir_id
    `;

    db.query(sql, (err, branches) => {
        if (err) return res.status(500).json({ error: err });

        // Şehir Ortalamalarını Hesapla
        let cityStats = {};
        branches.forEach(b => {
            if (!cityStats[b.sehir_ad]) cityStats[b.sehir_ad] = { total: 0, count: 0 };
            cityStats[b.sehir_ad].total += parseFloat(b.toplam_ciro);
            cityStats[b.sehir_ad].count += 1;
        });

        let results = branches.map(b => {
            let ciro = parseFloat(b.toplam_ciro);
            let cityAvg = cityStats[b.sehir_ad].total / cityStats[b.sehir_ad].count;

            let efficiencyScore = (ciro / cityAvg) * 100; // 100 = Ortalama, <70 Kötü
            let recommendation = "NORMAL";
            let status = "success"; // color code

            if (efficiencyScore < 70) {
                recommendation = "KAPATMA/KÜÇÜLME DEĞERLENDİRİLMELİ";
                status = "danger";
            } else if (efficiencyScore < 90) {
                recommendation = "İZLENMELİ - Kampanya Desteği Gerekli";
                status = "warning";
            } else if (efficiencyScore > 130) {
                recommendation = "YILDIZ ŞUBE - Ödüllendirilmeli";
                status = "info";
            }

            return {
                market_ad: b.market_ad,
                sehir: b.sehir_ad,
                ciro: ciro,
                sepet_ort: parseFloat(b.sepet_ortalamasi),
                verimlilik: efficiencyScore.toFixed(0),
                recommendation: recommendation,
                status: status
            };
        });

        // Verimliliğe göre sırala (Düşükten yükseğe - sorunlular en üstte)
        results.sort((a, b) => a.verimlilik - b.verimlilik);

        res.json(results);
    });
});

// 9. STRATEJİK: LOKASYON ANALİZİ (Yeni Şube Fırsatları)
app.get('/api/strategic/location-analysis', (req, res) => {
    const { ay, sehir_id } = req.query;

    let whereClauses = [];
    if (ay) {
        if (ay.length === 4) whereClauses.push(`YEAR(s.tarih) = ${ay}`);
        else if (ay !== 'all') whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`);
        else whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`);
    } else {
        whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`);
    }

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`s_sehir.sehir_id = ${mysql.escape(sehir_id)}`);

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sql = `
        SELECT 
            i.ilce_ad,
            s_sehir.sehir_ad,
            COUNT(DISTINCT m.market_id) as sube_sayisi,
            SUM(s.tutar) as toplam_bolge_cirosu
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        JOIN Ilceler i ON m.ilce_id = i.ilce_id
        JOIN Sehirler s_sehir ON i.sehir_id = s_sehir.sehir_id
        ${whereSql}
        GROUP BY i.ilce_id, i.ilce_ad, s_sehir.sehir_ad
    `;

    db.query(sql, (err, districts) => {
        if (err) return res.status(500).json({ error: err });

        // Genel Ortalama (Şube Başı Ciro) - Referans için
        let totalRevenue = 0;
        let totalBranches = 0;
        districts.forEach(d => {
            totalRevenue += parseFloat(d.toplam_bolge_cirosu);
            totalBranches += d.sube_sayisi;
        });
        let globalAvgPerBranch = totalBranches > 0 ? (totalRevenue / totalBranches) : 0;

        let results = districts.map(d => {
            let revenue = parseFloat(d.toplam_bolge_cirosu);
            let avgRevPerBranch = revenue / d.sube_sayisi;

            // Potansiyel Skoru: (Bölge Ortalaması / Genel Ortalama)
            let potentialScore = (avgRevPerBranch / globalAvgPerBranch) * 100;

            let recommendation = "Nötr";
            let signal = "secondary"; // grey

            if (potentialScore > 140) {
                recommendation = "YÜKSEK POTANSİYEL - Yeni Şube Aç!";
                signal = "success"; // green
            } else if (potentialScore > 110) {
                recommendation = "FIRSAT OLABİLİR";
                signal = "info";
            } else if (potentialScore < 60) {
                recommendation = "DOYGUN PAZAR - Yatırım Yapma";
                signal = "danger";
            }

            return {
                ilce: d.ilce_ad,
                sehir: d.sehir_ad,
                sube_sayisi: d.sube_sayisi,
                bolge_cirosu: revenue,
                sube_basi_ciro: avgRevPerBranch,
                potansiyel_skoru: potentialScore.toFixed(0),
                recommendation: recommendation,
                signal: signal
            };
        });

        // En yüksek potansiyel en üstte
        results.sort((a, b) => b.potansiyel_skoru - a.potansiyel_skoru);

        res.json(results);
    });
});


// Ana sayfa yönlendirmesi
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 10. TREND ANALİZİ (Stratejik Planlama - Forecast yerine)
app.get('/api/strategic/trend-analysis', (req, res) => {
    const { ay, sehir_id } = req.query;

    // Default to last 6 months if not specified
    let period = 6;
    if (ay && ay !== 'all' && ay.length !== 4) period = parseInt(ay);

    // Logic: Compare (Now - Period) vs (Now - Period*2)
    // Example: Last 6 months vs Previous 6 months

    let whereCurrent = [`s.tarih >= DATE_SUB(NOW(), INTERVAL ${period} MONTH)`];
    let wherePrevious = [`s.tarih >= DATE_SUB(NOW(), INTERVAL ${period * 2} MONTH)`, `s.tarih < DATE_SUB(NOW(), INTERVAL ${period} MONTH)`];

    if (sehir_id && sehir_id !== 'all') {
        const cityFilter = `m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`;
        whereCurrent.push(cityFilter);
        wherePrevious.push(cityFilter);
    }

    const getQuery = (where) => `
        SELECT k.kategori_ad, SUM(s.tutar) as ciro
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        JOIN SatisDetay sd ON s.satis_id = sd.satis_id
        JOIN Urunler u ON sd.urun_id = u.urun_id
        JOIN Kategoriler k ON u.kategori_id = k.kategori_id
        WHERE ${where.join(' AND ')}
        GROUP BY k.kategori_ad
    `;

    db.query(getQuery(whereCurrent), (err, currentResults) => {
        if (err) return res.status(500).json({ error: err });

        db.query(getQuery(wherePrevious), (err, prevResults) => {
            if (err) return res.status(500).json({ error: err });

            let trends = [];
            currentResults.forEach(curr => {
                const prev = prevResults.find(p => p.kategori_ad === curr.kategori_ad);
                const prevCiro = prev ? parseFloat(prev.ciro) : 0;
                const currCiro = parseFloat(curr.ciro);

                let change = 100; // default infinite growth
                if (prevCiro > 0) change = ((currCiro - prevCiro) / prevCiro) * 100;

                trends.push({
                    name: curr.kategori_ad,
                    current: currCiro,
                    previous: prevCiro,
                    change: change.toFixed(1),
                    direction: change >= 0 ? 'up' : 'down'
                });
            });

            // Sort by absolute change magnitude or just percentage? 
            // User asked for "Rising" and "Falling".
            trends.sort((a, b) => parseFloat(b.change) - parseFloat(a.change));

            const risers = trends.slice(0, 3); // Top 3 risers
            const fallers = trends.filter(t => t.change < 0).slice(-3).reverse(); // Bottom 3 fallers

            res.json({ risers, fallers });
        });
    });
});

// 11. EN ÇOK SATAN ÜRÜNLER (Eksik Endpoint)
app.get('/api/dashboard/top-products', (req, res) => {
    const { ay, sehir_id, market_id, kategori_id } = req.query;

    let whereClauses = [];
    if (ay) {
        if (ay.length === 4) whereClauses.push(`YEAR(s.tarih) = ${ay}`);
        else if (ay !== 'all') whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`);
    }

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
    if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

    let join = "JOIN Marketler m ON s.market_id = m.market_id JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id JOIN Kategoriler k ON u.kategori_id = k.kategori_id";

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
        FROM Satislar s
        ${join}
        ${whereSql}
        GROUP BY u.urun_id, u.urun_ad, k.kategori_ad
        ORDER BY toplam_adet DESC
        LIMIT 10
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

app.listen(3000, () => {
    console.log('Sunucu çalışıyor: http://localhost:3000');
});