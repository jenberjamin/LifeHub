/* js/fitness-history_log.js */

window.onload = function() {
    // Safety Check. This used to warn and then dereference UserProfile two
    // lines later, so the "check" changed nothing — a missing core still
    // threw. Give the page something real to read instead.
    if (typeof UserProfile === 'undefined') {
        console.warn("❖ Core Missing. Stats may be incomplete.");
        window.UserProfile = { fitnessPoints: 0, prestigeCurrency: 0, bestStreak: 0, systemLogs: [] };
    }
    calculateStats();
    renderFeed();
};

function toggleConsole() { 
    document.getElementById('statsConsole').classList.toggle('expanded'); 
}

function calculateStats() {
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    const exerciseDB = JSON.parse(localStorage.getItem('lh_exercises')) || [];
    // t && ... because the filter runs before any per-record guard below,
    // so a null in the archive threw here rather than being skipped.
    const completed = templates.filter(t => t && t.isCompleted);
    
    // A. Basic Counts
    document.getElementById('statTotalWorkouts').innerText = completed.length;
    // Both of these are labelled "Best Streak" in the markup and both used
    // to print the CURRENT streak, so a reset quietly wiped her record.
    document.getElementById('statBestStreak').innerText = (UserProfile.bestStreak || 0) + " DAYS";
    document.getElementById('detailStreak').innerText = (UserProfile.bestStreak || 0) + " Days";

    // B. Time Calculation
    let totalSeconds = 0;
    completed.forEach(t => { if(t.durationSeconds) totalSeconds += t.durationSeconds; });
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    document.getElementById('statTotalHours').innerText = `${h}H ${m}M`;

    // C. Points (Safe Access)
    document.getElementById('detailFP').innerText = (UserProfile.fitnessPoints || 0).toLocaleString();
    document.getElementById('detailPrestige').innerText = (UserProfile.prestigeCurrency || 0).toLocaleString();
    
    let totalMGP = 0;
    let graceCount = 0;
    if(UserProfile.systemLogs) {
        UserProfile.systemLogs.forEach(log => {
            if(log.type === 'mgp') {
                const match = log.text.match(/\[\+(\d+)/);
                if(match) totalMGP += parseInt(match[1]);
            }
            if(log.type === 'grace') graceCount++;
        });
    }
    document.getElementById('detailMGP').innerText = totalMGP.toLocaleString();
    document.getElementById('detailGrace').innerText = graceCount;

    // D. Muscle Breakdown (Deep Scan with Fallback)
    const muscleCounts = {};
    let totalEx = 0;
    
    completed.forEach(t => {
        if(!t || !Array.isArray(t.exercises)) return;

        t.exercises.forEach(ex => {
            if (!ex) return;                       // a null here used to throw

            // Count what was DONE, not what was planned. Scoring only pays
            // for ticked sets, so counting every planned exercise made this
            // panel disagree with the MGP it sits next to. Records with no
            // tick data are older than that change and count in full.
            if (Array.isArray(ex.completedSets) && !ex.completedSets.some(Boolean)) return;

            totalEx++;

            let targets = [];
            // 1. Check Template Data (stored at finish since this session)
            if(ex.details && Array.isArray(ex.details.target)) {
                targets = ex.details.target;
            }
            // 2. Fallback: Check Master DB if template data missing
            if (!targets.length || targets[0] === "Unknown") {
                const dbEx = exerciseDB.find(e => e && e.id == ex.dbId);
                if(dbEx && Array.isArray(dbEx.target)) targets = dbEx.target;
            }
            // 3. Deleted from the library and no stored targets. Scoring
            //    credits this case to "Full Body"; this panel used to credit
            //    it to nothing, so the two told different stories.
            if (!targets.length) targets = ["Full Body"];

            targets.forEach(m => {
                if(m && m !== "Unknown") muscleCounts[m] = (muscleCounts[m] || 0) + 1;
            });
        });
    });
    document.getElementById('detailExTotal').innerText = totalEx;

    const muscleCol = document.getElementById('muscleStatsCol');
    muscleCol.innerHTML = '<div class="detail-col-header">MUSCLE FREQUENCY</div>';
    
    const sortedMuscles = Object.entries(muscleCounts).sort((a,b) => b[1] - a[1]).slice(0, 8); // Top 8
    
    if(sortedMuscles.length === 0) {
        muscleCol.innerHTML += `<div class="stat-row" style="color:#666">No data recorded yet.</div>`;
    } else {
        sortedMuscles.forEach(([muscle, count]) => {
            muscleCol.innerHTML += `<div class="stat-row"><span>${muscle}</span> <span>${count}</span></div>`;
        });
    }
}

function renderFeed() {
    const container = document.getElementById('feedContainer');
    if(!container) return;
    container.innerHTML = '';
    
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    const history = templates.filter(t => t && t.isCompleted)
        .sort((a, b) => (localMidnight(b.date) || 0) - (localMidnight(a.date) || 0));
    const logs = (UserProfile && UserProfile.systemLogs) || [];

    if(history.length === 0) {
        container.innerHTML = '<div style="color:#666; text-align:center; margin-top:50px;">NO RECORDS FOUND</div>';
        return;
    }

    // A day's logs can only honestly describe ONE workout. When two share a
    // date and neither recorded its own totals, the first card gets them and
    // the rest say "—" rather than every card claiming the whole day.
    const daysClaimed = new Set();

    history.forEach(workout => {
        const dateObj = localMidnight(workout.date);
        const dateStr = dateObj
            ? dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            : 'UNDATED';

        let mgp, fp, prestige;

        if (workout.summary) {
            // Written by the session itself — no guessing needed.
            mgp = workout.summary.totalMGP;
            fp = workout.summary.totalFP;
            prestige = workout.summary.prestige;
        } else {
            // Legacy record. Reconstruct from the day's logs, once per day.
            const wDateISO = workout.date;
            if (wDateISO && daysClaimed.has(wDateISO)) {
                mgp = fp = prestige = null;     // already attributed
            } else {
                if (wDateISO) daysClaimed.add(wDateISO);
                mgp = 0; fp = 0; prestige = 0;

                logs.filter(l => l && localDay(l.date) === wDateISO).forEach(l => {
                    const text = String(l.text || '');
                    if (l.type === 'mgp') {
                        const m = text.match(/\[\+(\d+)/);
                        if (m) mgp += parseInt(m[1]);
                    }
                    if (l.type === 'workout') {
                        // Tolerates "+20 Base FP" as well as "+20 FP". The old
                        // pattern required the latter, never matched, and fell
                        // through to a hardcoded 20 on every single card.
                        const m = text.match(/\+(\d+)\s+(?:Base\s+)?FP/);
                        if (m) fp += parseInt(m[1]);
                    }
                    if (l.type === 'prestige') {
                        const m = text.match(/\[\+(\d+)/);
                        if (m) prestige += parseInt(m[1]);
                    }
                });
            }
        }

        const stat = (v, unit) => (v === null || v === undefined)
            ? `<div class="c-stat">— ${unit}</div>`
            : `<div class="c-stat">+${v} ${unit}</div>`;

        const card = document.createElement('div');
        card.className = 'feed-card';
        card.onclick = function() { loadInspector(workout, this); };

        card.innerHTML = `
            <div class="card-date">${dateStr}</div>
            <div class="card-title">${workout.name || 'UNNAMED SESSION'}</div>
            <div class="card-stats-row">
                ${stat(mgp, 'MGP')}
                <div class="c-stat">•</div>
                ${stat(fp, 'FP')}
                <div class="c-stat">•</div>
                ${stat(prestige, 'PRESTIGE')}
            </div>
        `;
        container.appendChild(card);
    });
}

function loadInspector(workout, cardEl) {
    document.querySelectorAll('.feed-card').forEach(c => c.classList.remove('active'));
    cardEl.classList.add('active');

    const container = document.getElementById('inspector');
    const inspDate = localMidnight(workout.date);      // local day, not UTC midnight
    const dateStr = inspDate
        ? inspDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : 'UNDATED';

    let durationTxt = "Time not recorded";
    if(workout.durationSeconds) {
        const h = Math.floor(workout.durationSeconds / 3600);
        const m = Math.floor((workout.durationSeconds % 3600) / 60);
        const s = workout.durationSeconds % 60;
        durationTxt = `DURATION: ${h}H ${m}M ${s}S`;
    }

    // How much of the plan was actually completed, when the session recorded it.
    let doneTxt = '';
    if (workout.summary && typeof workout.summary.exercisesPlanned === 'number') {
        const s = workout.summary;
        doneTxt = `<div class="insp-duration">COMPLETED: ${s.exercisesCompleted}/${s.exercisesPlanned} EXERCISES` +
                  (typeof s.setsCompleted === 'number' ? ` &nbsp;•&nbsp; ${s.setsCompleted}/${s.setsPlanned} SETS` : '') +
                  `</div>`;
    }

    let content = `
        <div class="insp-header">
            <div class="insp-date">${dateStr}</div>
            <div class="insp-title">${workout.name || 'UNNAMED SESSION'}</div>
            <div class="insp-duration">${durationTxt}</div>
            ${doneTxt}
        </div>
    `;

    // Archived templates rarely carry a type of their own, so fall back to
    // the exercise library — otherwise every set here reads "KG x REPS".
    const inspectorDB = JSON.parse(localStorage.getItem('lh_exercises')) || [];

    if (Array.isArray(workout.exercises) && workout.exercises.length > 0) {
        workout.exercises.forEach(ex => {
            if (!ex) return;
            const dbEx = inspectorDB.find(e => e && e.id == ex.dbId);
            const exType = ex.type || (dbEx && dbEx.type) || '';
            const units = unitsFor(exType);

            content += `
                <div class="ex-block">
                    <div class="ex-title">
                        <span>${ex.name}</span>
                        <span style="color:var(--color-white-muted)">${exType}</span>
                    </div>
            `;

            if (ex.sets && ex.sets.length > 0) {
                ex.sets.forEach((set, i) => {
                    // .set-row is a fixed 60px 60px 20px 100px grid, so a
                    // single-value type spans the three value columns
                    // instead of leaving a stray "✕" with nothing after it.
                    let cells;
                    if (units.length === 1) {
                        cells = `<div class="set-val" style="grid-column: span 3; text-align:left; padding-left:10px;">${set[0] || '-'} ${units[0]}</div>`;
                    } else {
                        cells = `<div class="set-val">${set[0] || '-'} ${units[0]}</div>
                            <div class="set-x">✕</div>
                            <div class="set-reps">${set[1] || '-'} ${units[1]}</div>`;
                    }

                    // A set that was planned but never ticked is shown dimmed
                    // rather than as though it happened. Records without tick
                    // data predate that being stored and render as normal.
                    const known = Array.isArray(ex.completedSets);
                    const skipped = known && !ex.completedSets[i];
                    const rowStyle = skipped ? ' style="opacity:0.35"' : '';
                    const mark = skipped ? '<span title="not completed"> ·</span>' : '';

                    content += `
                        <div class="set-row"${rowStyle}>
                            <div class="set-num">SET ${i+1}${mark}</div>
                            ${cells}
                        </div>
                    `;
                });
            } else {
                content += `<div class="set-row">No set data recorded.</div>`;
            }
            
            content += `</div>`;
        });
    } else {
        content += `<div style="color:#666">No exercises data found.</div>`;
    }

    container.innerHTML = content;
}

/* --- LIVE VAULT ---
   Read-only page, so this is always safe. The inspector keeps whatever it
   was showing; the feed and the stats console rebuild. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        calculateStats();
        renderFeed();
    });
}