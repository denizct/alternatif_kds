const db = require('../config/db');

exports.login = (req, res) => {
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
};
