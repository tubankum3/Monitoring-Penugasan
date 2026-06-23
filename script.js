/* ── Konfigurasi Aplikasi Berbasis Google Sheets API ── */
const SHEET_ID = '1FOltLmWhUQ7Ouorzu1yHJsFmbzN45a_PpAiSkuuFUOA';
let currentFilter = 'today'; // Default saat halaman dimuat sekarang adalah Hari Ini

// Menyimpan data mentah dari ketiga sheet setelah ditarik
let sheetsStorage = {
    'ST Perkara': null,
    'ST Pendampingan': null,
    'ST Lain-Lain': null
};

// Batasan Kolom Khusus per Sheet (A-G atau A-E)
const SHEET_QUERIES = {
    'ST Perkara': 'SELECT A,B,C,D,E,F,G',
    'ST Pendampingan': 'SELECT A,B,C,D,E',
    'ST Lain-Lain': 'SELECT A,B,C,D,E'
};

// Peta Dinamis Posisi Kolom Tanggal (0 = Kolom A, 1 = Kolom B, dst.)
const SHEET_DATE_INDEXES = {
    'ST Perkara': 3,       // Kolom D
    'ST Pendampingan': 2,  // Kolom C
    'ST Lain-Lain': 2      // Kolom C
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
const idMonths = { "januari":0, "februari":1, "maret":2, "april":3, "mei":4, "juni":5, "juli":6, "agustus":7, "september":8, "oktober":9, "november":10, "desember":11 };

function normalizeDate(dateObj) { 
    if (!dateObj || typeof dateObj.getFullYear !== 'function') return null;
    return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()); 
}

function extractDateRange(dateString) {
    if (!dateString) return null;
    const str = String(dateString).trim();

    const parse = (s) => {
        const parts = s.trim().split(/\s+/);
        if (parts.length < 3) return null; 
        const monthIdx = idMonths[parts[1].toLowerCase()];
        if (monthIdx === undefined) return null; 
        const parsedDate = new Date(parts[2], monthIdx, parts[0]);
        if (isNaN(parsedDate.getTime())) return null; 
        return parsedDate;
    };

    if (str.toLowerCase().includes('s.d.')) {
        const parts = str.toLowerCase().split('s.d.');
        const startDt = parse(parts[0]);
        const endDt = parse(parts[1]);
        if (!startDt || !endDt) return null; 
        return { start: normalizeDate(startDt), end: normalizeDate(endDt) };
    }
    
    const singleDt = parse(str);
    if (!singleDt) return null;
    return { start: normalizeDate(singleDt), end: normalizeDate(singleDt) };
}

function rowPassesFilter(dateString, filterType) {
    if (filterType === 'all') return true;
    const range = extractDateRange(dateString);
    if (!range || !range.start || !range.end) return false; 

    const now = normalizeDate(new Date());
    if (!now) return false; 
    
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const startOfWeek = new Date(currentYear, currentMonth, now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6);
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

    if (filterType === 'today') return (range.start <= now && range.end >= now);
    if (filterType === 'thisWeek') return (range.start <= endOfWeek && range.end >= startOfWeek);
    if (filterType === 'thisMonth') return (range.start <= endOfMonth && range.end >= startOfMonth);
    
    return true;
}

