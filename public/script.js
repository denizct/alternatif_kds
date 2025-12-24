Chart.defaults.color = '#000000';
Chart.defaults.borderColor = '#e5e7eb';
Chart.defaults.font.size = 14;
Chart.defaults.font.weight = 'bold';

const API_URL = 'http://localhost:3000/api';

// Global Chart Instances
let trendChartInstance = null;
let categoryChartInstance = null;
let marketChartInstance = null;

// No Map Coords needed anymore

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    if (document.getElementById('welcomeUser')) {
        const user = localStorage.getItem('user');
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        document.getElementById('welcomeUser').innerText = user;
        initDashboard();
    }

    // Login Handler
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
                }
            } catch (error) {
                console.error('Login Error:', error);
                alert("Sunucuya bağlanılamadı! Lütfen sunucunun çalıştığından emin olun.");
            }
        });
    }
});

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

function switchView(viewId, element) {
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');

    document.querySelectorAll('.view-section').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(viewId).style.display = viewId === 'view-executive' ? 'flex' : 'block';

    if (viewId === 'view-strategic') {
        loadStrategicPlanning();
    } else {
        updateDashboard();
    }
}

async function initDashboard() {
    await loadFilters();
    updateDashboard();
}

async function loadFilters() {
    try {
        const res = await fetch(`${API_URL}/filters`);
        const data = await res.json();

        const citySelect = document.getElementById('cityFilter');
        data.cities.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city.sehir_id;
            opt.innerText = city.sehir_ad;
            citySelect.appendChild(opt);
        });



    } catch (err) { console.error('Filter Error', err); }
}

// MAIN UNIFIED UPDATE FUNCTION
async function updateDashboard() {
    // 1. Check if Strategic View is active
    const strategicView = document.getElementById('view-strategic');
    if (strategicView && strategicView.style.display !== 'none') {
        loadStrategicPlanning();
        return;
    }

    const period = document.getElementById('periodFilter').value;
    const city = document.getElementById('cityFilter').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    const query = `?ay=${period}&sehir_id=${city}&startDate=${startDate}&endDate=${endDate}`;

    const label = period === 'all' ? 'Tüm Zamanlar' :
        (period.length === 4 ? `${period} Yılı` : `Son ${period} Ay`);
    document.getElementById('revenuePeriodLabel').innerText = label;

    try {
        // Removed Map Data Fetch
        const [statsData, trendData, breakdownData, topProducts, warningData] = await Promise.all([
            fetch(`${API_URL}/dashboard/stats${query}`).then(r => r.json()),
            fetch(`${API_URL}/dashboard/sales-over-time${query}`).then(r => r.json()),
            fetch(`${API_URL}/dashboard/breakdown${query}`).then(r => r.json()),
            fetch(`${API_URL}/dashboard/top-products${query}`).then(r => r.json()),
            fetch(`${API_URL}/strategic/trend-analysis${query}`).then(r => r.json())
        ]);

        renderKPIs(statsData, warningData);
        renderTrend(trendData);
        renderDonut(breakdownData.categories);
        renderBar(breakdownData.markets);
        renderTopList(topProducts);

    } catch (err) {
        console.error("Dashboard Sync Error:", err);
    }
}

function renderKPIs(data, warningData) {
    const fmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

    document.getElementById('totalRevenue').innerText = fmt.format(data.toplam_ciro);
    document.getElementById('totalSalesCount').innerText = parseInt(data.toplam_satis_adedi).toLocaleString();
    document.getElementById('bestBranch').innerText = data.en_iyi_sube;

    const critical = warningData.fallers && warningData.fallers.length > 0 ? warningData.fallers[0] : null;
    if (critical) {
        document.getElementById('criticalStock').innerHTML = `
            ${critical.name} <br>
            <span style="font-size:12px">▼ ${Math.abs(critical.change)}% Düşüş</span>
        `;
    } else {
        document.getElementById('criticalStock').innerText = "Risk Yok";
        document.getElementById('criticalStock').style.color = "var(--success-color)";
    }
}

// Removed function renderMap(locationData) 

