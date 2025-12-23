const db = require('../config/db');

exports.login = (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM Yoneticiler WHERE kullanici_adi = ? AND sifre = ?";

    db.query(sql, [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: err });

        if (results.length > 0) {
            // Updated: Concatenate ad + soyad for frontend compatibility
            const user = results[0];
            const fullName = (user.ad && user.soyad) ? `${user.ad} ${user.soyad}` : user.kullanici_adi;
            
            res.json({ success: true, message: 'Giriş Başarılı!', user: fullName });
        } else {
            res.json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
        }
    });
};
