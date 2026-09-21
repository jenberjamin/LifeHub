// --- LIFEHUB CORE: SLEEP TRACKER (ISOLATED MODE) ---

(function() { // <--- SAM'S EDIT: START OF SAFETY BUBBLE

    // 1. CONFIGURATION
    // We can keep the name generic inside this bubble, it won't leak out.
    const config = { 
      apiKey: "AIzaSyABhqON4h0GHjFbZaDT1ysSprmpdczyC6I",
      authDomain: "lifehub-cae1d.firebaseapp.com",
      databaseURL: "https://lifehub-cae1d-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "lifehub-cae1d",
      storageBucket: "lifehub-cae1d.firebasestorage.app",
      messagingSenderId: "471522181748",
      appId: "1:471522181748:web:6861392a45fbbbec8dc721",
      measurementId: "G-2R3WDZNXKG"
    };

    // 2. INITIALIZATION
    // We use a unique name "SleepApp" so it doesn't clash with the Transaction Viewer's app
    let app;
    try {
        app = firebase.app("SleepApp");
    } catch (e) {
        app = firebase.initializeApp(config, "SleepApp");
    }
    const db = firebase.database(app);

    // Local settings
    const factorsData = ["Caffeine", "Alcohol", "Deadline", "Sickness", "Late Workout", "Events", "FLO"];
    let selectedFactors = [];
    const SLEEP_GOAL_HOURS = 8; 

    // ── MANILA TIME ────────────────────────────────────────────────
    // Every date in this tracker is a Philippine calendar date, whatever
    // the device clock says. Alexa writes Manila times from Lambda (which
    // runs on UTC), so the browser has to agree or a log made at 1 AM
    // lands on the wrong day.
    const PH_TZ = "Asia/Manila";

    // en-CA formats as YYYY-MM-DD, which is exactly the key format used
    // for sleep_logs and for <input type="date">. Going through Intl
    // avoids the old round-trip through toLocaleString() + new Date(),
    // which relied on the "en-US" string happening to be re-parseable.
    const PH_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
        timeZone: PH_TZ, year: "numeric", month: "2-digit", day: "2-digit"
    });

    // Returns the Manila calendar date ("YYYY-MM-DD") for a moment in time.
    function toPHDateKey(date) {
        return PH_DATE_FMT.format(date || new Date());
    }

    // Today, in Manila.
    function phToday() {
        return toPHDateKey(new Date());
    }

    // Date-key arithmetic with no timezone in play at all. A key is a bare
    // calendar date, so shifting it is pure counting — parsing it back into
    // a Date (which the streak loop used to do) is what let UTC creep in.
    function shiftDateKey(key, days) {
        const [y, m, d] = key.split('-').map(Number);
        const t = Date.UTC(y, m - 1, d) + days * 86400000;
        const out = new Date(t);
        return out.getUTCFullYear() + '-' +
               String(out.getUTCMonth() + 1).padStart(2, '0') + '-' +
               String(out.getUTCDate()).padStart(2, '0');
    }

    // --- DOM LOADED ---
    document.addEventListener('DOMContentLoaded', () => {
        // Set Date Input to Today (PH time)
        const dateInput = document.getElementById('logDate');
        if(dateInput) dateInput.value = phToday();

        // Render Factors
        const factorContainer = document.getElementById('factorsList');
        if(factorContainer) {
            factorContainer.innerHTML = ''; 
            factorsData.forEach(factor => {
                const chip = document.createElement('div');
                chip.className = 'chip';
                chip.innerText = factor;
                chip.onclick = () => toggleFactor(chip, factor);
                factorContainer.appendChild(chip);
            });
        }

        // Listeners for Time Calculation
        const bed = document.getElementById('bedtime');
        const wake = document.getElementById('waketime');
        const qual = document.getElementById('quality');

        if(bed) bed.addEventListener('change', calculateDuration);
        if(wake) wake.addEventListener('change', calculateDuration);
        
        // Listener for Range
        if(qual) {
            qual.addEventListener('input', (e) => {
                document.getElementById('qualityVal').innerText = e.target.value;
            });
        }

        // Whether the date in the picker is already excused, kept in step
        // as she moves the date around.
        if (dateInput) dateInput.addEventListener('change', refreshExemptionNote);
        refreshExemptionNote();

        // Load Data from Firebase
        initHistoryListener();
        initAutoSave();
        showPendingFactors();
    });

    // Chips the hydration tracker already ticked for tonight — a coffee
    // after 2pm, alcohol after midday. They are merged into the log on
    // save regardless, but merging something she never saw means the
    // first she knows of it is reading it back in her history. Lit up
    // here so the form tells the truth before she presses the button.
    //
    // Clicking is how a chip gets selected — the selected list lives in
    // a closure and toggleFactor is the only way in — so this goes
    // through the same path a finger would.
    function showPendingFactors() {
        const dateInput = document.getElementById('logDate');
        const targetDate = (dateInput && dateInput.value) || phToday();

        db.ref('sleep_pending_factors/' + targetDate).once('value').then((snap) => {
            const pending = snap.val();
            if (!pending) return;

            const H = window.LIFEHUB_HYDRATION;
            if (H && !H.factorTagFresh(pending.at)) return;   // too old to mean anything

            const want = Object.keys(pending)
                .filter((f) => f !== 'at' && pending[f])
                .map((f) => f.toUpperCase());
            if (!want.length) return;

            document.querySelectorAll('.chip').forEach((chip) => {
                const name = chip.innerText.trim().toUpperCase();
                if (want.indexOf(name) !== -1 && !chip.classList.contains('selected')) {
                    chip.click();
                }
            });
        }).catch(() => { /* a missing node is the normal case */ });
    }


    // --- HELPER FUNCTIONS ---

    function toggleFactor(element, factor) {
        element.classList.toggle('selected');
        if (selectedFactors.includes(factor)) {
            selectedFactors = selectedFactors.filter(f => f !== factor);
        } else {
            selectedFactors.push(factor);
        }
    }

    function calculateDuration() {
        const bedVal = document.getElementById('bedtime').value;
        const wakeVal = document.getElementById('waketime').value;

        if (bedVal && wakeVal) {
            let bedDate = new Date(`2000-01-01T${bedVal}:00`);
            let wakeDate = new Date(`2000-01-01T${wakeVal}:00`);

            if (wakeDate < bedDate) {
                wakeDate.setDate(wakeDate.getDate() + 1);
            }

            const diffMs = wakeDate - bedDate;
            const diffHrs = Math.floor(diffMs / 3600000);
            const diffMins = Math.round(((diffMs % 3600000) / 60000));

            const display = document.getElementById('durationResult');
            if(display) display.innerText = `${diffHrs} hr ${diffMins} min`;

            // The log is filed under the day you WOKE UP, so the date is
            // only auto-filled when it's still empty. It used to be
            // overwritten with today on every keystroke, which meant a date
            // picked by hand could never survive to saveSleepLog().
            const dateInput = document.getElementById('logDate');
            if (dateInput && !dateInput.value) {
                dateInput.value = phToday();
            }

            return diffHrs + (diffMins / 60);
        }
        return 0;
    }

    // --- "ALREADY SEALED" DIALOG ---
    // The browser's own confirm() drew this as a system alert bar at the
    // top of the screen — grey, 127.0.0.1-stamped, and nothing like the
    // page asking the question. Replacing a night is the one destructive
    // thing this tracker does, so it should at least look like the
    // tracker doing it.
    //
    // Built in JS, styles and all, rather than as markup in the page:
    // this file is shared with LifeHub-mobile-sleep.html, which has its
    // own inline stylesheet and none of the .modal-glass rules. Markup
    // would have to be pasted into two pages and the CSS into two more,
    // and the mobile copy would drift. The palette below is the one both
    // pages already use (#3e3831 text, #8b857e muted, #fdfbf9 card).
    //
    // Deliberately NOT reusing .modal-glass — that one is the Sleep
    // Archive and is locked to height:70vh, which on a four-line question
    // is a tall empty box.
    const CONFIRM_STYLE_ID = 'sleep-confirm-styles';

    function ensureConfirmStyles() {
        if (document.getElementById(CONFIRM_STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = CONFIRM_STYLE_ID;
        style.textContent = `
.sleep-confirm-overlay {
    position: fixed; inset: 0;
    background: rgba(62, 56, 49, 0.4);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    /* Above the Sleep Archive (z-index 200), which can be open behind it. */
    z-index: 300;
    display: flex; justify-content: center; align-items: center;
    padding: 20px;
    opacity: 0;
    transition: opacity 0.25s ease;
    font-family: 'Red Hat Display', sans-serif;
}
.sleep-confirm-overlay.active { opacity: 1; }

.sleep-confirm-card {
    background: #fdfbf9;
    width: 100%; max-width: 380px;
    border-radius: 20px;
    padding: 26px;
    box-shadow: 0 25px 50px rgba(0,0,0,0.2);
    transform: translateY(20px);
    transition: transform 0.25s ease;
    text-align: left;
}
.sleep-confirm-overlay.active .sleep-confirm-card { transform: translateY(0); }

.sleep-confirm-card h2 {
    margin: 0 0 16px;
    font-size: 13px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 2px;
    color: #b4685c;
}

/* The date being overwritten, and what is currently under it. The
   record reads as a quoted block so it is plainly the OLD night and
   not a summary of what is about to be saved. */
.sleep-confirm-card .sc-lead {
    margin: 0 0 10px;
    font-size: 12px; line-height: 1.5;
    color: #8b857e;
}
.sleep-confirm-card .sc-record {
    margin: 0 0 16px;
    padding: 12px 14px;
    border-left: 2px solid rgba(62, 56, 49, 0.18);
    background: rgba(62, 56, 49, 0.035);
    border-radius: 0 10px 10px 0;
}
.sleep-confirm-card .sc-record .sc-line {
    font-size: 13px; line-height: 1.6; color: #3e3831;
}
.sleep-confirm-card .sc-record .sc-paid {
    font-size: 11px; color: #8b857e;
    text-transform: uppercase; letter-spacing: 1px;
    margin-top: 4px;
}
.sleep-confirm-card .sc-ask {
    margin: 0 0 6px;
    font-size: 13px; line-height: 1.5; color: #3e3831;
}
.sleep-confirm-card .sc-note {
    margin: 0 0 22px;
    font-size: 11px; line-height: 1.6; color: #8b857e;
}

.sleep-confirm-actions { display: flex; gap: 10px; }
.sleep-confirm-actions button {
    flex: 1;
    padding: 13px 10px;
    border-radius: 10px;
    font-family: inherit;
    font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase;
    cursor: pointer;
    transition: 0.2s;
}
/* Cancel is the filled, obvious one. Replacing a night is the rarer
   and the unrecoverable answer, so it does not get to be the button
   her thumb lands on by reflex. */
.sleep-confirm-actions .sc-cancel {
    background: #3e3831; color: #fff; border: 1px solid #3e3831;
}
.sleep-confirm-actions .sc-cancel:hover { background: #2a2621; }
.sleep-confirm-actions .sc-replace {
    background: transparent; color: #b4685c;
    border: 1px solid rgba(180, 104, 92, 0.45);
}
.sleep-confirm-actions .sc-replace:hover {
    background: rgba(180, 104, 92, 0.07);
    border-color: #b4685c;
}
.sleep-confirm-actions button:focus-visible {
    outline: 2px solid rgba(62, 56, 49, 0.45);
    outline-offset: 2px;
}
`;
        document.head.appendChild(style);
    }

    // Resolves true to replace the night, false to leave it alone.
    // Cancel, Escape and a click on the backdrop all mean false — the
    // safe answer is the one every accidental gesture lands on.
    function confirmOverwrite(targetDate, existingEntry) {
        ensureConfirmStyles();

        const oldPay = Number(existingEntry.prestigeValue) || 0;

        const overlay = document.createElement('div');
        overlay.className = 'sleep-confirm-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'sc-title');

        const card = document.createElement('div');
        card.className = 'sleep-confirm-card';

        // Built as nodes, not innerHTML: feeling is a free-text field and
        // the date comes off the form, so neither is pasted into markup.
        const h2 = document.createElement('h2');
        h2.id = 'sc-title';
        h2.textContent = 'Already Sealed';

        const lead = document.createElement('p');
        lead.className = 'sc-lead';
        lead.textContent = targetDate + ' is already on the record as:';

        const record = document.createElement('div');
        record.className = 'sc-record';

        const line = document.createElement('div');
        line.className = 'sc-line';
        line.textContent =
            (existingEntry.duration || '—') +
            '  ·  Quality ' + (existingEntry.quality || '—') +
            '  ·  ' + (existingEntry.feeling || '—');

        const paid = document.createElement('div');
        paid.className = 'sc-paid';
        paid.textContent = 'Prestige paid: ' + oldPay.toLocaleString();

        record.appendChild(line);
        record.appendChild(paid);

        const ask = document.createElement('p');
        ask.className = 'sc-ask';
        ask.textContent = "Replace it with what's on the form?";

        const note = document.createElement('p');
        note.className = 'sc-note';
        note.textContent =
            'The ' + oldPay.toLocaleString() + ' already paid is reversed first, ' +
            'so you are only paid for the night you end up with. ' +
            'The old entry is not kept.';

        const actions = document.createElement('div');
        actions.className = 'sleep-confirm-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'sc-cancel';
        cancelBtn.textContent = 'Keep It';

        const replaceBtn = document.createElement('button');
        replaceBtn.type = 'button';
        replaceBtn.className = 'sc-replace';
        replaceBtn.textContent = 'Replace';

        actions.appendChild(cancelBtn);
        actions.appendChild(replaceBtn);

        [h2, lead, record, ask, note, actions].forEach(el => card.appendChild(el));
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        return new Promise((resolve) => {
            let settled = false;

            function close(answer) {
                if (settled) return;      // double-click, or Esc mid-fade
                settled = true;

                document.removeEventListener('keydown', onKey);
                overlay.classList.remove('active');

                // Let the fade finish before the node goes, but never
                // leave it in the DOM if transitionend doesn't fire.
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 250);

                resolve(answer);
            }

            function onKey(e) {
                if (e.key === 'Escape') close(false);
            }

            cancelBtn.addEventListener('click', () => close(false));
            replaceBtn.addEventListener('click', () => close(true));

            // The backdrop only — a click that started inside the card
            // and drifted out while selecting text must not dismiss it.
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(false);
            });

            document.addEventListener('keydown', onKey);

            // One frame before adding .active, or the browser paints the
            // final state immediately and there is no fade at all.
            requestAnimationFrame(() => {
                overlay.classList.add('active');
                cancelBtn.focus();
            });
        });
    }


    // --- SAVE LOGIC (WITH PRESTIGE) ---
    // We attach this to 'window' so the HTML button can still see it outside the bubble
    window.saveSleepLog = function() {
        const durationText = document.getElementById('durationResult').innerText;
        const durationHrs = calculateDuration(); 
        const targetDate = document.getElementById('logDate').value; 

        if (!targetDate) {
            alert("Please select a date.");
            return;
        }

        const logsRef = db.ref('sleep_logs');
        
        // Read DB first
        logsRef.once('value').then((snapshot) => {
            const data = snapshot.val();
            let logs = data ? Object.values(data) : [];
            
            // 1. ALREADY SEALED? — ASK, DON'T REFUSE
            // This used to be a flat "ACCESS DENIED" with no way past it,
            // which meant a night logged wrong (Alexa guessing a bedtime,
            // a mis-picked date) was wrong forever unless she went into
            // the Firebase console by hand.
            //
            // The seal is still real: the night is replaced only on a
            // deliberate yes, and what the first save PAID is taken back
            // before the new one is credited. Without that reversal an
            // overwrite would be a way to farm prestige by re-logging the
            // same night — nothing in updateBank() is keyed by date.
            const existingEntry = logs.find(l => l.date === targetDate);

            // The dialog is a real element, so the answer arrives later
            // rather than blocking the way confirm() did. Everything
            // downstream is therefore parked in continueSave() and run
            // either straight away or once she's answered — the same
            // shape finishSave() below already uses to wait on a read.
            if (existingEntry) {
                confirmOverwrite(targetDate, existingEntry).then((replace) => {
                    if (replace) continueSave();
                });
                return;
            }

            continueSave();

            function continueSave() {

            // 2. CALCULATE PRESTIGE
            let prestigeEarned = 0;
            let details = ""; 
            
            // Base Pay Logic
            if (durationHrs < 4.0) {
                prestigeEarned = -2000;
                details = `Severe Sleep Debt (${durationHrs.toFixed(1)} hrs)`;
            }
            else if (durationHrs < 6.0) {
                prestigeEarned = 500;
                details = `${durationHrs.toFixed(1)} hrs of Sleep (Low)`;
            }
            else if (durationHrs <= 8.5) {
                prestigeEarned = 3500; 
                details = `${durationHrs.toFixed(1)} hrs of Sleep (Optimal)`;
            }
            else if (durationHrs <= 9.5) {
                prestigeEarned = 2500;
                details = `${durationHrs.toFixed(1)} hrs of Sleep (Extended)`;
            }
            else {
                prestigeEarned = 1000; 
                details = `${durationHrs.toFixed(1)} hrs of Sleep (Overslept)`;
            }

            // Streak Logic
            logs.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Walk backwards one Manila day at a time. This used to build a
            // Date from the key and call toISOString(), which reads back in
            // UTC — in Manila (UTC+8) that shifted the key by a day for part
            // of every evening and silently broke streaks.
            let streak = 0;
            let checkDate = shiftDateKey(targetDate, -1);

            for (let i = 0; i < 35; i++) {
                const hasLog = logs.find(l => l.date === checkDate);
                if (hasLog) {
                    streak++;
                    checkDate = shiftDateKey(checkDate, -1);
                } else { break; }
            }
            const currentStreak = streak + 1; 

            // Apply Bonuses
            if (currentStreak === 3) {
                prestigeEarned += 2000;
                details += ` + 3 Day Streak!`;
            }
            if (currentStreak === 7) {
                prestigeEarned += 10000;
                details += ` + 7 Day Streak!`;
            }
            if (currentStreak === 30) {
                prestigeEarned += 50000;
                details += ` + 30 Day Streak!`;
            }

            // 2b. FACTORS THE HYDRATION TRACKER ALREADY KNOWS
            // A coffee logged after 2pm, or any alcohol after midday,
            // parks itself under the date Jen will WAKE on — because at
            // 11pm there is no sleep log yet to write it into. This is
            // where it gets collected.
            //
            // Merged with what she ticked rather than replacing it: a
            // chip she selected by hand must never be dropped because
            // the pending node was empty. Read synchronously into the
            // log below via the promise chain.
            const pendingRef = db.ref('sleep_pending_factors/' + targetDate);

            pendingRef.once('value').then((pendingSnap) => {
                const pending = pendingSnap.val() || {};
                const merged = selectedFactors.slice();

                // Stale tags are dropped rather than merged: a coffee
                // from a night that was never logged has nothing to say
                // about this one. The node is cleared either way.
                const H = window.LIFEHUB_HYDRATION;
                const fresh = !H || H.factorTagFresh(pending.at);

                if (fresh) {
                    Object.keys(pending).forEach((f) => {
                        // `at` is the stamp, not a factor.
                        if (f !== 'at' && pending[f] && merged.indexOf(f) === -1) {
                            merged.push(f);
                        }
                    });
                }

                finishSave(merged, pendingRef);
            }).catch(() => {
                // The tag is a convenience; losing it must not lose the log.
                finishSave(selectedFactors.slice(), null);
            });

            function finishSave(factors, toClear) {

            // 3. CONSTRUCT THE LOG
            const log = {
                date: targetDate,
                bedtime: document.getElementById('bedtime').value,
                waketime: document.getElementById('waketime').value,
                duration: durationText,
                durationHrsVal: durationHrs,
                quality: document.getElementById('quality').value,
                feeling: document.getElementById('sleepFeeling').value,
                factors: factors,
                prestigeValue: prestigeEarned
            };

            // 4. SAVE TO DB
            db.ref('sleep_logs/' + targetDate).set(log)
                .then(() => {
                    console.log(existingEntry ? "Entry Replaced." : "New Entry Sealed.");

                    // Consumed only once the night is safely written. Clearing
                    // it first would lose the tag if the save then failed.
                    if (toClear) toClear.remove().catch(() => {});

                    // The bedtime marker Alexa and Poppy share. Only
                    // "I just woke up" ever consumed it, so a goodnight
                    // that got closed out HERE instead left it behind to
                    // rot — and Poppy reads it out on the next morning as
                    // though it were the last thing on record.
                    //
                    // Only a STALE one goes. Sixteen hours matches
                    // SLEEP_MARKER_MAX_AGE_MS in the Alexa skill and
                    // markerFresh() in PoppyEngine-sleep.js; all three
                    // have to agree. A fresh marker is a night in
                    // progress — logging an earlier night at midnight
                    // must not throw away the bedtime just stamped.
                    const markerRef = db.ref('alexa_memory/last_sleep_start');
                    markerRef.once('value').then((markerSnap) => {
                        const started = Number(markerSnap.val()) || 0;
                        const age = Date.now() - started;
                        if (started && (age <= 0 || age >= 16 * 3600000)) {
                            return markerRef.set(null);
                        }
                    }).catch(() => {
                        // Tidying up must never fail a log already written.
                    });

                    clearDraft();

                    // Undo the old payout BEFORE crediting the new one, and
                    // only now that the replacement row is actually on the
                    // record — a reversal written for a save that then
                    // failed would dock her for a night she still has.
                    if (existingEntry) {
                        reverseBankEntry(
                            Number(existingEntry.prestigeValue) || 0,
                            "Reversal — " + targetDate + " re-logged"
                        );
                    }

                    updateBank(prestigeEarned, details);

                    // The Sleep Protocol is settled AFTER the night is on
                    // the record, because every one of its rules is counted
                    // from the logs — running it first would judge the week
                    // without tonight in it.
                    return settleProtocol().then((paid) => {
                        let msg = existingEntry
                            ? `Sleep Log Replaced.\n${details}\nPrestige: ${prestigeEarned}`
                            : `Sleep Log Sealed.\n${details}\nPrestige: ${prestigeEarned}`;

                        // The net of the swap, spelled out. "Prestige: 3500"
                        // on its own reads like a fresh 3500 landing in the
                        // bank, when most of it has just been handed back.
                        if (existingEntry) {
                            const oldPay = Number(existingEntry.prestigeValue) || 0;
                            msg += `\n(reversed ${oldPay.toLocaleString()} from the old entry` +
                                   ` — net ${(prestigeEarned - oldPay > 0 ? "+" : "")}` +
                                   `${(prestigeEarned - oldPay).toLocaleString()})`;
                        }

                        // Trophies and penalties are rare, so they get their
                        // own lines rather than being folded into the total.
                        if (paid && paid.length) {
                            msg += "\n\n" + paid.map(p =>
                                (p.penalty ? "⚠ " : "🏆 ") + p.name +
                                " (" + p.term + ")  " +
                                (p.amount > 0 ? "+" : "") + p.amount.toLocaleString()
                            ).join("\n");
                        }
                        alert(msg);
                    });
                })
                .catch((error) => {
                    console.error("Error saving data: ", error);
                    alert("Error saving to cloud.");
                });

            } // finishSave

            } // continueSave
        });
    }


    // --- EXCUSING A DAY ---
    // Marks the date in the picker as one she never claimed to have
    // slept a logged night on, so the missed-log penalty ("Cycle
    // Disturbance", 3 days with nothing logged) does not fire for it.
    //
    // It writes NO sleep log and pays nothing. That distinction is the
    // whole point: a phantom row would land in the charts, the average
    // and the debt calculation as if it were a real night.
    //
    // It also does not keep a reward streak alive. Being excused and
    // being credited are different things, and a flag that did both
    // would make Morning Person meaningless.
    window.markExemption = function () {
        const note = document.getElementById('exemptNote');
        const say = (msg, cls) => {
            if (!note) return;
            note.innerText = msg;
            note.className = 'exempt-note' + (cls ? ' ' + cls : '');
        };

        const P = window.LIFEHUB_SLEEP_PROTOCOL;
        if (!P) { say("The protocol module isn't loaded.", 'is-err'); return; }

        const date = document.getElementById('logDate').value;
        if (!date) { say("Pick a date first.", 'is-err'); return; }

        // A logged night needs no excusing, and marking one would be a
        // confusing thing to come back to.
        db.ref('sleep_logs/' + date).once('value').then((snap) => {
            if (snap.val()) {
                say(date + " is already logged — nothing to excuse.", 'is-err');
                return;
            }

            const reason = prompt(
                "Excuse " + date + " from the missed-log penalty.\n\n" +
                "This logs no sleep and earns nothing — it only stops the\n" +
                "3-day no-log penalty counting this date.\n\n" +
                "Why? (optional)"
            );
            // prompt() returns null on Cancel and "" on an empty OK. Only
            // the first is a change of mind.
            if (reason === null) return;

            return P.exempt(db, date, reason, 'Sleep Tracker')
                .then(() => say("✓ " + date + " excused. No missed-log penalty for it.", 'is-on'))
                .catch((e) => say("Couldn't save that: " + e.message, 'is-err'));
        }).catch((e) => say("Couldn't check that date: " + e.message, 'is-err'));
    };

    // Shows whether the date in the picker is already excused, so the
    // button never silently re-marks something.
    function refreshExemptionNote() {
        const note = document.getElementById('exemptNote');
        const dateEl = document.getElementById('logDate');
        if (!note || !dateEl || !dateEl.value || !window.LIFEHUB_SLEEP_PROTOCOL) return;

        const date = dateEl.value;
        db.ref(window.LIFEHUB_SLEEP_PROTOCOL.EXEMPT_PATH + '/' + date)
          .once('value')
          .then((snap) => {
              const row = snap.val();
              if (row) {
                  note.innerText = "✓ " + date + " is excused" +
                      (row.reason ? " — " + row.reason : "") + ".";
                  note.className = 'exempt-note is-on';
              } else {
                  note.innerText = "";
                  note.className = 'exempt-note';
              }
          })
          .catch(() => {});
    }


    // --- SLEEP PROTOCOL ---
    // Jen's Notion rewards and penalties. The rules and the payouts live
    // in JS/lifehub-sleep-protocol.js so this page, Poppy, the homescreen
    // and the bank all agree on what a trophy is; this only kicks it.
    //
    // Never allowed to break a save. The night is already written and
    // paid by the time this runs, and a protocol that cannot be reached
    // must not turn a logged night into an error message.
    function settleProtocol() {
        const P = window.LIFEHUB_SLEEP_PROTOCOL;
        if (!P || !window.LIFEHUB_PRESTIGE) {
            console.warn("[sleep] protocol modules not loaded — no trophies settled.");
            return Promise.resolve([]);
        }
        return P.settle(db, window.LIFEHUB_PRESTIGE,
                        firebase.database.ServerValue.TIMESTAMP)
                .catch((e) => {
                    console.warn("[sleep] protocol did not settle:", e.message);
                    return [];
                });
    }


    function updateBank(amount, customDescription) {
        const balanceRef = db.ref('prestige_system/balance');
        const netWorthRef = db.ref('prestige_system/net_worth');

        if (amount === 0) return;

        balanceRef.transaction((current) => (current || 0) + amount);
        
        if (amount > 0) {
            netWorthRef.transaction((current) => (current || 0) + amount);
        }
        
        const txRef = db.ref('prestige_system/transactions');

        const tx = {
            amount: amount,
            description: customDescription || (amount > 0 ? "Sleep Protocol" : "Sleep Penalty"),
            source: "SLEEP TRACKER",
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        // A negative sleep payout is only ever the severe-debt fine for a
        // night under 4 hours. Marking it means lifetime prestige can tell
        // a fine from ordinary spending: a fine lowers her rank, spending
        // does not. See JS/lifehub-prestige-ledger.js.
        //
        // Set as a separate line rather than inline, because Firebase
        // rejects a key whose value is undefined.
        if (amount < 0) tx.kind = "penalty";

        txRef.push(tx);
    }


    // Taking back what an earlier save paid, when a night is re-logged
    // over the top of itself.
    //
    // Deliberately NOT updateBank(-amount): that marks every negative row
    // kind:"penalty", and a penalty is the system fining her — it would
    // read in the ledger as though she'd been docked for fixing a typo.
    // This is a correction: the payment simply un-happens. Both lower her
    // rank, but only one of them is true.
    function reverseBankEntry(amount, description) {
        if (!amount) return;

        const P = window.LIFEHUB_PRESTIGE;
        const stamp = firebase.database.ServerValue.TIMESTAMP;

        // reversal() flips the sign for us and always sets
        // kind:"correction" — it is the ledger's only sanctioned way to
        // take points back out of a rank. The fallback does the same by
        // hand rather than skipping the write: a module that failed to
        // load must never be the reason a night gets paid for twice.
        const tx = P
            ? P.reversal(amount, description, "SLEEP TRACKER", stamp)
            : { amount: -amount, description: description,
                source: "SLEEP TRACKER", timestamp: stamp, kind: "correction" };

        db.ref('prestige_system/balance')
          .transaction((current) => (current || 0) + tx.amount);

        // net_worth is vestigial and read by nothing (see the note in
        // lifehub-prestige-ledger.js), but updateBank() still raises it on
        // a positive payout — so an overwrite lowers it back rather than
        // leaving it drifting further above the real lifetime total.
        if (amount > 0) {
            db.ref('prestige_system/net_worth')
              .transaction((current) => (current || 0) - amount);
        }

        db.ref('prestige_system/transactions').push(tx);
    }


    // --- FIREBASE LOAD LOGIC (HISTORY & CHARTS) ---
    // SAM'S NOTE: Renamed this to avoid clashing with the Alexa listener
    function initHistoryListener() {
        const logsRef = db.ref('sleep_logs');
        
        logsRef.on('value', (snapshot) => {
            const data = snapshot.val();
            let logs = [];
            
            if (data) {
                logs = Object.values(data);
                logs.sort((a, b) => new Date(a.date) - new Date(b.date));
            }

            renderChart(logs);
            renderHistory(logs);
            calculateDebt(logs);
            
            window.currentLogs = logs; 
        });
    }

    // --- STATS & VISUALIZATION ---

    function calculateDebt(logs) {
        const recentLogs = logs.slice(-7);
        let totalSleep = 0;
        
        recentLogs.forEach(log => {
            let val = log.durationHrsVal || 0;
            totalSleep += val;
        });

        const expectedSleep = recentLogs.length * SLEEP_GOAL_HOURS;
        const debt = expectedSleep - totalSleep;

        const debtDisplay = document.getElementById('sleepDebtDisplay');
        if(debtDisplay) {
            if (debt > 0) {
                debtDisplay.innerText = `-${debt.toFixed(1)} hrs`;
                debtDisplay.style.color = "#d9534f"; 
            } else {
                debtDisplay.innerText = `+${Math.abs(debt).toFixed(1)} hrs`;
                debtDisplay.style.color = "#5cb85c"; 
            }
        }
    }

    function renderChart(logs) {
        const chartContainer = document.getElementById('sleepChart');
        if(!chartContainer) return;
        chartContainer.innerHTML = ''; 
        
        const recentLogs = logs.slice(-7);
        let totalHrs = 0;

        recentLogs.forEach(log => {
            let hours = log.durationHrsVal || 0;
            totalHrs += hours;

            const barGroup = document.createElement('div');
            barGroup.className = 'chart-bar-group';
            const heightPercentage = Math.min((hours / 12) * 100, 100);
            const dateLabel = log.date ? log.date.slice(5) : '--';

            barGroup.innerHTML = `
                <div class="bar" style="height: ${heightPercentage}%;" title="${hours.toFixed(1)} hrs"></div>
                <div class="bar-label">${dateLabel}</div>
            `;
            chartContainer.appendChild(barGroup);
        });

        const avgDisplay = document.getElementById('avgSleep');
        if (avgDisplay) {
            if (recentLogs.length > 0) {
                const avg = (totalHrs / recentLogs.length).toFixed(1);
                avgDisplay.innerText = avg;
            } else {
                avgDisplay.innerText = "--";
            }
        }
    }

    function renderHistory(logs) {
        const listContainer = document.getElementById('logHistory');
        if(!listContainer) return;
        listContainer.innerHTML = '';
        
        logs.slice().reverse().slice(0, 3).forEach(log => {
            const item = createHistoryItem(log);
            listContainer.appendChild(item);
        });
    }

    /* "2026-09-06" → "SUN, 6 SEP". Built from the date parts rather than
       new Date(key), which would re-introduce the UTC shift the rest of
       this file works to avoid. */
    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                         'Jul','Aug','Sep','Oct','Nov','Dec'];

    function prettyDate(key) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
        if (!m) return key || '--';
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return DAY_NAMES[d.getUTCDay()] + ', ' + (+m[3]) + ' ' + MONTH_NAMES[+m[2] - 1];
    }

    /* "23:30" → "11:30 pm". The 24-hour strings the inputs produce are
       precise but hard to read down a list. */
    function prettyTime(t) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
        if (!m) return null;
        const h = +m[1];
        const suffix = h < 12 ? 'am' : 'pm';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return h12 + ':' + m[2] + ' ' + suffix;
    }

    /* Feeling drives the pill's colour, so the list can be skimmed for
       bad nights without reading a word of it. */
    const FEELING_TONE = {
        'deep & restored': 'good',
        'adequate':        'ok',
        'inadequate':      'poor'
    };

    function createHistoryItem(log) {
        const item = document.createElement('div');
        item.className = 'history-item';

        const feel = log.feeling || '—';
        const dur = log.duration || (log.durationHrs ? log.durationHrs + ' hr' : '—');
        const score = log.quality ? log.quality : null;
        const tone = FEELING_TONE[String(feel).toLowerCase()] || 'ok';

        const bed = prettyTime(log.bedtime);
        const wake = prettyTime(log.waketime);
        /* A log saved with no bedtime (Alexa couldn't confirm one) shows
           the wake time alone rather than "null → 7:00 am". */
        const span = bed && wake ? bed + ' → ' + wake
                   : wake ? 'woke ' + wake
                   : bed ? 'slept ' + bed
                   : 'no times recorded';

        let factorsHtml = '';
        if (log.factors && log.factors.length > 0) {
            factorsHtml =
                '<div class="history-factors">' +
                log.factors.map(f => '<span class="mini-tag">' + f + '</span>').join('') +
                '</div>';
        }

        item.innerHTML = `
            <div class="history-main-row">
                <div class="h-when">
                    <span class="history-date">${prettyDate(log.date)}</span>
                    <span class="h-span">${span}</span>
                </div>

                <span class="history-dur">${dur}</span>

                <div class="h-tags">
                    ${score ? `<span class="quality-tag score">${score}<i>/10</i></span>` : ''}
                    <span class="quality-tag feel is-${tone}">${feel}</span>
                </div>
            </div>
            ${factorsHtml}
        `;
        return item;
    }

    // --- HISTORY VAULT LOGIC ---
    window.openHistoryModal = function() {
        const modal = document.getElementById('historyModal');
        const container = document.getElementById('fullHistoryList');
        
        let logs = window.currentLogs || [];
        container.innerHTML = '';

        logs.slice().reverse().forEach(log => {
            const item = createHistoryItem(log);
            container.appendChild(item);
        });

        modal.classList.add('active');
    }

    window.closeHistoryModal = function() {
        const modal = document.getElementById('historyModal');
        if(modal) modal.classList.remove('active');
    }

    const modal = document.getElementById('historyModal');
    if(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                window.closeHistoryModal();
            }
        });
    }

    // ==========================================
    // 🚀 ALEXA REAL-TIME LISTENER (FINALIZED)
    // ==========================================
    // SAM'S NOTE: This runs automatically to listen for Alexa
    const alexaRef = db.ref('alexa_updates');

    // Commands sit in the database until something clears them, and this
    // listener fires once on connect with whatever is already there. So a
    // finalize_log from this morning used to re-run saveSleepLog() every
    // single time the page was opened — the duplicate guard caught it, but
    // only by throwing the "ACCESS DENIED" alert in Jen's face.
    //
    // Two defences: ignore anything older than this window, and remember
    // the last timestamp actually acted on so a reload can't repeat it.
    const COMMAND_MAX_AGE_MS = 10 * 60 * 1000;   // 10 minutes
    const SEEN_KEY = 'sleep_last_alexa_ts';

    function alreadyHandled(ts) {
        try {
            return ts && Number(localStorage.getItem(SEEN_KEY)) >= ts;
        } catch (e) { return false; }
    }

    function markHandled(ts) {
        try { if (ts) localStorage.setItem(SEEN_KEY, String(ts)); }
        catch (e) { /* private mode — the age check still applies */ }
    }

    alexaRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Only sleep commands belong to this page. Hydration, FLO and the
        // upkeep timers all share alexa_updates, and their payloads used to
        // fall through to the quality/feeling/factor blocks below.
        const SLEEP_ACTIONS = ['set_bedtime', 'set_waketime', 'finalize_log'];
        const isSleepCommand = SLEEP_ACTIONS.indexOf(data.action) !== -1 ||
                               data.last_update === 'quality' ||
                               data.last_update === 'feeling' ||
                               data.last_update === 'factor';
        if (!isSleepCommand) return;

        const ts = Number(data.timestamp) || 0;
        if (ts && Date.now() - ts > COMMAND_MAX_AGE_MS) {
            console.log("⌛ Ignoring stale Alexa command from", new Date(ts).toLocaleString());
            return;
        }
        if (alreadyHandled(ts)) return;

        console.log("⚡ Alexa Command Received:", data);

        // Setting .value from code fires no event, and the styled pickers
        // repaint on 'change' — so every write from Alexa goes through
        // this, or the visible field keeps showing the previous time.
        const setField = (id, val) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = val || '';
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        // 1. BEDTIME COMMAND
        if (data.action === 'set_bedtime' && data.value) {
            setField('bedtime', data.value);
        }

        // 2. WAKE UP COMMAND
        if (data.action === 'set_waketime' && data.value) {
            setField('waketime', data.value);

            // Alexa sends the Manila date it woke Jen on. Trust it over the
            // laptop clock — the tab may not be opened until hours later.
            const dateInput = document.getElementById('logDate');
            if (dateInput && data.date) dateInput.value = data.date;

            // Alexa is the authority on bedtime for a voice-driven log: it
            // either confirmed a marker from last night or asked outright.
            // Writing null here is deliberate and must CLEAR the field —
            // leaving whatever was there meant calculateDuration() measured
            // against a draft from an earlier night, which is how a wake-up
            // with no bedtime on record produced a 40-hour sleep.
            setField('bedtime', data.bedtime);
            const bedInput = document.getElementById('bedtime');
            if (bedInput) localStorage.setItem('draft_bedtime', bedInput.value);

            if (bedInput && bedInput.value) {
                calculateDuration();
            } else {
                const display = document.getElementById('durationResult');
                if (display) display.innerText = "0 hr 0 min";
            }
        }

        // 3. QUALITY RATING
        if (data.quality_score) {
            document.getElementById('quality').value = data.quality_score;
            document.getElementById('qualityVal').innerText = data.quality_score;
        }

        // 4. FEELING SELECTION
        if (data.feeling_status) {
            const dropdown = document.getElementById('sleepFeeling');
            if(dropdown) {
                dropdown.value = data.feeling_status;
                // The styled face listens for 'change'. Setting .value from
                // code fires nothing on its own, so it has to be announced
                // or the visible control keeps showing the old feeling.
                dropdown.dispatchEvent(new Event('change', { bubbles: true }));

                // Flash the visible control, not the hidden native one.
                const face = dropdown.closest('.pk-wrap');
                const flash = (face && face.querySelector('.pk-face')) || dropdown;
                flash.style.borderColor = "#3e3831";
                setTimeout(() => flash.style.borderColor = "", 500);
            }
        }

        // 5. FACTOR SELECTION
        if (data.factor_tag && data.factor_tag !== "None") {
            const chips = document.querySelectorAll('.chip');
            chips.forEach(chip => {
                if (chip.innerText.toUpperCase() === data.factor_tag.toUpperCase()) {
                    if (!chip.classList.contains('selected')) {
                        chip.click(); 
                    }
                }
            });
        }

        // 6. FINALIZE & SAVE
        if (data.action === 'finalize_log') {
            // Record the timestamp BEFORE saving. If saveSleepLog() throws
            // or the tab is closed mid-write, the command still counts as
            // consumed — a missed log is recoverable by hand, a log that
            // re-fires on every reload is not.
            markHandled(ts);

            window.saveSleepLog();

            // Clear the command so a second device (or a reload before the
            // age window expires) doesn't replay it. This is the line that
            // was commented out.
            setTimeout(() => {
                alexaRef.set(null).catch(err =>
                    console.warn("Couldn't clear the Alexa command:", err));
            }, 3000);
        }

    });

    // ==========================================
    // 💾 AUTO-SAVE (DRAFT) SYSTEM
    // ==========================================
    function initAutoSave() {
        // Drafts only survive the night they were typed on.
        //
        // clearDraft() runs on a successful save, so an unsaved night left
        // its bedtime in localStorage forever. Restoring it days later put
        // a stale time in the field, and the next wake-up measured against
        // it — a bedtime from Tuesday and a wake time from Thursday.
        // Anything not from today (Manila) is dropped on load.
        const draftDay = localStorage.getItem('draft_day');
        if (draftDay !== phToday()) {
            clearDraft();
            localStorage.setItem('draft_day', phToday());
        }

        const savedBed = localStorage.getItem('draft_bedtime');
        const savedWake = localStorage.getItem('draft_waketime');
        const savedQuality = localStorage.getItem('draft_quality');
        const savedFeel = localStorage.getItem('draft_feeling');

        // Restoring a draft writes .value directly, which fires no event.
        // The styled pickers repaint on 'change', so each restore has to
        // announce itself or the face shows "--:-- --" over a real value.
        const restore = (id, val) => {
            const el = document.getElementById(id);
            if (!el || !val) return;
            el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        restore('bedtime', savedBed);
        restore('waketime', savedWake);
        restore('sleepFeeling', savedFeel);

        if(savedQuality) {
            document.getElementById('quality').value = savedQuality;
            document.getElementById('qualityVal').innerText = savedQuality;
        }

        if(savedBed && savedWake) calculateDuration();

        const ids = ['bedtime', 'waketime', 'quality', 'sleepFeeling'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.addEventListener(id === 'sleepFeeling' ? 'change' : 'input', (e) => {
                    localStorage.setItem('draft_' + id, e.target.value);
                    // Stamp the day alongside, so tomorrow's load knows
                    // this draft is stale and drops it.
                    localStorage.setItem('draft_day', phToday());
                });
            }
        });
    }

    function clearDraft() {
        ['bedtime', 'waketime', 'quality', 'sleepFeeling'].forEach(k => localStorage.removeItem('draft_'+k));
        localStorage.removeItem('draft_day');
    }

})();