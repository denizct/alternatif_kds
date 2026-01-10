const db = require('../config/db');

// Promise Wrapper for DB
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
};

const UserModel = {
    findByCredentials: async (username, password) => {
        const sql = "SELECT * FROM Yoneticiler WHERE kullanici_adi = ? AND sifre = ?";
        const results = await query(sql, [username, password]);
        return results[0];
    }
};

module.exports = UserModel;