function renderTrend(data) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.ay),
            datasets: [{
                label: 'Satış Ciro',
                data: data.map(d => parseFloat(d.toplam_ciro)),
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#0f172a',
                pointBorderColor: '#0ea5e9',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                // Disable Datalabels explicitly for readability
                datalabels: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#ccc',
                    borderColor: '#334155',
                    borderWidth: 1
                }
            },
            scales: {
                x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderDonut(categories) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();

    // Calculate total for percentages
    const total = categories.reduce((sum, c) => sum + parseFloat(c.ciro), 0);

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories.map(c => c.kategori_ad),
            datasets: [{
                data: categories.map(c => parseFloat(c.ciro)),
                backgroundColor: [
                    '#0ea5e9', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'
                ],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 12 } } },
                // Enable Percentages Inside
                datalabels: {
                    color: '#ffffff',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value, ctx) => {
                        let percentage = ((value / total) * 100).toFixed(0) + "%";
                        return percentage;
                    },
                    anchor: 'center',
                    align: 'center',
                    // Hide label if segment is too small to avoid clutter
                    display: function (context) {
                        return context.dataset.data[context.dataIndex] > (total * 0.05);
                    }
                }
            },
            cutout: '60%' // Sligthly thicker donut for labels
        }
    });
}

function renderBar(markets) {
    const ctx = document.getElementById('marketChart').getContext('2d');
    if (marketChartInstance) marketChartInstance.destroy();

    // Top 7 Markets Only
    const topMarkets = markets.slice(0, 7);

    marketChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topMarkets.map(m => m.market_ad),
            datasets: [{
                label: 'Ciro',
                data: topMarkets.map(m => parseFloat(m.ciro)),
                backgroundColor: (context) => {
                    const value = context.raw;
                    if (!value) return '#94a3b8'; // Default Gray

                    const values = topMarkets.map(m => parseFloat(m.ciro));
                    const max = Math.max(...values);
                    const min = Math.min(...values);

                    // Simple Logic: 
                    // High (> 70% of max) -> Green
                    // Mid (> 40% of max) -> Blue
                    // Low -> Red/Gray

                    if (value > max * 0.75) return '#059669'; // Vivid Green (Top)
                    if (value > max * 0.40) return '#3b82f6'; // Blue (Avg)
                    return '#ef4444'; // Red (Alarm)
                },
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal Bar
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { display: false }
            },
            scales: {
                x: { display: false }, // Clean look
                y: { grid: { display: false }, ticks: { color: '#cbd5e1' } }
            }
        }
    });
}

