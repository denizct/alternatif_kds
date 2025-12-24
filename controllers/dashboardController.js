const db = require('../config/db');
const mysql = require('mysql2');

// Helper for Date Filtering
function buildDateClause(ay, startDate, endDate, prefix = 's') {
    if (startDate && endDate) {
        return `${prefix}.tarih BETWEEN ${mysql.escape(startDate)} AND ${mysql.escape(endDate)}`;
    }
    if (!ay || ay === 'all') return null;
    if (ay.length === 4) return `YEAR(${prefix}.tarih) = ${ay}`;
    return `${prefix}.tarih >= DATE_SUB(NOW(), INTERVAL ${ay} MONTH)`;
}

// 2. DASHBOARD İSTATİSTİKLERİ
exports.getStats = (req, res) => {
    const { ay, startDate, endDate } = req.query;

    // Construct WHERE clause
    let dateClause = buildDateClause(ay, startDate, endDate);
    let whereSql = dateClause ? `WHERE ${dateClause}` : '';

    const sqlTotal = `
        SELECT 
            SUM(s.tutar) as toplam_ciro, 
            SUM(s.toplam_adet) as toplam_satis_adedi 
        FROM Satislar s
        ${whereSql}
    `;

    const sqlTopMarket = `
        SELECT m.market_ad, SUM(s.tutar) as ciro
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        ${whereSql}
        GROUP BY m.market_ad
        ORDER BY ciro DESC
        LIMIT 1
    `;

    const sqlBestProduct = `
        SELECT u.urun_ad, SUM(sd.adet) as toplam_adet
        FROM SatisDetay sd
        JOIN Satislar s ON sd.satis_id = s.satis_id
        JOIN Urunler u ON sd.urun_id = u.urun_id
        ${whereSql}
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

                const ciro = totalResults[0] ? totalResults[0].toplam_ciro : 0;

                res.json({
                    toplam_ciro: ciro || 0,
                    toplam_satis_adedi: totalResults[0] ? (totalResults[0].toplam_satis_adedi || 0) : 0,
                    en_iyi_sube: topMarketResults.length > 0 ? topMarketResults[0].market_ad : '-',
                    en_cok_satan_urun: bestProductResults.length > 0 ? bestProductResults[0].urun_ad : '-'
                });
            });
        });
    });
};

// 3. FİLTRELER İÇİN VERİ
exports.getFilters = (req, res) => {
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
};

// 4. ZAMAN BAZLI SATIŞ GRAFİĞİ
exports.getSalesOverTime = (req, res) => {
    const { ay, sehir_id, market_id, kategori_id, startDate, endDate } = req.query;

    let whereClauses = [];
    let dateClause = buildDateClause(ay, startDate, endDate);
    if (dateClause) whereClauses.push(dateClause);

    // Always show up to now if not specific year/range logic (covered by helper)
    // whereClauses.push('s.tarih <= NOW()'); // Not strictly needed if data is past only

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
};

// 5. ŞUBE ve KATEGORİ BAZLI PASTA GRAFİK VERİLERİ
exports.getBreakdown = (req, res) => {
    const { ay, sehir_id, market_id, startDate, endDate } = req.query;

    let whereClauses = [];
    let dateClause = buildDateClause(ay, startDate, endDate);
    if (dateClause) whereClauses.push(dateClause);

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
    if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sqlMarket = `
        SELECT m.market_ad, SUM(s.tutar) as ciro 
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        ${whereSql}
        GROUP BY m.market_ad
        ORDER BY ciro DESC
    `;

    const sqlCategory = `
        SELECT k.kategori_ad, SUM(sd.adet * sd.birim_fiyat) as ciro
        FROM SatisDetay sd
        JOIN Satislar s ON sd.satis_id = s.satis_id
        JOIN Urunler u ON sd.urun_id = u.urun_id
        JOIN Kategoriler k ON u.kategori_id = k.kategori_id
        JOIN Marketler m ON s.market_id = m.market_id
        ${whereSql}
        GROUP BY k.kategori_ad
    `;

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
};

// 6. GELECEK TAHMİNİ (FORECAST) API
exports.getForecast = (req, res) => {
    const { ay, sehir_id, market_id, kategori_id, startDate, endDate } = req.query;

    // Forecast needs historical context, so we force 24 MONTHS matching the usual structure
    // but filter later for display if needed.
    // However, if we want to be smarter, we could base it on the filtered range if it's long enough.
    // For now, we keep the reliable 24 months for the CALCULATION.

    let whereClauses = [];
    whereClauses.push("s.tarih >= DATE_SUB(NOW(), INTERVAL 24 MONTH)");

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

        if (history.length < 12) {
            return res.json({
                history: history,
                forecast: [],
                recommendation: "Yeterli veri yok. En az 12 aylık veri gerekli.",
                growthRate: 0
            });
        }

        let last12Months = history.slice(-12);
        let previous12Months = history.slice(-24, -12);

        let growthRate = 0.05;

        if (previous12Months.length > 0) {
            const sumLast = last12Months.reduce((a, b) => a + parseFloat(b.toplam_ciro), 0);
            const sumPrev = previous12Months.reduce((a, b) => a + parseFloat(b.toplam_ciro), 0);
            if (sumPrev > 0) growthRate = (sumLast - sumPrev) / sumPrev;
        }

        let forecastData = [];
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

        for (let i = 1; i <= 6; i++) {
            let targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + i);
            let dateStr = targetDate.toISOString().slice(0, 7);

            // Simple projection
            let baseVal = formattedHistory[formattedHistory.length - 1].ciro;
            // Optionally try to find same month last year for seasonality
            let forecastVal = baseVal * (1 + growthRate);

            forecastData.push({ ay: dateStr, tahmini_ciro: forecastVal });
        }

        let displayHistory = formattedHistory;

        // Apply display filter
        if (startDate && endDate) {
            displayHistory = formattedHistory.filter(h => h.ay >= startDate.slice(0, 7) && h.ay <= endDate.slice(0, 7));
        } else if (ay) {
            if (ay.length === 4) {
                displayHistory = formattedHistory.filter(h => h.ay.startsWith(ay));
            } else if (ay !== 'all') {
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
};

// 8. STRATEJİK: ŞUBE PERFORMANS MATRİSİ
exports.getBranchPerformance = (req, res) => {
    const { ay, sehir_id, kategori_id, startDate, endDate } = req.query;

    let whereClauses = [];

    let dateClause = buildDateClause(ay, startDate, endDate, 's');
    if (dateClause) whereClauses.push(dateClause);
    else whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`); // Default if no filter

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`s_sehir.sehir_id = ${mysql.escape(sehir_id)}`);

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

        let cityStats = {};
        branches.forEach(b => {
            if (!cityStats[b.sehir_ad]) cityStats[b.sehir_ad] = { total: 0, count: 0 };
            cityStats[b.sehir_ad].total += parseFloat(b.toplam_ciro);
            cityStats[b.sehir_ad].count += 1;
        });

        let results = branches.map(b => {
            let ciro = parseFloat(b.toplam_ciro);
            let cityAvg = cityStats[b.sehir_ad] ? (cityStats[b.sehir_ad].total / cityStats[b.sehir_ad].count) : 1;
            let efficiencyScore = (ciro / cityAvg) * 100;
            let recommendation = "NORMAL";
            let status = "success";

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

        results.sort((a, b) => a.verimlilik - b.verimlilik);
        res.json(results);
    });
};

