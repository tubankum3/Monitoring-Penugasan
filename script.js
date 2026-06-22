/* ── Configuration ── */
const SHEET_ID = '1FOltLmWhUQ7Ouorzu1yHJsFmbzN45a_PpAiSkuuFUOA';
let currentSheet = 'ST Perkara';
let currentFilter = 'all';
let allData = []; // Stores the active tab's data

// IMPORTANT: Set this to the column number that contains your Dates
// Note: 0 = Column A, 1 = Column B, 2 = Column C, 3 = Column D, etc.
const DATE_COLUMN_INDEX = 2; 

/* ── Live Clock ── */
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

/* ── Indonesian Date Parser & Filter Logic ── */
const idMonths = { "Januari":0, "Februari":1, "Maret":2, "April":3, "Mei":4, "Juni":5, "Juli":6, "Agustus":7, "September":8, "Oktober":9, "November":10, "Desember":11 };

function normalizeDate(dateObj) { 
    return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()); 
}

function extractDateRange(dateString) {
    if (!dateString) return null;
    
    // Parse single date (e.g. "22 Juni 2026")
    const parse = (str) => {
        const parts = str.trim().split(' ');
        if (parts.length < 3) return null;
        return new Date(parts[2], idMonths[parts[1]], parts[0]);
    };

    // Handle "s.d." range format
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
    if (!range) return false; // If row has no valid date, hide it when filtering

    const now = normalizeDate(new Date());
    
    // Calculate boundaries
    const startOfWeek = new Date(now); 
    startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1)); // Monday start
    const endOfWeek = new Date(startOfWeek); 
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Evaluation
    if (filterType === 'today') return (range.start <= now && range.end >= now);
    if (filterType === 'thisWeek') return (range.start <= endOfWeek && range.end >= startOfWeek);
    if (filterType === 'thisMonth') return (range.start <= endOfMonth && range.end >= startOfMonth);
    
    return true;
}

/* ── Data Fetching & Rendering ── */
async function fetchData() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(currentSheet)}`;
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head-row');
    
    try {
        const response = await fetch(url);
        const text = await response.text();
        // Strip the Google Visualization API text wrapper to get clean JSON
        const json = JSON.parse(text.substring(47).slice(0, -2)); 
        
        allData = json.table; 
        renderTable();
    } catch (e) {
        console.error("Fetch error:", e);
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td style="text-align:center; padding: 30px; color:#ff6b6b;">Gagal memuat data. Pastikan Google Sheet diatur ke "Anyone with the link can view".</td></tr>`;
    }
}

function renderTable() {
    const thead = document.getElementById('table-head-row');
    const tbody = document.getElementById('table-body');
    thead.innerHTML = ''; 
    tbody.innerHTML = '';

    if (!allData || !allData.cols) return;

    // 1. Build Headers
    allData.cols.forEach(col => {
        if (col.label) thead.innerHTML += `<th>${col.label}</th>`;
    });

    // 2. Build Rows & Apply Filter
    let visibleRows = 0;
    allData.rows.forEach(row => {
        // Extract the date from the specified column
        const dateStr = row.c[DATE_COLUMN_INDEX] ? row.c[DATE_COLUMN_INDEX].v : null;
        
        if (rowPassesFilter(dateStr, currentFilter)) {
            visibleRows++;
            let tr = '<tr>';
            row.c.forEach((cell, index) => {
                // Only render cells if they match a labeled column header
                if (index < allData.cols.length && allData.cols[index].label) {
                    tr += `<td>${cell ? cell.v : '-'}</td>`;
                }
            });
            tr += '</tr>';
            tbody.innerHTML += tr;
        }
    });

    if (visibleRows === 0) {
        tbody.innerHTML = `<tr><td colspan="${allData.cols.length}" style="text-align:center; padding: 40px; color:#8C9CAE;">Tidak ada data yang sesuai dengan filter waktu ini.</td></tr>`;
    }

    // Reset scroll position to top whenever data is re-rendered
    document.getElementById('data-container').scrollTop = 0;
}

/* ── Auto-Scroll Logic ── */
function initAutoScroll() {
    const container = document.getElementById('data-container');
    const progress = document.getElementById('progress-bar');
    let pausing = false;

    setInterval(() => {
        if (pausing) return;
        
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        // If content is too short to scroll, just keep progress bar at 0
        if (maxScroll <= 0) {
            progress.style.width = '0%';
            return;
        }

        // Update thin progress bar
        progress.style.width = `${(container.scrollTop / maxScroll) * 100}%`;

        // Check if we hit the bottom
        if (container.scrollTop + 1 >= maxScroll) {
            container.scrollTop = maxScroll;
            progress.style.width = '100%';
            pausing = true;
            
            // Pause at bottom, jump to top, pause at top, then resume
            setTimeout(() => {
                container.scrollTop = 0;
                progress.style.width = '0%';
                setTimeout(() => pausing = false, 2000);
            }, 4000);
        } else {
            // Normal scroll step
            container.scrollTop += 1;
        }
    }, 30); // Lower number = faster scroll (30 is smooth reading speed)
}

/* ── Event Listeners ── */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Update UI
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update state and fetch
        currentSheet = e.target.getAttribute('data-sheet');
        document.getElementById('table-body').innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px;">Memuat data ${currentSheet}...</td></tr>`;
        fetchData();
    });
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Update UI
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update state and re-render without refetching network
        currentFilter = e.target.getAttribute('data-filter');
        renderTable();
    });
});

/* ── Boot Sequence ── */
initClock();
fetchData();
initAutoScroll();

// Automatically ping Google Sheets every 15 minutes to pull fresh data
setInterval(fetchData, 900000);
