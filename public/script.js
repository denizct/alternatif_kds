
// BASE URL check (assuming localhost:3000 for development)
const API_URL = 'http://localhost:3000/api';

// Chart instances (global variables to destroy/recreate)
let trendChartInstance = null;
let categoryChartInstance = null;
let branchChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on panel.html
    if (document.getElementById('welcomeUser')) {
        const user = localStorage.getItem('user');
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        document.getElementById('welcomeUser').innerText = `Merhaba`;

        initDashboard();
    }

    // Login Form Handler
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const result = await response.json();

                if (result.success) {
                    localStorage.setItem('user', result.user);
                    window.location.href = 'panel.html';
                } else {
                    document.getElementById('message').innerText = result.message;
                    document.getElementById('message').style.color = 'red';
                }
            } catch (error) {
                console.error('Login Error:', error);
            }
        });
    }
});

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}



function switchView(viewId, element) {
    // 1. Highlight Menu
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');

    // 2. Show/Hide Views
    document.querySelectorAll('.view-section').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(viewId).style.display = 'block';

    // 3. Trigger Data Update (to refresh charts in hidden view if needed)
    if (viewId === 'view-strategic') {
        updateDashboard(); // Use main update function to ensure filters are read
    } else {
        updateDashboard();
    }
}

async function initDashboard() {
    await loadFilters();
    updateDashboard();
}

