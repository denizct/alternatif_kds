const db = require('../config/db');
const mysql = require('mysql2');

// Promise Wrapper for DB
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
};

const ProductModel = {
    // Tüm ürünleri getir
    getAll: async () => {
        return query('SELECT u.urun_id, u.urun_ad, k.kategori_ad, u.kategori_id FROM Urunler u JOIN Kategoriler k ON u.kategori_id = k.kategori_id ORDER BY u.urun_ad ASC');
    },

    // Yeni ürün ekle
    create: async (urun_ad, kategori_id) => {
        const sql = 'INSERT INTO Urunler (urun_ad, kategori_id) VALUES (?, ?)';
        return query(sql, [urun_ad, kategori_id]);
    },

    // Ürün güncelle
    update: async (id, urun_ad, kategori_id) => {
        const sql = 'UPDATE Urunler SET urun_ad = ?, kategori_id = ? WHERE urun_id = ?';
        return query(sql, [urun_ad, kategori_id, id]);
    },

    // Ürün sil (İş kuralı: Satışı olan ürün silinemez - bu kontrolü Controller'da yapacağız veya SQL ile kontrol edilebilir)
    delete: async (id) => {
        const sql = 'DELETE FROM Urunler WHERE urun_id = ?';
        return query(sql, [id]);
    },

    // Satış kontrolü (Silme kuralları için)
    checkSales: async (id) => {
        const sql = 'SELECT COUNT(*) as sayi FROM SatisDetay WHERE urun_id = ?';
        const result = await query(sql, [id]);
        return result[0].sayi;
    }
};

module.exports = ProductModel;