// 9. STRATEJİK: LOKASYON ANALİZİ
exports.getLocationAnalysis = (req, res) => {
    const { ay, sehir_id, startDate, endDate } = req.query;

    let whereClauses = [];
    let dateClause = buildDateClause(ay, startDate, endDate, 's');
    if (dateClause) whereClauses.push(dateClause);
    else whereClauses.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`);

    if (sehir_id && sehir_id !== 'all') whereClauses.push(`s_sehir.sehir_id = ${mysql.escape(sehir_id)}`);

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sql = `
        SELECT 
            i.ilce_ad,
            s_sehir.sehir_ad,
            i.nufus,
            COUNT(DISTINCT m.market_id) as sube_sayisi,
            SUM(s.tutar) as toplam_bolge_cirosu
        FROM Satislar s
        JOIN Marketler m ON s.market_id = m.market_id
        JOIN Ilceler i ON m.ilce_id = i.ilce_id
        JOIN Sehirler s_sehir ON i.sehir_id = s_sehir.sehir_id
        ${whereSql}
        GROUP BY i.ilce_id, i.ilce_ad, s_sehir.sehir_ad, i.nufus
    `;

    db.query(sql, (err, districts) => {
        if (err) return res.status(500).json({ error: err });

        // 1. Calculate Global Averages for Baseline
        let totalRevenue = 0;
        let totalPopulation = 0;
        districts.forEach(d => {
            totalRevenue += parseFloat(d.toplam_bolge_cirosu);
            totalPopulation += parseInt(d.nufus || 0);
        });

        // Avoid division by zero
        let globalRevPerCapita = totalPopulation > 0 ? (totalRevenue / totalPopulation) : 1;

        let results = districts.map(d => {
            let revenue = parseFloat(d.toplam_bolge_cirosu);
            let population = parseInt(d.nufus || 1); // Default to 1 to avoid NaN

            // "Kişi Başı Ciro" (Penetration)
            let revPerCapita = revenue / population;

            // Penetration Index (100 is average)
            // If Index is LOW (e.g. 20), it means we are underperforming relative to population size -> OPPORTUNITY
            let penetrationIndex = (revPerCapita / globalRevPerCapita) * 100;

            let recommendation = "Nötr";
            let signal = "secondary";

            // LOGIC: High Population + Low Penetration = HIGH OPPORTUNITY
            if (population > 250000 && penetrationIndex < 60) {
                recommendation = "YÜKSEK FIRSAT (Potansiyel Yüksek)";
                signal = "success"; // Green because it's an opportunity to grow
            }
            // LOGIC: Very High Penetration = SATURATED
            else if (penetrationIndex > 150) {
                recommendation = "DOYGUN PAZAR (Maksimize)";
                signal = "danger"; // Red/Orange warning against over-investment
            }
            // MODERATE
            else if (penetrationIndex < 80) {
                recommendation = "Gelişime Açık";
                signal = "info";
            }

            return {
                ilce: d.ilce_ad,
                sehir: d.sehir_ad,
                nufus: population,
                sube_sayisi: d.sube_sayisi,
                bolge_cirosu: revenue,
                kisi_basi_ciro: revPerCapita.toFixed(2),
                potansiyel_skoru: penetrationIndex.toFixed(0), // Low score here actually means High Potential for growth, but let's keep the user's label simple
                recommendation: recommendation,
                signal: signal
            };
        });

        // Sort by Opportunity (Lower Penetration = Higher Rank for "Opportunity" view?)
        // Or user wants "High Opportunity" first. 
        // Our logic: "YÜKSEK FIRSAT" is signal='success'. 
        // Let's sort logic: 
        // 1. Success (High Opp)
        // 2. Info
        // 3. Secondary
        // 4. Danger (Saturated)
        const signalOrder = { 'success': 4, 'info': 3, 'secondary': 2, 'danger': 1 };
        results.sort((a, b) => signalOrder[b.signal] - signalOrder[a.signal]);

        res.json(results);
    });
};

// 10. TREND ANALİZİ
exports.getTrendAnalysis = (req, res) => {
    const { ay, sehir_id, startDate, endDate } = req.query;

    let period = 6;
    let whereCurrent = [];
    let wherePrevious = [];

    if (startDate && endDate) {
        // Custom Range Logic for Trend
        // Current: startDate to endDate
        // Previous: Same duration before startDate
        whereCurrent.push(`s.tarih BETWEEN ${mysql.escape(startDate)} AND ${mysql.escape(endDate)}`);

        // Calculate previous range approximately (not perfect but valid for SQL)
        // We'll use DATEDIFF logic in SQL or just fallback to just "Before Start Date" with same interval.
        wherePrevious.push(`s.tarih >= DATE_SUB(${mysql.escape(startDate)}, INTERVAL DATEDIFF(${mysql.escape(endDate)}, ${mysql.escape(startDate)}) DAY)`);
        wherePrevious.push(`s.tarih < ${mysql.escape(startDate)}`);

    } else {
        if (ay && ay !== 'all' && ay.length !== 4) period = parseInt(ay);

        whereCurrent.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${period} MONTH)`);
        wherePrevious.push(`s.tarih >= DATE_SUB(NOW(), INTERVAL ${period * 2} MONTH)`);
        wherePrevious.push(`s.tarih < DATE_SUB(NOW(), INTERVAL ${period} MONTH)`);
    }

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

                let change = 100;
                if (prevCiro > 0) change = ((currCiro - prevCiro) / prevCiro) * 100;

                trends.push({
                    name: curr.kategori_ad,
                    current: currCiro,
                    previous: prevCiro,
                    change: change.toFixed(1),
                    direction: change >= 0 ? 'up' : 'down'
                });
            });

            trends.sort((a, b) => parseFloat(b.change) - parseFloat(a.change));
            const risers = trends.slice(0, 3);
            const fallers = trends.filter(t => t.change < 0).slice(-3).reverse();
            res.json({ risers, fallers });
        });
    });
};

// 11. EN ÇOK SATAN ÜRÜNLER
exports.getTopProducts = (req, res) => {
    const { ay, sehir_id, market_id, kategori_id, startDate, endDate } = req.query;

    let whereClauses = [];

    let dateClause = buildDateClause(ay, startDate, endDate);
    if (dateClause) whereClauses.push(dateClause);

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
};
