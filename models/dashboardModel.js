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

// Helper to execute query with promise
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
};

const DashboardModel = {
    // 2. DASHBOARD İSTATİSTİKLERİ
    getStats: async (filters) => {
        const { ay, startDate, endDate } = filters;
        let dateClause = buildDateClause(ay, startDate, endDate);
        let whereSql = dateClause ? `WHERE ${dateClause}` : '';

        const sqlTotal = `SELECT SUM(s.tutar) as toplam_ciro, SUM(s.toplam_adet) as toplam_satis_adedi FROM Satislar s ${whereSql}`;
        const sqlTopMarket = `SELECT m.market_ad, SUM(s.tutar) as ciro FROM Satislar s JOIN Marketler m ON s.market_id = m.market_id ${whereSql} GROUP BY m.market_ad ORDER BY ciro DESC LIMIT 1`;
        const sqlBestProduct = `SELECT u.urun_ad, SUM(sd.adet) as toplam_adet FROM SatisDetay sd JOIN Satislar s ON sd.satis_id = s.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id ${whereSql} GROUP BY u.urun_id ORDER BY toplam_adet DESC LIMIT 1`;

        const [totalResults, topMarketResults, bestProductResults] = await Promise.all([
            query(sqlTotal),
            query(sqlTopMarket),
            query(sqlBestProduct)
        ]);

        return {
            toplam_ciro: totalResults[0]?.toplam_ciro || 0,
            toplam_satis_adedi: totalResults[0]?.toplam_satis_adedi || 0,
            en_iyi_sube: topMarketResults[0]?.market_ad || '-',
            en_cok_satan_urun: bestProductResults[0]?.urun_ad || '-'
        };
    },

    // 3. FİLTRELER
    getFilters: async () => {
        const [cities, markets, categories] = await Promise.all([
            query("SELECT sehir_id, sehir_ad FROM Sehirler"),
            query("SELECT market_id, market_ad, sehir_id FROM Marketler m JOIN Ilceler i ON m.ilce_id = i.ilce_id"),
            query("SELECT kategori_id, kategori_ad FROM Kategoriler")
        ]);
        return { cities, markets, categories };
    },

    // 4. ZAMAN BAZLI SATIŞ
    getSalesOverTime: async (filters) => {
        const { ay, sehir_id, market_id, kategori_id, startDate, endDate } = filters;
        let whereClauses = [];
        let dateClause = buildDateClause(ay, startDate, endDate);
        if (dateClause) whereClauses.push(dateClause);

        if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
        if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

        let join = "JOIN Marketler m ON s.market_id = m.market_id";
        if (kategori_id && kategori_id !== 'all') {
            join += " JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id";
            whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
        const sql = `SELECT DATE_FORMAT(s.tarih, '%Y-%m') as ay, SUM(s.tutar) as toplam_ciro FROM Satislar s ${join} ${whereSql} GROUP BY DATE_FORMAT(s.tarih, '%Y-%m') ORDER BY ay ASC`;

        return query(sql);
    },

    // 5. BREAKDOWN
    getBreakdown: async (filters) => {
        const { ay, sehir_id, market_id, startDate, endDate } = filters;
        let whereClauses = [];
        let dateClause = buildDateClause(ay, startDate, endDate);
        if (dateClause) whereClauses.push(dateClause);

        if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
        if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const sqlMarket = `SELECT m.market_ad, SUM(s.tutar) as ciro FROM Satislar s JOIN Marketler m ON s.market_id = m.market_id ${whereSql} GROUP BY m.market_ad ORDER BY ciro DESC`;
        const sqlCategory = `SELECT k.kategori_ad, SUM(sd.adet * sd.birim_fiyat) as ciro FROM SatisDetay sd JOIN Satislar s ON sd.satis_id = s.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id JOIN Kategoriler k ON u.kategori_id = k.kategori_id JOIN Marketler m ON s.market_id = m.market_id ${whereSql} GROUP BY k.kategori_ad`;
        const sqlCity = `SELECT sehir.sehir_ad, SUM(s.tutar) as ciro FROM Satislar s JOIN Marketler m ON s.market_id = m.market_id JOIN Ilceler ilce ON m.ilce_id = ilce.ilce_id JOIN Sehirler sehir ON ilce.sehir_id = sehir.sehir_id ${whereSql} GROUP BY sehir.sehir_ad ORDER BY ciro DESC`;

        const [markets, categories, cities] = await Promise.all([
            query(sqlMarket),
            query(sqlCategory),
            query(sqlCity)
        ]);
        return { markets, categories, cities };
    },

    // 6. FORECAST (Daha karmaşık business logic içeriyor, bunu Controller veya Service katmanında tutmak daha iyi olabilir ama Modelde tutalım)
    getForecastData: async (filters) => {
        const { ay, sehir_id, market_id, kategori_id, startDate, endDate } = filters;

        let whereClauses = ["s.tarih >= DATE_SUB(NOW(), INTERVAL 24 MONTH)"];
        if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
        if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

        let join = "JOIN Marketler m ON s.market_id = m.market_id";
        if (kategori_id && kategori_id !== 'all') {
            join += " JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id";
            whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);
        }

        const whereSql = 'WHERE ' + whereClauses.join(' AND ');
        const sqlHistory = `
            SELECT DATE_FORMAT(s.tarih, '%Y-%m') as ay, SUM(s.tutar) as toplam_ciro
            FROM Satislar s ${join} ${whereSql}
            GROUP BY DATE_FORMAT(s.tarih, '%Y-%m') ORDER BY ay ASC
        `;

        return query(sqlHistory);
    },

    // 8. BRANCH PERFORMANCE
    getBranchPerformance: async (filters) => {
        const { ay, sehir_id, kategori_id, startDate, endDate } = filters;
        let whereClauses = [];
        let dateClause = buildDateClause(ay, startDate, endDate, 's');
        whereClauses.push(dateClause || `s.tarih >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`);

        if (sehir_id && sehir_id !== 'all') whereClauses.push(`s_sehir.sehir_id = ${mysql.escape(sehir_id)}`);

        let extraJoins = "";
        if (kategori_id && kategori_id !== 'all') {
            extraJoins = "JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id";
            whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);
        }

        const whereSql = 'WHERE ' + whereClauses.join(' AND ');
        const sql = `
            SELECT m.market_ad, s_sehir.sehir_ad, SUM(s.tutar) as toplam_ciro, COUNT(s.satis_id) as islem_sayisi, SUM(s.tutar) / COUNT(s.satis_id) as sepet_ortalamasi
            FROM Satislar s
            JOIN Marketler m ON s.market_id = m.market_id
            JOIN Ilceler i ON m.ilce_id = i.ilce_id
            JOIN Sehirler s_sehir ON i.sehir_id = s_sehir.sehir_id
            ${extraJoins} ${whereSql}
            GROUP BY m.market_id, m.market_ad, s_sehir.sehir_ad, s_sehir.sehir_id
        `;
        return query(sql);
    },

    // 9. LOCATION ANALYSIS
    getLocationAnalysis: async (filters) => {
        const { ay, sehir_id, startDate, endDate } = filters;
        let whereClauses = [];
        let dateClause = buildDateClause(ay, startDate, endDate, 's');
        whereClauses.push(dateClause || `s.tarih >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`);

        if (sehir_id && sehir_id !== 'all') whereClauses.push(`s_sehir.sehir_id = ${mysql.escape(sehir_id)}`);
        const whereSql = 'WHERE ' + whereClauses.join(' AND ');

        const sql = `
            SELECT i.ilce_ad, s_sehir.sehir_ad, i.nufus, COUNT(DISTINCT m.market_id) as sube_sayisi, SUM(s.tutar) as toplam_bolge_cirosu
            FROM Satislar s
            JOIN Marketler m ON s.market_id = m.market_id
            JOIN Ilceler i ON m.ilce_id = i.ilce_id
            JOIN Sehirler s_sehir ON i.sehir_id = s_sehir.sehir_id
            ${whereSql}
            GROUP BY i.ilce_id, i.ilce_ad, s_sehir.sehir_ad, i.nufus
        `;
        return query(sql);
    },

    // 10. TREND ANALYSIS
    getTrendData: async (filters) => {
        const { ay, sehir_id, startDate, endDate } = filters;
        let period = 6;
        let whereCurrent = [];
        let wherePrevious = [];

        if (startDate && endDate) {
            whereCurrent.push(`s.tarih BETWEEN ${mysql.escape(startDate)} AND ${mysql.escape(endDate)}`);
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

        const [current, previous] = await Promise.all([
            query(getQuery(whereCurrent)),
            query(getQuery(wherePrevious))
        ]);
        return { current, previous };
    },

    // 11. TOP PRODUCTS
    getTopProducts: async (filters) => {
        const { ay, sehir_id, market_id, kategori_id, startDate, endDate } = filters;
        let whereClauses = [];
        let dateClause = buildDateClause(ay, startDate, endDate);
        if (dateClause) whereClauses.push(dateClause);

        if (sehir_id && sehir_id !== 'all') whereClauses.push(`m.ilce_id IN (SELECT ilce_id FROM Ilceler WHERE sehir_id = ${mysql.escape(sehir_id)})`);
        if (market_id && market_id !== 'all') whereClauses.push(`s.market_id = ${mysql.escape(market_id)}`);

        let join = "JOIN Marketler m ON s.market_id = m.market_id JOIN SatisDetay sd ON s.satis_id = sd.satis_id JOIN Urunler u ON sd.urun_id = u.urun_id JOIN Kategoriler k ON u.kategori_id = k.kategori_id";
        if (kategori_id && kategori_id !== 'all') whereClauses.push(`u.kategori_id = ${mysql.escape(kategori_id)}`);

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
        const sql = `
            SELECT u.urun_ad, k.kategori_ad, SUM(sd.adet) as toplam_adet, SUM(sd.adet * sd.birim_fiyat) as toplam_ciro
            FROM Satislar s ${join} ${whereSql}
            GROUP BY u.urun_id, u.urun_ad, k.kategori_ad
            ORDER BY toplam_adet DESC LIMIT 10
        `;
        return query(sql);
    }
};

module.exports = DashboardModel;