function renderTopList(products) {
    const tbody = document.getElementById('topProductsBody');
    tbody.innerHTML = '';
    const top5 = products.slice(0, 5);
    const fmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

    top5.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:12px; color:#fff; font-weight:500;">${p.urun_ad}</td>
            <td style="padding:12px; color:#94a3b8;">${p.kategori_ad}</td>
            <td style="padding:12px; color:#cbd5e1;">${p.toplam_adet}</td>
            <td style="padding:12px; color:var(--accent-color); font-weight:bold;">${fmt.format(p.toplam_ciro)}</td>
        `;
        tr.style.borderBottom = '1px solid #334155';
        tbody.appendChild(tr);
    });
}

// CHART.JS OKUNABİLİRLİK ZORLAMASI (Global Black)
Chart.defaults.color = '#000000';
Chart.defaults.font.weight = 'bold';
Chart.defaults.font.size = 14;

// Eksenlerdeki (X ve Y) sayıların rengi
Chart.defaults.scale.ticks.color = '#000000';
Chart.defaults.scale.ticks.font.weight = 'bold';

// Lejant (Legend) etiketlerinin rengi
Chart.defaults.plugins.legend.labels.color = '#000000';
Chart.defaults.plugins.legend.title.color = '#000000';

// === STRATEGIC PAGE LOGIC (Kept Separate) ===
async function loadStrategicPlanning() {
    const period = document.getElementById('periodFilter').value;
    const city = document.getElementById('cityFilter').value; // Use Global Filter
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    let query = `?ay=${period}&sehir_id=${city}`;
    if (startDate && endDate) {
        query += `&startDate=${startDate}&endDate=${endDate}`;
    }

    try {
        const [trend, perf, loc] = await Promise.all([
            fetch(`${API_URL}/strategic/trend-analysis${query}`).then(r => r.json()),
            fetch(`${API_URL}/strategic/branch-performance${query}`).then(r => r.json()),
            fetch(`${API_URL}/strategic/location-analysis${query}`).then(r => r.json())
        ]);

        // 1. Trend
        const renderTrendList = (list, id, icon, color) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = list.length ? '' : '<small>Veri yok</small>';
            list.forEach(i => {
                el.innerHTML += `
                    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(0,0,0,0.1)">
                        <span>${i.name}</span>
                        <strong style="color:var(--${color}-color)">${icon} %${Math.abs(i.change)}</strong>
                    </div>
                `;
            });
        };
        renderTrendList(trend.risers, 'trendRisingList', '▲', 'success');
        renderTrendList(trend.fallers, 'trendFallingList', '▼', 'danger');

        // 2. Performance Matrix
        const perfBody = document.getElementById('branchPerformanceBody');
        perfBody.innerHTML = '';
        perf.forEach(p => {
            // Map status to new badge classes
            let badgeClass = 'badge-normal'; // Default Blue (covers 'success' normal case)

            if (p.status === 'info' || p.recommendation.includes('YILDIZ')) badgeClass = 'badge-firsat'; // Green (Award)
            if (p.status === 'danger') badgeClass = 'badge-doygun'; // Red (Risk)
            if (p.status === 'warning') badgeClass = 'badge-gelisim'; // Orange (Watch)
            // 'success' status (Normal) falls to default badge-normal (Blue)

            perfBody.innerHTML += `
                <tr style="border-bottom:1px solid #e5e7eb">
                    <td style="padding:12px;">
                        <div style="font-weight:bold;">${p.market_ad}</div>
                        <div style="font-size:12px; color:#4b5563;">${p.sehir}</div>
                    </td>
                    <td style="padding:12px;">
                        <span style="font-size:16px; font-weight:bold; color:#000;">%${p.verimlilik}</span>
                    </td>
                    <td style="padding:12px;">
                         <span class="badge ${badgeClass}">
                            ${p.recommendation}
                         </span>
                    </td>
                </tr>
            `;
        });

        // 3. Location Opps
        // 3. Location Opps
        const locContainer = document.getElementById('locationOpportunities');
        locContainer.innerHTML = '';
        loc.forEach(l => {
            // Map signal/text to new badge classes and Border Colors
            let badgeClass = 'badge-normal'; // Default Yellow
            let borderColor = '#eab308';     // Default Yellow Border for NÖTR

            if (l.signal === 'success') {
                badgeClass = 'badge-firsat'; // Green
                borderColor = '#10b981';
            } else if (l.signal === 'danger') {
                badgeClass = 'badge-doygun'; // Red
                borderColor = '#ef4444';
            } else if (l.recommendation.toUpperCase().includes('GELİŞİME')) {
                badgeClass = 'badge-gelisim'; // Orange
                borderColor = '#f97316'; // Force Vivid Orange Border
            }

            locContainer.innerHTML += `
                <div style="background:var(--card-bg); border-left:4px solid ${borderColor}; padding:12px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold; font-size:15px; color:#000;">
                            ${l.ilce} 
                            <span style="font-weight:normal; font-size:12px; color:#4b5563; margin-left:4px;">
                                (Nüfus: ${new Intl.NumberFormat('tr-TR').format(l.nufus)})
                            </span>
                        </div>
                        <div style="font-size:12px; color:#000; margin-top:2px;">
                            Kişi Başı Ciro: <strong>₺${l.kisi_basi_ciro}</strong>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div class="badge ${badgeClass}" style="margin-bottom:4px;">${l.recommendation}</div>
                        <br>
                        <small style="color:#000; font-weight:bold;">Penetrasyon: %${l.potansiyel_skoru}</small>
                    </div>
                </div>
            `;
        });

    } catch (err) { console.error('Strategic Load Error', err); }
}

// Ensure Plugin is Registered
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}
