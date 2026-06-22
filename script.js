/* ── Konfigurasi Aplikasi Berbasis Google Sheets API ── */
const SHEET_ID = '1FOltLmWhUQ7Ouorzu1yHJsFmbzN45a_PpAiSkuuFUOA';
let currentSheet = 'ST Perkara';
let currentFilter = 'all';
let allData = []; // Menyimpan data dari sheet yang sedang aktif

// Peta Dinamis Indeks Kolom Tanggal (0 = Kolom A, 1 = Kolom B, dst.)
const SHEET_DATE_INDEXES = {
    'ST Perkara': 3,       // Kolom D (Indeks 3)
    'ST Pendampingan': 2,  // Kolom C (Indeks 2)
    'ST Lain-Lain': 2      // Kolom C (Indeks 2)
};

/* ── Jam & Tanggal Real-time Biro Advokasi ── */
function initClock() {
    const clockEl = document.getElementById('clock-display');
    const dateEl  = document.getElementById('date-display');
    const DAYS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    setInterval(() => {
        const now = new Date();
        clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        dateEl.textContent = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    }, 1000);
}

/* ── Logika Parser & Penyaringan Rentang Tanggal Indonesia ── */
const idMonths = { "Januari":0, "Februari":1, "Maret":2, "April":3, "Mei":4, "Juni":5, "Juli":6, "Agustus":7, "September":8, "Oktober":9, "November":10, "Desember":11 };

function normalizeDate(dateObj) { 
    return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()); 
}

function extractDateRange(dateString) {
    if (!dateString) return null;
    
    const parse = (str) => {
        const parts = str.trim().split(' ');
        if (parts.length < 3) return null;
        return new Date(parts[2], idMonths[parts[1]], parts[0]);
    };

    // Deteksi otomatis jika data berupa rentang waktu menggunakan kata hubung "s.d."
    if (dateString.includes('s.d.')) {
        const parts = dateString.split('s.d.');
        return { start: normalizeDate(parse(parts[0])), end: normalizeDate(parse(parts[1])) };
    }
    
    const single = normalizeDate(parse(dateString));
    return { start: single, end: single };
}

function rowPassesFilter(dateString, filterType) {
    if (filterType === 'all') return true;
    
    const range = extractDateRange(dateString);
    if (!range) return false; 

    const now = normalizeDate(new Date());
    
    // Perhitungan Batas Awal & Akhir Waktu Kerja
    const startOfWeek = new Date(now); 
    startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1)); // Dimulai dari hari Senin
    const endOfWeek = new Date(startOfWeek); 
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Evaluasi kecocokan filter
    if (filterType === 'today') return (range.start <= now && range.end >= now);
    if (filterType === 'thisWeek') return (range.start <= endOfWeek && range.end >= startOfWeek);
    if (filterType === 'thisMonth') return (range.start <= endOfMonth && range.end >= startOfMonth);
    
    return true;
}

/* ── Penarikan Data Dan Rendering Tabel Dinamis ── */
async function fetchData() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(currentSheet)}`;
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head-row');
    
    try {
        const response = await fetch(url);
        const text = await response.text();
        const json = JSON.parse(text.substring(47).slice(0, -2)); // Membersihkan bungkus teks API Google Viz
        
        allData = json.table; 
        renderTable();
    } catch (e) {
        console.error("Fetch error:", e);
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td style="text-align:center; padding: 30px; color:#ff6b6b;">Gagal memuat data. Pastikan Google Sheet Anda diatur ke hak akses: "Anyone with the link can view".</td></tr>`;
    }
}

function renderTable() {
    const thead = document.getElementById('table-head-row');
    const tbody = document.getElementById('table-body');
    thead.innerHTML = ''; 
    tbody.innerHTML = '';

    if (!allData || !allData.cols) return;

    // 1. Pembuatan Kolom Header secara Otomatis
    allData.cols.forEach(col => {
        if (col.label) thead.innerHTML += `<th>${col.label}</th>`;
    });

    // 2. Ambil Indeks Kolom Tanggal Berdasarkan Sheet yang Sedang Aktif
    const dateIdx = SHEET_DATE_INDEXES[currentSheet];

    // 3. Pemuatan Baris Data dengan Filter Waktu Terpasang
    let visibleRows = 0;
    allData.rows.forEach(row => {
        const dateStr = row.c[dateIdx] ? row.c[dateIdx].v : null;
        
        if (rowPassesFilter(dateStr, currentFilter)) {
            visibleRows++;
            let tr = '<tr>';
            row.c.forEach((cell, index) => {
                if (index < allData.cols.length && allData.cols[index].label) {
                    tr += `<td>${cell ? cell.v : '-'}</td>`;
                }
            });
            tr += '</tr>';
            tbody.innerHTML += tr;
        }
    });

    if (visibleRows === 0) {
        tbody.innerHTML = `<tr><td colspan="${allData.cols.length}" style="text-align:center; padding: 40px; color:#8C9CAE;">Tidak ada data penugasan aktif untuk filter periode ini.</td></tr>`;
    }

    // Mengembalikan posisi scroll ke atas setiap kali tabel berganti tab/filter
    document.getElementById('data-container').scrollTop = 0;
}

/* ── Logika Putaran Gulir Otomatis (Auto-Scroll Loop) ── */
function initAutoScroll() {
    const container = document.getElementById('data-container');
    const progress = document.getElementById('progress-bar');
    let pausing = false;

    setInterval(() => {
        if (pausing) return;
        
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        if (maxScroll <= 0) {
            progress.style.width = '0%';
            return;
        }

        // Update indikator bar progres tipis di bawah header
        progress.style.width = `${(container.scrollTop / maxScroll) * 100}%`;

        // Deteksi jika guliran menyentuh baris data terakhir (paling bawah)
        if (container.scrollTop + 1 >= maxScroll) {
            container.scrollTop = maxScroll;
            progress.style.width = '100%';
            pausing = true;
            
            // Jeda di bawah (4 detik) -> Lompat ke atas -> Jeda di atas (2 detik) -> Mulai Gulir Lagi
            setTimeout(() => {
                container.scrollTop = 0;
                progress.style.width = '0%';
                setTimeout(() => pausing = false, 2000);
            }, 4000);
        } else {
            container.scrollTop += 1; // Gulir ke bawah sebanyak 1 piksel per tick
        }
    }, 30); // Kecepatan gulir (30ms per langkah memberikan efek gulir yang sangat halus untuk dibaca)
}

/* ── Event Listener Interaksi Pengguna ── */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        currentSheet = e.target.getAttribute('data-sheet');
        document.getElementById('table-body').innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px;">Memuat ulang data ${currentSheet}...</td></tr>`;
        fetchData();
    });
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        currentFilter = e.target.getAttribute('data-filter');
        renderTable(); // Re-render instan tanpa melakukan hit jaringan ulang
    });
});

/* ── Inisialisasi Boot Awal Aplikasi ── */
initClock();
fetchData();
initAutoScroll();

// Sinkronisasi background otomatis dengan server Google Sheets setiap 15 menit
setInterval(fetchData, 900000);
