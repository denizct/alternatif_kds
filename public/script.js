const loginForm = document.getElementById('loginForm');

// Giriş İşlemi
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (data.success) {
            localStorage.setItem('user', data.user);
            window.location.href = 'panel.html';
        } else {
            document.getElementById('message').innerText = data.message;
            document.getElementById('message').style.color = 'red';
        }
    });
}

// Panel İşlemleri
if (window.location.pathname.includes('panel.html')) {
    document.getElementById('adminName').innerText = localStorage.getItem('user') || 'Yönetici';
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

async function getMarketReport() {
    const res = await fetch('/api/rapor-market');
    const data = await res.json();
    
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = ''; // Temizle
    
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${row.market_ad}</td><td>${parseFloat(row.toplam_ciro).toLocaleString('tr-TR')} ₺</td>`;
        tbody.appendChild(tr);
    });
    
    document.getElementById('reportResult').style.display = 'block';
}