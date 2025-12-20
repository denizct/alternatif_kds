const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

// Import Database (Verification only, connection happens in db.js)
require('./config/db');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// HTML dosyalarını sunmak için 'public' klasörünü statik yapıyoruz
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);

// Root Route (Redirect to index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});