const DashboardModel = require('../models/dashboardModel');

exports.getStats = async (req, res) => {
    try {
        const data = await DashboardModel.getStats(req.query);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getFilters = async (req, res) => {
    try {
        const data = await DashboardModel.getFilters();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSalesOverTime = async (req, res) => {
    try {
        const data = await DashboardModel.getSalesOverTime(req.query);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getBreakdown = async (req, res) => {
    try {
        const data = await DashboardModel.getBreakdown(req.query);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getForecast = async (req, res) => {
    try {
        const history = await DashboardModel.getForecastData(req.query);
        const { ay, startDate, endDate } = req.query;

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
            let baseVal = formattedHistory[formattedHistory.length - 1].ciro;
            let forecastVal = baseVal * (1 + growthRate);
            forecastData.push({ ay: dateStr, tahmini_ciro: forecastVal });
        }

        let displayHistory = formattedHistory;
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getBranchPerformance = async (req, res) => {
    try {
        const branches = await DashboardModel.getBranchPerformance(req.query);
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getLocationAnalysis = async (req, res) => {
    try {
        const districts = await DashboardModel.getLocationAnalysis(req.query);
        let totalRevenue = 0;
        let totalPopulation = 0;
        districts.forEach(d => {
            totalRevenue += parseFloat(d.toplam_bolge_cirosu);
            totalPopulation += parseInt(d.nufus || 0);
        });

        let globalRevPerCapita = totalPopulation > 0 ? (totalRevenue / totalPopulation) : 1;

        let results = districts.map(d => {
            let revenue = parseFloat(d.toplam_bolge_cirosu);
            let population = parseInt(d.nufus || 1);
            let revPerCapita = revenue / population;
            let penetrationIndex = (revPerCapita / globalRevPerCapita) * 100;
            let recommendation = "Nötr";
            let signal = "secondary";

            if (population > 250000 && penetrationIndex < 60) {
                recommendation = "YÜKSEK FIRSAT (Potansiyel Yüksek)";
                signal = "success";
            } else if (penetrationIndex > 150) {
                recommendation = "DOYGUN PAZAR (Maksimize)";
                signal = "danger";
            } else if (penetrationIndex < 80) {
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
                potansiyel_skoru: penetrationIndex.toFixed(0),
                recommendation: recommendation,
                signal: signal
            };
        });

        const signalOrder = { 'success': 4, 'info': 3, 'secondary': 2, 'danger': 1 };
        results.sort((a, b) => signalOrder[b.signal] - signalOrder[a.signal]);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTrendAnalysis = async (req, res) => {
    try {
        const { current, previous } = await DashboardModel.getTrendData(req.query);
        let trends = [];
        current.forEach(curr => {
            const prev = previous.find(p => p.kategori_ad === curr.kategori_ad);
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTopProducts = async (req, res) => {
    try {
        const data = await DashboardModel.getTopProducts(req.query);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

