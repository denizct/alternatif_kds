const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// CRUD Endpoints for Products
router.get('/products', productController.getAllProducts);
router.post('/products', productController.createProduct);
router.put('/products/:id', productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);

module.exports = router;
