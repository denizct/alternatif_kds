const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Dashboard Endpoints
router.get('/dashboard/stats', dashboardController.getStats);
router.get('/dashboard/sales-over-time', dashboardController.getSalesOverTime);
router.get('/dashboard/breakdown', dashboardController.getBreakdown);
router.get('/dashboard/forecast', dashboardController.getForecast);
router.get('/dashboard/top-products', dashboardController.getTopProducts);

// Strategic Endpoints
router.get('/strategic/branch-performance', dashboardController.getBranchPerformance);
router.get('/strategic/location-analysis', dashboardController.getLocationAnalysis);
router.get('/strategic/trend-analysis', dashboardController.getTrendAnalysis);

// Filters
router.get('/filters', dashboardController.getFilters);

module.exports = router;
