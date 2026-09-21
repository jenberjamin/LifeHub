/* js/fitness-centre.js */

// Constants
const TOP_TIMER = 15000; 
        const BOTTOM_TIMER = 20000; 
        
        const topQuotesList = [
            "You mirror, not magnetized.",
            "You can be whoever you aim to be.",
            "Let Results Speak",
            "Architecture: Body",
            "Start it. Do it. Until it becomes an autopilot.",
            "High standard = High respect",
            "Being high standard is 90% discipline 10% glam.",
            "Make people feel uneasy by not knowing your next move.",
            "Be someone far from their reach.",
            "Discipline is the highest form of self love.",
            "Be stronger than your excuse.",
            "WORK. SWEAT. ACHIEVE.",
            "You vs. You.",
            "Consistency. Consistency. Consistency. Consistency.",
            "Fit is a decision.",
            "CEO energy.",
            "Victoria Secret energy.",
            "The comeback is personal. It's an apology to yourself.",
            "1% better everyday.",
            "Train insane or remain the same.",
            "Become fucking obsessed with the mission!",
            "Your brain loves rewards. Use that to your advantage.",
            "Sleep for 7 hours. Not 10 hours. Not 4 hours.",
            "Train for 1 hour. Not 3.",
            "Don't forget to update your measurements.",
            "The only bad workout is the one that didn't happen.",
            "It never gets easier. You just get better.",
            "Sore today, strong tomorrow.",
            "Sweat now, shine later.",
            "Stronger than yesterday.",
            "Train like a beast, look like a beauty.",
            "Earn your shower.",
            "Defy your limits.",
            "My warm-up is your workout.",
            "Sweating like a sinner in church.",
            "Everything hurts and I'm dying. See you tomorrow.",
            "I wear black to the gym because it’s a funeral for my fat.",
            "Sore AF.",
            "Team Hard Gainer.",
            "Your future self will thank you.",
            "Invest in yourself. It pays the best interest.",
            "Hustle for that muscle.",
            "Don't wish for it. Work for it.",
            "Go hard or go home.",
	    "Action cures anxiety.",
            "Slow progress is still progress.",
            "Work on you, for you.",
            "Under Construction.",
	    "Work on you. For you.",
	    "Mode: Sexy AF.",
            "Leveling Up.",
            "Don't decrease the goal. Increase the effort.",
            "Small steps every day add up to big results.",
            "Your body hears everything your mind says.",
            "Glowing and growing.",
            "Hustle for that muscle.",
            "Peach in progress.",
            "Good things come to those who sweat.",
            "It won't be easy, but it'll be worth it.",
            "The clock is ticking. Are you becoming the person you want to be?",
            "You didn't come this far to only come this far.",
            "You're not done yet.",
            "Every rep is a choice to be better.",
            "You control this, not the weight.",
            "You didn't wake up today to be average.",
            "No, Jen. You're not average.",
            "Prove yourself wrong about what you can't do.",
            "Rest is part of the work.",
            "Sleep builds muscle, not just lifting.",
            "Take your workout selfie.",
            "Something is better than nothing.",
            "Show up even on low-energy days.",
            "Listen to your body, not your ego.",
            "Full range of motion beats half reps.",
            "Rest between sets—your muscles need it.",
            "Rest days are part of the program, not weakness.",
            "Listen to your body, not just your playlist.",
            "Work it, make it, do it.",
            "Harder, better, faster, stronger.",
            "Classy, bougie, ratchet. Sassy, moody, nasty.",
            "You see it, You like it, You want it, You got it..",
            "Don't stop believin', hold on to that feelin'.",
            "Started from the bottom, now here you are.",
            "Can't stop, won't stop.",
            "Look at you.",
            "Long story short, you survived.",
            "Everything you lose is a step you take.",
            "Ask yourself why so many fade, but you're still here.",
            "It's never too late to be brand new.",
            "You'll never find another like you.",
            "In my reputation era.",
            "You gotta get up and try, try, try.",
            "No one can be just like you any way.",
            "We don't have to be ordinary.",
            "Complicated? No, just dedicated.",
            "Shut up and go lift.",
            "Clear skin. Shiny hair. Fit body. Healthy mind.",
            "Motherf*cking Princess.",
            "Trust the process.",
            "The Best Damn Thing Is Today.",
            "Upgrade your life in silence.",
            "Action board.",
            "Dream body mode.",
	    "If you're tired. Do it tired.",
	    "New Era.",
	    "Shock them.",
	    "Small steps lead to big impact.",
	    "Quit here? or Get better?.",
	    "Focus: Leveling UP.",
	    "Own lane. Own race. Owan pace.",
	    "Yes, you can and yes, you will.",
	    "Outwork them.",
	    "In my 'I don't know how, but I will' era.",
	    "Be the woman you look up to.",
            "Don't wish for it. Work for it.",
            "Rumour has it they secretly envy you."
        ];

        const bottomQuotesList = [
            "The gap between failure and success? It’s not talent. It’s not luck. It’s relentless consistency.",
	    "Discipline will take you places. Motivation can't.",
	    "Work until you're on someone's vision board.",
            "If your mindset is stronger than the rejection, If your persistence outlasts the setbacks, If you never give up — There is nothing you can’t achieve.",
	    "Discipline is choosing between what you want now and what you want MOST.",
            "Do it alone. Do it broke. Do it tired. Do it scared. Just do it.",
            "You can be whoever you aim to be. Stop believing that someone else gets to decide how far you’re destined to go.",
	    "21/90 RULE. It takes 21 days to create a habit. It takes 90 days to create a lifestyle.",
            "Your next chapter is going to cause some people to wish they had treated you better. Be prepared.",
            "It's a slow process, but quitting won't speed it up.",
            "You spend most of your life inside your head. Make it a nice place to be.",
            "Discipline is choosing between what you want now and what you want most.",
            "The strongest are gentle. The smartest are quiet. The wealthiest are simple. The happiest are private.",
            "Motivation is what gets you started. Habit is what keeps you going.",
            "It’s not talent. It’s not luck. It’s relentless consistency.",
            "Discipline is doing what needs to be done, even if you don't want to do it.",
            "Don’t stop when you’re tired. Stop when you’re done.",
            "Fall in love with the process, and the results will come.",
            "Don't decrease the goal. Increase the effort.",
            "Discipline is choosing between what you want now and what you want most. Choose what you want most.",
            "You are not defined by the days you fall down, but by the courage it takes to stand back up and grab the weights again.",
            "The greatest project you will ever work on is you, so take your time and enjoy the process of construction.",
            "Be the person who decided to go for it when everyone else decided to sleep in.",
            "Ten percent luck, twenty percent skill, fifteen percent concentrated power of will.",
            "Ain't about how fast I get there. Ain't about what's waiting on the other side. It's the climb.",
            "I could build a castle out of all the bricks they threw at me.",
            "Where there is desire, there is gonna be a flame. Where there is a flame, someone's bound to get burned.",
            "Just like fire, burning out the way. If I can light the world up for just one day.",
            "Pretty, pretty please, don't you ever, ever feel, like you're less than f*ckin' perfect.",
            "Confidence grows with action and shrinks with inaction.",
            "Make people feel uneasy by not knowing your next move.",
            "We all grow at different rates and that’s okay!."
        ];