async function loadTopProducts(query) {
    try {
        const res = await fetch(`${API_URL}/dashboard/top-products${query}`);
        const data = await res.json();

        const tbody = document.getElementById('topProductsBody');
        if (!tbody) return data; // Return data even if element missing
        tbody.innerHTML = '';

        const fmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:10px;">${item.urun_ad}</td>
                <td style="padding:10px; color:#aaa;">${item.kategori_ad}</td>
                <td style="padding:10px;">${item.toplam_adet}</td>
                <td style="padding:10px; color:var(--success-color); font-weight:bold;">${fmt.format(item.toplam_ciro)}</td>
            `;
            tr.style.borderBottom = '1px solid #333';
            tbody.appendChild(tr);
        });

        return data; // Return for use in other charts

    } catch (err) {
        console.error('Top Products error:', err);
        return [];
    }
}

async function initDashboard() {
    await loadFilters();
    updateDashboard(); // Load initial data
}

// Load Dropdown Options
async function loadFilters() {
    try {
        const res = await fetch(`${API_URL}/filters`);
        const data = await res.json();

        // City
        const citySelect = document.getElementById('cityFilter');
        data.cities.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city.sehir_id;
            opt.innerText = city.sehir_ad;
            citySelect.appendChild(opt);
        });

        // Market
        const marketSelect = document.getElementById('marketFilter');
        // Store all markets to filter client-side if needed, but for now just load all
        // A better approach would be to filter markets when city changes.
        // For simplicity, we load all, but we could improve this.
        window.allMarkets = data.markets;
        data.markets.forEach(market => {
            const opt = document.createElement('option');
            opt.value = market.market_id;
            opt.innerText = market.market_ad;
            marketSelect.appendChild(opt);
        });

        // Category
        const catSelect = document.getElementById('categoryFilter');
        data.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.kategori_id;
            opt.innerText = cat.kategori_ad;
            catSelect.appendChild(opt);
        });

        // 3. Populate Strategic City Filter
        const strategicCitySelect = document.getElementById('strategicCityFilter');
        if (strategicCitySelect) {
            // Keep "All" option, verify duplicates?
            strategicCitySelect.innerHTML = '<option value="all">Tüm Şehirler</option>';
            data.cities.forEach(city => {
                const opt = document.createElement('option');
                opt.value = city.sehir_id;
                opt.innerText = city.sehir_ad;
                strategicCitySelect.appendChild(opt);
            });

            // Listen for changes specifically on this filter
            strategicCitySelect.addEventListener('change', () => {
                const period = document.getElementById('periodFilter').value;
                const strategicCity = strategicCitySelect.value;
                // Only reload Strategic part
                const query = `?ay=${period}&sehir_id=${strategicCity}`;
                loadStrategicPlanning(query);
            });
        }

        // Add Event Listener to City to filter Markets
        citySelect.addEventListener('change', () => {
            const selectedCityId = citySelect.value;
            marketSelect.innerHTML = '<option value="all">Tüm Şubeler</option>';
            window.allMarkets.forEach(m => {
                if (selectedCityId === 'all' || m.sehir_id == selectedCityId) {
                    const opt = document.createElement('option');
                    opt.value = m.market_id;
                    opt.innerText = m.market_ad;
                    marketSelect.appendChild(opt);
                }
            });
        });

    } catch (err) {
        console.error('Filtreler yüklenemedi', err);
    }
}

// Main Update Function
async function updateDashboard() {
    const period = document.getElementById('periodFilter').value;
    const city = document.getElementById('cityFilter').value;
    const market = document.getElementById('marketFilter').value;
    const category = document.getElementById('categoryFilter').value;

    const query = `?ay=${period}&sehir_id=${city}&market_id=${market}&kategori_id=${category}`;

    const strategicView = document.getElementById('view-strategic');
    const isStrategicVisible = strategicView && strategicView.style.display !== 'none';

    if (isStrategicVisible) {
        // Strategic uses its OWN city filter, but maybe shares Period?
        // User request: "Statejik planlama sayfası için de şehirler filtresi olsun"
        // Implicitly: It ignores the global city filter? Yes.
        const stratCity = document.getElementById('strategicCityFilter').value;
        const stratQuery = `?ay=${period}&sehir_id=${stratCity}`;
        loadStrategicPlanning(stratQuery);
    } else {
        // Load normal dashboard stuff
        loadStats(query);
        loadTrendChart(query, period);

        const productData = await loadTopProducts(query);
        // FORCE REDRAW breakdown charts (Fixes Pie Chart bug)
        // Ensure canvas is cleared or destroyed properly in loadBreakdownCharts (already handled)
        loadBreakdownCharts(query, productData);
    }
}

// Helper to get text for period label
function getPeriodLabel(val) {
    if (val === 'all') return 'Tüm Zamanlar';
    if (val.length === 4) return `${val} Yılı`;
    return `Son ${val} Ay`;
}

// 1. Stats Cards
async function loadStats(query) {
    try {
        const res = await fetch(`${API_URL}/dashboard/stats${query}`);
        const data = await res.json();
        const fmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

        document.getElementById('totalRevenue').innerText = fmt.format(data.toplam_ciro);

        // Updated to Best Product
        document.getElementById('bestProduct').innerText = data.en_cok_satan_urun;

        document.getElementById('bestBranch').innerText = data.en_iyi_sube;

        // Update Label
        const periodVal = document.getElementById('periodFilter').value;
        document.getElementById('revenuePeriodLabel').innerText = getPeriodLabel(periodVal);

    } catch (err) {
        console.error(err);
    }
}
// 2. Trend Chart (History only as requested "Sales Trend")
async function loadTrendChart(query, period) {
    try {
        // We only fetch history now since title is "Sales Trend" and user wants to see selected period
        const resHistory = await fetch(`${API_URL}/dashboard/sales-over-time${query}`);
        const historyData = await resHistory.json();

        const ctx = document.getElementById('trendChart').getContext('2d');

        const labels = historyData.map(h => h.ay);
        const historyValues = historyData.map(h => parseFloat(h.toplam_ciro));

        if (trendChartInstance) trendChartInstance.destroy();

        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Satış Ciro',
                        data: historyValues,
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: 'white' } },
                    tooltip: { mode: 'index', intersect: false },
                    datalabels: { display: false }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                scales: {
                    x: { grid: { color: '#333' }, ticks: { color: '#aaa' } },
                    y: { grid: { color: '#333' }, ticks: { color: '#aaa' } }
                }
            }
        });

    } catch (err) {
        console.error('Trend Chart Error:', err);
    }
}

// Register the plugin if available
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// 3. Breakdown Charts (Pie, Bar, City Bar)
async function loadBreakdownCharts(query, productData = null) {
    try {
        const res = await fetch(`${API_URL}/dashboard/breakdown${query}`);
        const data = await res.json();

        // CATEGORY PIE CHART LOGIC
        // If a Category is selected in the filter, we show Product Distribution instead!
        const categoryFilter = document.getElementById('categoryFilter').value;
        const isCategorySelected = categoryFilter && categoryFilter !== 'all';

        let pieLabels = [];
        let pieData = [];
        let pieTitle = 'Kategori Dağılımı';

        if (isCategorySelected && productData && productData.length > 0) {
            // Show Products
            pieTitle = 'Ürün Dağılımı';
            pieLabels = productData.map(p => p.urun_ad);
            pieData = productData.map(p => parseFloat(p.toplam_ciro));
        } else {
            // Show Categories
            pieLabels = data.categories.map(c => c.kategori_ad);
            pieData = data.categories.map(c => parseFloat(c.ciro));
        }

        // Update Chart Title in DOM if possible (optional, but good for UX)
        // Finding h3 above canvas logic could go here, but omitted for simplicity unless user asked.

        const ctxCat = document.getElementById('categoryChart');
        if (ctxCat) {
            if (categoryChartInstance) categoryChartInstance.destroy();

            const sum = pieData.reduce((a, b) => a + b, 0);

            categoryChartInstance = new Chart(ctxCat.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: pieLabels,
                    datasets: [{
                        data: pieData,
                        backgroundColor: [
                            '#00d4ff', '#ff0055', '#00ff9d', '#ffb700', '#9d00ff', '#ff5722',
                            '#00bcd4', '#e91e63', '#4caf50', '#ffc107', '#673ab7', '#ff9800',
                            '#03a9f4', '#f44343', '#8bc34a', '#ffeb3b', '#3f51b5', '#ff5722' // More colors for products
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: 'white' } },
                        datalabels: {
                            color: '#fff',
                            font: { weight: 'bold', size: 12 },
                            formatter: (value, ctx) => {
                                if (sum === 0) return '0%';
                                let percentage = ((value / sum) * 100).toFixed(1) + "%";
                                return percentage;
                            },
                        }
                    }
                }
            });
        }

        // BRANCH BAR CHART (ALL BRANCHES)
        const ctxBranch = document.getElementById('branchChart');
        if (ctxBranch) {
            if (branchChartInstance) branchChartInstance.destroy();
            branchChartInstance = new Chart(ctxBranch.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.markets.map(m => m.market_ad),
                    datasets: [{
                        label: 'Ciro',
                        data: data.markets.map(m => parseFloat(m.ciro)),
                        backgroundColor: '#00ff9d',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // For scroll
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false } // Disable numbers on chart
                    },
                    scales: {
                        y: { grid: { color: '#333' }, ticks: { color: '#aaa' } },
                        x: { grid: { display: false }, ticks: { color: '#aaa', autoSkip: false, maxRotation: 90 } }
                    }
                }
            });
        }


        // CITY CHART REMOVED

    } catch (err) {
        console.error(err);
    }
}

// ==========================================
// 4. STRATEGIC PLANNING LOGIC
// ==========================================

async function loadStrategicPlanning(query = '') {
    // 1. Trend Analysis (Replaces Forecast)
    loadTrendAnalysis(query);
    // 2. Branch Performance
    loadBranchPerformance(query);
    // 3. Location Analysis
    loadLocationAnalysis(query);
}

// 4.1 Trend Analysis
async function loadTrendAnalysis(query) {
    try {
        const res = await fetch(`${API_URL}/strategic/trend-analysis${query}`);
        const data = await res.json();

        const renderList = (items, containerId, icon, colorClass) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';

            if (items.length === 0) {
                container.innerHTML = '<div style="color:#666; font-style:italic;">Veri yok</div>';
                return;
            }

            items.forEach(item => {
                const div = document.createElement('div');
                div.style.marginBottom = '8px';
                div.style.padding = '8px';
                div.style.background = 'rgba(255,255,255,0.03)';
                div.style.borderRadius = '4px';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';

                div.innerHTML = `
                    <span>${item.name}</span>
                    <strong style="color:var(--${colorClass}-color)">
                        ${icon} %${Math.abs(item.change)}
                    </strong>
                `;
                container.appendChild(div);
            });
        };

        renderList(data.risers, 'trendRisingList', '▲', 'success');
        renderList(data.fallers, 'trendFallingList', '▼', 'danger');

    } catch (err) {
        console.error('Trend Analysis Error:', err);
    }
}

// 4.2 Branch Performance
async function loadBranchPerformance(query) {
    // ... (Existing implementation, ensure query is passed)
    try {
        const res = await fetch(`${API_URL}/strategic/branch-performance${query}`);
        const data = await res.json();
        const tbody = document.getElementById('branchPerformanceBody');
        if (tbody) {
            tbody.innerHTML = '';
            data.forEach(item => {
                // ... (reuse badge logic)
                let badgeStyle = "padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold;";
                if (item.status === 'danger') badgeStyle += "background:rgba(255, 0, 0, 0.2); color:#ff5555;";
                else if (item.status === 'warning') badgeStyle += "background:rgba(255, 165, 0, 0.2); color:orange;";
                else if (item.status === 'info') badgeStyle += "background:rgba(0, 255, 255, 0.2); color:#00ffff;";
                else badgeStyle += "background:#333; color:#aaa;";

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:10px;">
                        <div style="font-weight:bold;">${item.market_ad}</div>
                        <div style="font-size:12px; color:#888;">${item.sehir}</div>
                    </td>
                    <td style="padding:10px;">
                        <div style="font-size:16px;">%${item.verimlilik}</div>
                        <small style="color:#666;">Sepet: ₺${item.sepet_ort.toFixed(1)}</small>
                    </td>
                    <td style="padding:10px;">
                        <span style="${badgeStyle}">${item.recommendation}</span>
                    </td>
                `;
                tr.style.borderBottom = '1px solid #333';
                tbody.appendChild(tr);
            });
        }
    } catch (e) { console.error(e); }
}

