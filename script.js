/* ── Konfigurasi Aplikasi Berbasis Google Sheets API ── */
const SHEET_ID = '1FOltLmWhUQ7Ouorzu1yHJsFmbzN45a_PpAiSkuuFUOA';
let currentFilter = 'today'; // Default filter diatur langsung ke Hari Ini

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
    if (!clockEl || !dateEl) return; // Pelindung jika elemen HTML tidak ditemukan

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
    
    let str = String(dateString).trim().toLowerCase();
    str = str.replace(/\s*s\.d\.\s*/g, '|')  
             .replace(/\s*s\.d\s*/g, '|')    
             .replace(/\s*-\s*/g, '|');      

    const splitParts = (s) => s.trim().split(/\s+/);

    if (str.includes('|')) {
        const sides = str.split('|');
        const leftParts = splitParts(sides[0]);  
        const rightParts = splitParts(sides[1]); 

        if (rightParts.length < 3) return null; 
        const endDay = parseInt(rightParts[0]);
        const endMonthIdx = idMonths[rightParts[1]];
        const endYear = parseInt(rightParts[2]);

        if (isNaN(endDay) || endMonthIdx === undefined || isNaN(endYear)) return null;
        const endDt = new Date(endYear, endMonthIdx, endDay);

        let startDt;
        if (leftParts.length === 1) {
            const startDay = parseInt(leftParts[0]);
            if (isNaN(startDay)) return null;
            startDt = new Date(endYear, endMonthIdx, startDay);
        } else if (leftParts.length === 3) {
            const startDay = parseInt(leftParts[0]);
            const startMonthIdx = idMonths[leftParts[1]];
            const startYear = parseInt(leftParts[2]);
            if (isNaN(startDay) || startMonthIdx === undefined || isNaN(startYear)) return null;
            startDt = new Date(startYear, startMonthIdx, startDay);
        } else {
            return null; 
        }

        if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) return null;
        return { start: normalizeDate(startDt), end: normalizeDate(endDt) };
    }
    
    const parts = splitParts(str);
    if (parts.length < 3) return null;
    
    const day = parseInt(parts[0]);
    const monthIdx = idMonths[parts[1]];
    const year = parseInt(parts[2]);
    
    if (isNaN(day) || monthIdx === undefined || isNaN(year)) return null;
    
    const singleDt = new Date(year, monthIdx, day);
    if (isNaN(singleDt.getTime())) return null;
    
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

/* ── Pemrosesan & Rendering Bertumpuk Terproteksi ── */
function renderAllTables() {
    // Diproses satu per satu dengan proteksi try-catch terisolasi agar kegagalan satu tabel tidak mematikan tabel lain
    try { renderIndividualTable('ST Perkara', 'head-st-perkara', 'body-st-perkara'); } catch(e) { console.error(e); }
    try { renderIndividualTable('ST Pendampingan', 'head-st-pendampingan', 'body-st-pendampingan'); } catch(e) { console.error(e); }
    try { renderIndividualTable('ST Lain-Lain', 'head-st-lain-lain', 'body-st-lain-lain'); } catch(e) { console.error(e); }
}

function renderIndividualTable(sheetName, headId, bodyId) {
    const thead = document.getElementById(headId);
    const tbody = document.getElementById(bodyId);
    
    // PELINDUNG SILENT FAIL: Jika ID salah ketik di HTML, laporkan ke console tanpa menghentikan aplikasi
    if (!thead || !tbody) {
        console.error(`Peringatan: Elemen dengan ID '${headId}' atau '${bodyId}' tidak ditemukan di HTML.`);
        return;
    }

    thead.innerHTML = ''; 
    tbody.innerHTML = '';

    const tableData = sheetsStorage[sheetName];

    if (!tableData || !tableData.cols) {
        thead.innerHTML = `<th>Koneksi Bermasalah</th>`;
        tbody.innerHTML = `<tr><td style="color:#ff6b6b; padding:20px; font-size:20px;">Gagal menarik data atau lembar kerja kosong.</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="${tableData.cols.length}" style="text-align:center; padding: 40px; color:#8C9CAE; font-size:21px;">Tidak ada data penugasan aktif untuk hari ini.</td></tr>`;
    }
}

/* ── Logika Putaran Gulir Otomatis Seluruh Halaman ── */
function initAutoScroll() {
    const container = document.getElementById('data-container');
    const progress = document.getElementById('progress-bar');
    if (!container || !progress) return;

    let pausing = false;

    setInterval(() => {
        if (pausing) return;
        
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        if (maxScroll <= 0) {
            progress.style.width = '0%';
            return;
        }

        progress.style.width = `${(container.scrollTop / maxScroll) * 100}%`;

        if (container.scrollTop >= maxScroll - 1) {
            container.scrollTop = maxScroll;
            progress.style.width = '100%';
            pausing = true;
            
            setTimeout(() => {
                container.scrollTop = 0;
                progress.style.width = '0%';
                setTimeout(() => pausing = false, 2000);
            }, 4000);
        } else {
            container.scrollTop += 1; 
        }
    }, 30); 
}

/* ── Inisialisasi Siklus Hidup Aplikasi Terproteksi ── */
window.onload = () => {
    initClock();
    fetchAllSheetsData();
    initAutoScroll();

    // Event Listener Kendali Filter Periode Waktu
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            currentFilter = e.target.getAttribute('data-filter');
            renderAllTables(); 
            const container = document.getElementById('data-container');
            if (container) container.scrollTop = 0; 
        });
    });
};

// Melakukan sinkronisasi ulang data di latar belakang ke Google Sheets tiap 15 menit
setInterval(fetchAllSheetsData, 900000);