// Elements
const topEl = document.getElementById('topQuote');
const bottomEl = document.getElementById('bottomQuote');
let topInterval, bottomInterval;

// --- Quote Logic ---
function getRandom(list, currentText) {
    let newItem;
    do { newItem = list[Math.floor(Math.random() * list.length)]; }
    while (newItem === currentText && list.length > 1);
    return newItem;
}

function cycleText(element, list) {
    element.classList.add('hidden');
    setTimeout(() => {
        const newText = getRandom(list, element.innerText.replace(/"/g, ''));
        element.innerText = `"${newText}"`;
        element.classList.remove('hidden');
    }, 800);
}

function startTopTimer() { topInterval = setInterval(() => cycleText(topEl, topQuotesList), TOP_TIMER); }
function startBottomTimer() { bottomInterval = setInterval(() => cycleText(bottomEl, bottomQuotesList), BOTTOM_TIMER); }

// Event Listeners for Hover Pausing
if(topEl && bottomEl){
    topEl.addEventListener('mouseenter', () => { clearInterval(topInterval); topEl.style.opacity = "1"; });
    topEl.addEventListener('mouseleave', () => { startTopTimer(); });
    bottomEl.addEventListener('mouseenter', () => { clearInterval(bottomInterval); bottomEl.style.opacity = "1"; });
    bottomEl.addEventListener('mouseleave', () => { startBottomTimer(); });
}

// --- Mission Status ---
function checkMissionStatus() {
    const btn = document.querySelector('.btn-start');
    if(!btn) return;
    
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    const todaysMission = templates.find(t => t.date === todayStr && !t.isCompleted);

    // Both branches set the same label, so only the class does anything —
    // .btn-start.mission-ready lights the button up on hover when there is
    // work waiting today. Setting the identical text twice just made it look
    // like the two states were supposed to read differently.
    btn.classList.toggle('mission-ready', !!todaysMission);
}

// --- HUD Logic ---
window.toggleHUD = function() {
    const hud = document.getElementById('profileHud');
    if (hud.style.display === 'block') {
        hud.style.opacity = '0';
        hud.style.transform = 'translateY(-20px)';
        setTimeout(() => hud.style.display = 'none', 300);
    } else {
        refreshHUDData();
        hud.style.display = 'block';
        setTimeout(() => {
            hud.style.opacity = '1';
            hud.style.transform = 'translateY(0)';
        }, 10);
    }
}

function refreshHUDData() {
    if (typeof UserProfile === 'undefined') { console.log("Core missing for HUD"); return; }

    // 1. Load Data
    const templates = JSON.parse(localStorage.getItem('lh_templates')) || [];
    const logs = UserProfile.systemLogs || [];
    // (A local copy of LifeHub_Measurements used to be re-parsed here and
    //  shadowed core's own historyLogs. Weight now comes from core's
    //  getLatestMeasurement, which reads the sorted array, so it is gone.)
    const now = new Date();

    // A. Total Workouts
    const totalDone = templates.filter(t => t.isCompleted).length;
    document.getElementById('hudTotalWO').innerText = totalDone;

    // B. Streak — the live one big, the record beneath it
    document.getElementById('hudStreak').innerText = UserProfile.streak || 0;
    document.getElementById('hudBestStreak').innerText = `best · ${UserProfile.bestStreak || 0}`;

    // C. Fitness Level & Prestige
    // Note: Assuming UserProfile.prestigeCurrency is populated from your Prestige Firebase eventually
    if(typeof FITNESS_LEVELS !== 'undefined'){
        const fitStat = getLevelStatus(UserProfile.fitnessPoints, FITNESS_LEVELS, true);
        document.getElementById('hudLvlNum').innerText = fitStat.level;
        document.getElementById('hudLvlBar').style.width = fitStat.pct + "%";
    }
    document.getElementById('hudTotalPrestige').innerText = (UserProfile.prestigeCurrency || 0).toLocaleString();

    // D. Weight & BMI
    // Records are sparse now, so the newest one may hold no weight at all.
    // getLatestMeasurement walks back to the last entry that actually had
    // one, instead of reading the top row and finding nothing.
    const latestWeight = (typeof getLatestMeasurement === 'function')
        ? getLatestMeasurement("Weight") : null;

    if (latestWeight) {
        const w = latestWeight.value;
        document.getElementById('hudWeight').innerHTML = w + ' <span style="font-size:10px">kg</span>';
        // Shared with the measurements page and the gallery — this used to
        // hardcode 1.6 m and disagree with both.
        document.getElementById('hudBMI').innerText = calculateBMI(w);
    }

    // E. Weekly Monitor
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    const recentTemplates = templates.filter(t => t.isCompleted && new Date(t.date) >= oneWeekAgo);

    let wkEx = 0, wkTime = 0, wkPrestige = 0;

    recentTemplates.forEach(t => {
        if (t.exercises) wkEx += t.exercises.length;
        if (t.durationSeconds) wkTime += t.durationSeconds;
    });

    logs.filter(l => new Date(l.date) >= oneWeekAgo && l.type === 'prestige').forEach(l => {
        const match = l.text.match(/\[\+(\d+)/);
        if (match) wkPrestige += parseInt(match[1]);
    });

    document.getElementById('hudWkEx').innerText = wkEx;
    document.getElementById('hudWkPres').innerText = wkPrestige.toLocaleString();
    const h = Math.floor(wkTime / 3600);
    const m = Math.floor((wkTime % 3600) / 60);
    document.getElementById('hudWkTime').innerText = `${h}h ${m}m`;

    // --- RENDER WEEKLY BUBBLES ---
    renderWeeklyBubbles(templates, logs, now);
}

function renderWeeklyBubbles(templates, logs, now) {
    const weekContainer = document.getElementById('hudWeekGrid');
    weekContainer.innerHTML = '';
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const currentDayIndex = now.getDay();

    const lastSaturday = new Date(now);
    lastSaturday.setDate(now.getDate() - currentDayIndex - 1);
    const satStr = formatDate(lastSaturday);

    const satDone = templates.some(t => t.date === satStr && t.isCompleted);
    const satGrace = logs.some(l => formatDate(new Date(l.date)) === satStr && l.type === 'grace');

    let daysSinceLastActivity = (satDone || satGrace) ? 0 : 1;

    // Midnight today, computed once. The old line did this inline with
    // `bubbleDate.setHours(0,0,0,0) > now.setHours(0,0,0,0)` — a comparison
    // that quietly rewrote `now` on the first pass. It happened to survive
    // because only the date part was read afterwards, but it left a caller's
    // object altered mid-loop, which is the kind of thing that stops being
    // harmless the moment someone adds a line below it.
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - currentDayIndex);

    for (let i = 0; i < 7; i++) {
        const bubbleDate = new Date(startOfWeek);
        bubbleDate.setDate(startOfWeek.getDate() + i);

        const bubbleLocalStr = formatDate(bubbleDate);
        const isFuture = new Date(bubbleDate.getFullYear(), bubbleDate.getMonth(), bubbleDate.getDate()) > todayMidnight;
        const isDone = templates.some(t => t.date === bubbleLocalStr && t.isCompleted);
        const isGrace = logs.some(l => formatDate(new Date(l.date)) === bubbleLocalStr && l.type === 'grace');

        let bubbleClass = '';
        if (isFuture) {
            bubbleClass = 'future';
        } else if (isDone) {
            bubbleClass = 'b-cyan';
            daysSinceLastActivity = 0;
        } else if (isGrace) {
            bubbleClass = 'b-pink';
            daysSinceLastActivity = 0;
        } else {
            daysSinceLastActivity++;
            bubbleClass = (daysSinceLastActivity < 2) ? 'b-yellow' : 'b-red';
        }

        const bubble = document.createElement('div');
        bubble.className = `day-bubble ${bubbleClass}`;
        bubble.innerText = days[i];
        weekContainer.appendChild(bubble);
    }
}

// Helper to ensure YYYY-MM-DD consistency
function formatDate(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

// --- Initialization ---
window.onload = () => {
    // Randomize text immediately
    if(topEl && bottomEl){
        topEl.innerText = `"${getRandom(topQuotesList, '')}"`;
        bottomEl.innerText = `"${getRandom(bottomQuotesList, '')}"`;
        startTopTimer();
        startBottomTimer();
    }
    checkMissionStatus();
};

/* --- LIVE VAULT ---------------------------------------------------------
   Redraw when the cloud moves under us — a workout Poppy scheduled, or a
   session finished on another device. The HUD is only rebuilt when it is
   actually open; rebuilding it behind the overlay would be wasted work. */
if (window.LIFEHUB_FITNESS) {
    window.LIFEHUB_FITNESS.onChange(function () {
        checkMissionStatus();
        const hud = document.getElementById('profileHud');
        if (hud && hud.style.display === 'block') refreshHUDData();
    });
}