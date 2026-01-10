const ProductModel = require('../models/productModel');

exports.getAllProducts = async (req, res) => {
    try {
        const products = await ProductModel.getAll();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProduct = async (req, res) => {
    const { urun_ad, kategori_id } = req.body;
    if (!urun_ad || !kategori_id) {
        return res.status(400).json({ error: "Ürün adı ve Kategori ID zorunludur." });
    }
    try {
        const result = await ProductModel.create(urun_ad, kategori_id);
        res.status(201).json({ message: "Ürün başarıyla oluşturuldu.", id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    const { urun_ad, kategori_id } = req.body;
    try {
        await ProductModel.update(id, urun_ad, kategori_id);
        res.json({ message: "Ürün güncellendi." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteProduct = async (req, res) => {
    const { id } = req.params;
    try {
        // İŞ KURALI 1: Tarihi geçmiş randevu silinemez (Örnekteki gibi) -> Bizde: Satışı olan ürün silinemez.
        const salesCount = await ProductModel.checkSales(id);
        if (salesCount > 0) {
            return res.status(400).json({ error: "Bu ürüne ait satış kayıtları mevcut. Silinemez." });
        }

        await ProductModel.delete(id);
        res.json({ message: "Ürün silindi." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