// 4.3 Location Analysis
async function loadLocationAnalysis(query) {
    try {
        const res = await fetch(`${API_URL}/strategic/location-analysis${query}`);
        const data = await res.json();

        const container = document.getElementById('locationOpportunities');
        if (container) {
            container.innerHTML = '';
            data.forEach(item => {
                let borderColor = '#333';
                if (item.signal === 'success') borderColor = 'var(--success-color)';
                if (item.signal === 'danger') borderColor = 'var(--danger-color)';
                if (item.signal === 'info') borderColor = '#00d4ff';

                const div = document.createElement('div');
                div.style.cssText = `
                    background: linear-gradient(90deg, #1a1a1a 0%, #222 100%);
                    border-left: 4px solid ${borderColor};
                    padding: 12px;
                    border-radius: 4px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                `;
                div.innerHTML = `
                    <div>
                        <div style="font-weight:bold; font-size:16px;">${item.ilce} <small style="color:#666;">(${item.sehir})</small></div>
                        <div style="font-size:12px; color:#aaa; margin-top:4px;">
                            Mevcut Şube: ${item.sube_sayisi} | Potansiyel: <strong>${item.potansiyel_skoru}</strong>
                        </div>
                    </div>
                    <div style="text-align:right;">
                         <div style="font-size:13px; font-weight:bold; color:${borderColor === '#333' ? '#aaa' : borderColor};">
                            ${item.recommendation}
                         </div>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    } catch (err) {
        console.error('Location Error:', err);
    }
}