/* ── Penarikan Data Serentak (Parallel Promise Fetch) ── */
async function fetchAllSheetsData() {
    const sheetNames = Object.keys(sheetsStorage);
    
    const fetchPromises = sheetNames.map(async (name) => {
        const tqStr = SHEET_QUERIES[name];
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&tq=${encodeURIComponent(tqStr)}&sheet=${encodeURIComponent(name)}`;
        
        try {
            const response = await fetch(url);
            const text = await response.text();
            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const json = JSON.parse(jsonString);
            
            if (json.status === 'error') {
                const errMsg = (json.errors && json.errors[0]) ? json.errors[0].message : "Error API";
                throw new Error(`${name}: ${errMsg}`);
            }
            return { name, data: json.table };
        } catch (e) {
            console.error(`Gagal memuat tab ${name}:`, e);
            return { name, data: null, error: e.message };
        }
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(res => {
        sheetsStorage[res.name] = res.data;
    });

    renderAllTables();
}

/* ── Pemrosesan & Rendering Bertumpuk (Stacked Rendering) ── */
function renderAllTables() {
    // Jalankan kompilasi render untuk masing-masing seksi tabel secara spesifik
    renderIndividualTable('ST Perkara', 'head-st-perkara', 'body-st-perkara');
    renderIndividualTable('ST Pendampingan', 'head-st-pendampingan', 'body-st-pendampingan');
    renderIndividualTable('ST Lain-Lain', 'head-st-lain-lain', 'body-st-lain-lain');
}

function renderIndividualTable(sheetName, headId, bodyId) {
    const thead = document.getElementById(headId);
    const tbody = document.getElementById(bodyId);
    thead.innerHTML = ''; 
    tbody.innerHTML = '';

    const tableData = sheetsStorage[sheetName];

    if (!tableData || !tableData.cols) {
        thead.innerHTML = `<th>Koneksi Error</th>`;
        tbody.innerHTML = `<tr><td>Gagal memuat struktur data untuk ${sheetName}. Pastikan dokumen publik.</td></tr>`;
        return;
    }

    // 1. Gambar Baris Judul (Header)
    tableData.cols.forEach((col, index) => {
        const headerText = (col && col.label) ? col.label : `Kolom ${index + 1}`;
        thead.innerHTML += `<th>${headerText}</th>`;
    });

    // 2. Filter & Gambar Baris Isi Data
    const dateIdx = SHEET_DATE_INDEXES[sheetName];
    let visibleRows = 0;

    tableData.rows.forEach(row => {
        if (!row || !row.c) return;

        let dateStr = null;
        if (row.c.length > dateIdx && row.c[dateIdx] !== null) {
            const cellData = row.c[dateIdx];
            const rawVal = cellData.f ? cellData.f : cellData.v;
            dateStr = rawVal ? String(rawVal) : null;
        }

        if (rowPassesFilter(dateStr, currentFilter)) {
            visibleRows++;
            let tr = '<tr>';
            tableData.cols.forEach((colDef, index) => {
                const cell = (index < row.c.length && row.c[index] !== null) ? row.c[index] : null;
                const displayValue = cell ? (cell.f ? cell.f : cell.v) : '-';
                tr += `<td>${displayValue}</td>`;
            });
            tr += '</tr>';
            tbody.innerHTML += tr;
        }
    });

    if (visibleRows === 0) {
        tbody.innerHTML = `<tr><td colspan="${tableData.cols.length}" style="text-align:center; padding: 40px; color:#8C9CAE; font-size:24px;">Tidak ada data penugasan pada kategori ini.</td></tr>`;
    }
}

/* ── Logika Putaran Gulir Otomatis Seluruh Halaman (Full Stack Auto-Scroll Loop) ── */
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

        progress.style.width = `${(container.scrollTop / maxScroll) * 100}%`;

        // Deteksi jika guliran menyentuh baris akhir terbawah tabel ke-3
        if (container.scrollTop >= maxScroll - 1) {
            container.scrollTop = maxScroll;
            progress.style.width = '100%';
            pausing = true;
            
            // Jeda 4 detik di dasar halaman, lalu melompat instan ke awal tabel ke-1
            setTimeout(() => {
                container.scrollTop = 0;
                progress.style.width = '0%';
                
                // Jeda 2 detik di puncak halaman sebelum mulai berjalan kembali
                setTimeout(() => {
                    pausing = false;
                }, 2000);
            }, 4000);
        } else {
            container.scrollTop += 1; 
        }
    }, 30); 
}

/* ── Event Listener Kendali Filter Periode Waktu ── */
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        currentFilter = e.target.getAttribute('data-filter');
        renderAllTables(); // Re-render bertumpuk secara instan tanpa membebani jaringan ulang
        document.getElementById('data-container').scrollTop = 0; // Kembalikan ke atas seksi ke-1
    });
});

/* ── Inisialisasi Boot Awal Aplikasi Ekplorer ── */
initClock();
fetchAllSheetsData();
initAutoScroll();

// Melakukan sinkronisasi ulang data di latar belakang ke Google Sheets tiap 15 menit
setInterval(fetchAllSheetsData, 900000);
