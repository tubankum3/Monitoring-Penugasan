/* ── Konfigurasi Aplikasi Berbasis Google Sheets API ── */
const SHEET_ID = '1FOltLmWhUQ7Ouorzu1yHJsFmbzN45a_PpAiSkuuFUOA';
let currentSheet = 'ST Perkara';
let currentFilter = 'all';
let allData = [];

// Kueri Spesifik untuk Membatasi Kolom
const SHEET_QUERIES = {
    'ST Perkara': 'SELECT A,B,C,D,E,F,G',
    'ST Pendampingan': 'SELECT A,B,C,D,E',
    'ST Lain-Lain': 'SELECT A,B,C,D,E'
};

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

/* ── Penarikan Data Dan Rendering Tabel Dinamis ── */
async function fetchData() {
    const tqStr = SHEET_QUERIES[currentSheet] || 'SELECT *';
    // Parameter headers=1 memastikan baris 1 selalu dibaca sebagai judul kolom
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&tq=${encodeURIComponent(tqStr)}&sheet=${encodeURIComponent(currentSheet)}`;
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head-row');
    
    try {
        const response = await fetch(url);
        const text = await response.text();
        
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const json = JSON.parse(jsonString);
        
        if (json.status === 'error') {
            const errMsg = (json.errors && json.errors[0] && json.errors[0].message) ? json.errors[0].message : "Kesalahan Tidak Diketahui";
            throw new Error(`Google API: ${errMsg}`);
        }
        
        allData = json.table; 
        renderTable();
    } catch (e) {
        console.error("Kesalahan Sistem:", e);
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td style="text-align:center; padding: 30px; color:#ff6b6b;"><strong>Gagal memuat data.</strong><br><br>Detail Error: ${e.message}</td></tr>`;
    }
}

function renderTable() {
    const thead = document.getElementById('table-head-row');
    const tbody = document.getElementById('table-body');
    thead.innerHTML = ''; 
    tbody.innerHTML = '';

    if (!allData || !allData.cols) {
        tbody.innerHTML = `<tr><td style="text-align:center; padding: 30px; color:#8C9CAE;">Struktur data tabel kosong atau tidak ditemukan.</td></tr>`;
        return;
    }

    // Menggambar Header berdasarkan batas kolom
    allData.cols.forEach((col, index) => {
        const headerText = (col && col.label) ? col.label : `Kolom ${index + 1}`;
        thead.innerHTML += `<th>${headerText}</th>`;
    });

    const dateIdx = SHEET_DATE_INDEXES[currentSheet];
    let visibleRows = 0;

    allData.rows.forEach(row => {
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
            
            // Loop data selaras dengan batas header/kolom yang ditarik
            allData.cols.forEach((colDef, index) => {
                const cell = (index < row.c.length && row.c[index] !== null) ? row.c[index] : null;
                const displayValue = cell ? (cell.f ? cell.f : cell.v) : '-';
                tr += `<td>${displayValue}</td>`;
            });
            
            tr += '</tr>';
            tbody.innerHTML += tr;
        }
    });

    if (visibleRows === 0) {
        tbody.innerHTML = `<tr><td colspan="${allData.cols.length}" style="text-align:center; padding: 40px; color:#8C9CAE;">Tidak ada data penugasan aktif untuk rentang waktu ini.</td></tr>`;
    }

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

        progress.style.width = `${(container.scrollTop / maxScroll) * 100}%`;

        // Deteksi dasar tabel
        if (container.scrollTop >= maxScroll - 1) {
            container.scrollTop = maxScroll;
            progress.style.width = '100%';
            pausing = true;
            
            // Berhenti 4 detik di baris terbawah
            setTimeout(() => {
                // Lompat instan ke paling atas
                container.scrollTop = 0;
                progress.style.width = '0%';
                
                // Berhenti 2 detik di baris teratas sebelum mulai menggulir turun lagi
                setTimeout(() => {
                    pausing = false;
                }, 2000);
            }, 4000);
        } else {
            // Gulir turun
            container.scrollTop += 1; 
        }
    }, 30); 
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
        renderTable(); 
    });
});

/* ── Inisialisasi Boot Awal Aplikasi ── */
initClock();
fetchData();
initAutoScroll();

// Sinkronisasi data ke Google Sheets setiap 15 menit
setInterval(fetchData, 900000);
