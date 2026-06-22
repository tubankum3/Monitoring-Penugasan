/* ══════════════════════════════════════════════════
   LIVE CLOCK & DATE
══════════════════════════════════════════════════ */
(function initClock() {
    const clockEl = document.getElementById('clock-display');
    const dateEl  = document.getElementById('date-display');

    const DAYS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const MONTHS = [
        'Januari','Februari','Maret','April','Mei','Juni',
        'Juli','Agustus','September','Oktober','November','Desember'
    ];

    function tick() {
        const now = new Date();
        const hh  = String(now.getHours()).padStart(2, '0');
        const mm  = String(now.getMinutes()).padStart(2, '0');
        const ss  = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hh}:${mm}:${ss}`;

        const dayName   = DAYS[now.getDay()];
        const dateNum   = now.getDate();
        const monthName = MONTHS[now.getMonth()];
        const year      = now.getFullYear();
        dateEl.textContent = `${dayName}, ${dateNum} ${monthName} ${year}`;
    }

    tick();
    setInterval(tick, 1000);
})();

/* ══════════════════════════════════════════════════
   AUTO-SCROLL LOOP
══════════════════════════════════════════════════ */
(function initAutoScroll() {
    const container   = document.getElementById('tableau-container');
    const progressBar = document.getElementById('progress-bar');

    /* ── Tunable constants ── */
    const SCROLL_PX        = 1;     // pixels advanced per tick
    const TICK_MS          = 25;    // interval between ticks (ms)
    const PAUSE_BOTTOM_MS  = 4000;  // pause at bottom (ms)
    const PAUSE_TOP_MS     = 2000;  // pause at top (ms)

    let pausing = false;

    setInterval(function autoScrollTick() {
        if (pausing) return;

        const maxScroll = container.scrollHeight - container.clientHeight;

        if (maxScroll <= 0) return;

        /* ── Update thin progress bar ── */
        const pct = (container.scrollTop / maxScroll) * 100;
        progressBar.style.width = pct + '%';

        /* ── Check if bottom reached ── */
        if (container.scrollTop + SCROLL_PX >= maxScroll) {
            container.scrollTop = maxScroll;  
            progressBar.style.width = '100%';
            pausing = true;

            setTimeout(function onBottomPause() {
                container.scrollTop = 0;
                progressBar.style.width = '0%';

                setTimeout(function onTopPause() {
                    pausing = false;
                }, PAUSE_TOP_MS);

            }, PAUSE_BOTTOM_MS);

        } else {
            container.scrollTop += SCROLL_PX;
        }

    }, TICK_MS);

})();
