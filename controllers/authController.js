const UserModel = require('../models/userModel');

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await UserModel.findByCredentials(username, password);

        if (user) {
            // Concatenate ad + soyad for frontend compatibility
            const fullName = (user.ad && user.soyad) ? `${user.ad} ${user.soyad}` : user.kullanici_adi;
            res.json({ success: true, message: 'Giriş Başarılı!', user: fullName });
        } else {
            res.json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

