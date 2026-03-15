/* ============================================
   Family Tracker — Shared Backend Server
   Express + WebSocket for real-time sync
   ============================================ */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const TZ = 'America/New_York';

function nowET() { return new Date().toLocaleDateString('en-CA', {timeZone: TZ}); }
function timeET() { return new Date().toLocaleTimeString('en-US', {timeZone: TZ, hour: 'numeric', minute: '2-digit'}); }

// ---- Default Data ----
function getDefaults() {
    return {
        members: [
            { id:'dad', name:'Dad', avatar:'👨', role:'parent', pin:'1234' },
            { id:'mom', name:'Mom', avatar:'👩', role:'parent', pin:'1234' },
            { id:'sophia', name:'Sophia', avatar:'👧', role:'child', pin:'' },
            { id:'olivia', name:'Olivia', avatar:'👧', role:'child', pin:'' },
        ],
        tasks: [
            { id:'t1', name:'Clean up toys', emoji:'🧸', cat:'cleanliness', pts:10, max:1 },
            { id:'t2', name:'Make bed', emoji:'🛏️', cat:'cleanliness', pts:5, max:1 },
            { id:'t3', name:'Keep room tidy', emoji:'✨', cat:'cleanliness', pts:5, max:1 },
            { id:'t4', name:'Take a shower', emoji:'🚿', cat:'cleanliness', pts:5, max:1 },
            { id:'t5', name:'Brush teeth (morning)', emoji:'🪥', cat:'cleanliness', pts:2.5, max:1 },
            { id:'t6', name:'Brush teeth (night)', emoji:'🪥', cat:'cleanliness', pts:2.5, max:1 },
            { id:'t7', name:'Take dogs out', emoji:'🐕', cat:'dogs', pts:3, max:5 },
            { id:'t8', name:'Feed dogs (morning)', emoji:'🥣', cat:'dogs', pts:5, max:1 },
            { id:'t9', name:'Feed dogs (evening)', emoji:'🥣', cat:'dogs', pts:5, max:1 },
            { id:'t10', name:'Finish schoolwork by 12 PM', emoji:'📚', cat:'school', pts:15, max:1 },
            { id:'t11', name:'GPA 3.8+ bonus', emoji:'🏆', cat:'school', pts:5, max:1 },
            { id:'t12', name:'Drink a glass of water', emoji:'💧', cat:'health', pts:2, max:5 },
            { id:'t13', name:'Eat fruits', emoji:'🍎', cat:'health', pts:5, max:1 },
            { id:'t14', name:'Eat veggies', emoji:'🥦', cat:'health', pts:5, max:1 },
            { id:'t15', name:'Set table for dinner', emoji:'🍽️', cat:'household', pts:5, max:1 },
            { id:'t16', name:'Exercise / Play Outside', emoji:'🏃', cat:'health', pts:5, max:1 },
            { id:'t17', name:'Stretching / Yoga', emoji:'🧘', cat:'health', pts:3, max:1 },
        ],
        rewards: [
            { id:'r3', name:'Pick Movie Night', emoji:'🎬', cost:500 },
            { id:'r5', name:'Pick Dinner Place', emoji:'🍴', cost:750 },
            { id:'r6', name:'$5 Gift', emoji:'🎁', cost:1000 },
            { id:'r7', name:'$10 Gift', emoji:'🎀', cost:2000 },
            { id:'r8', name:'$15 Gift', emoji:'🧸', cost:3000 },
            { id:'r9', name:'$20 Gift', emoji:'🎮', cost:4000 },
            { id:'r10', name:'Chuck E. Cheese Trip', emoji:'🎪', cost:2000 },
        ],
        progress: {},
        rewardLog: [],
        actLog: [],
        settings: { sound: true }
    };
}

// ---- Load/Save Data ----
let DATA;
try {
    DATA = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // migration
    if (!DATA.rewardLog) DATA.rewardLog = [];
    if (!DATA.actLog) DATA.actLog = [];
    if (!DATA.rewards) DATA.rewards = getDefaults().rewards;
    if (!DATA.settings) DATA.settings = { sound: true };
    console.log('📂 Loaded existing data from', DATA_FILE);
} catch (e) {
    DATA = getDefaults();
    console.log('🆕 Created fresh data');
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DATA, null, 2));
}

// Save initial
saveData();

// ---- Serve static files ----
app.use(express.static(__dirname));
app.use(express.json({ limit: '1mb' }));

// ---- REST API ----

// Get all data
app.get('/api/data', (req, res) => {
    res.json(DATA);
});

// Update: client sends a patch
app.post('/api/update', (req, res) => {
    const { type, payload } = req.body;

    if (type === 'taskComplete') {
        const { mid, date, tid, count } = payload;
        if (!DATA.progress[date]) DATA.progress[date] = {};
        if (!DATA.progress[date][mid]) DATA.progress[date][mid] = {};
        DATA.progress[date][mid][tid] = count;
        DATA.actLog.push({
            mid, tid, action: count > (DATA.progress[date]?.[mid]?.[tid] ?? 0) ? 'complete' : 'undo',
            date, time: timeET()
        });
        if (DATA.actLog.length > 500) DATA.actLog = DATA.actLog.slice(-500);
    }
    else if (type === 'rewardRedeem') {
        const { mid, reward } = payload;
        DATA.rewardLog.push({ mid, ...reward, date: nowET() });
        DATA.actLog.push({
            mid, tid: null, action: 'reward', detail: reward.name,
            date: nowET(),
            time: timeET()
        });
    }
    else if (type === 'parentEdit') {
        const { mid, date, tid, count } = payload;
        if (!DATA.progress[date]) DATA.progress[date] = {};
        if (!DATA.progress[date][mid]) DATA.progress[date][mid] = {};
        DATA.progress[date][mid][tid] = count;
        DATA.actLog.push({
            mid, tid, action: 'edit (parent)', date,
            time: timeET()
        });
    }
    else if (type === 'updateTasks') {
        DATA.tasks = payload.tasks;
    }
    else if (type === 'updateRewards') {
        DATA.rewards = payload.rewards;
    }
    else if (type === 'updateMembers') {
        DATA.members = payload.members;
    }
    else if (type === 'updateSettings') {
        DATA.settings = payload.settings;
    }
    else if (type === 'resetToday') {
        const today = nowET();
        delete DATA.progress[today];
    }
    else if (type === 'resetAll') {
        const fresh = getDefaults();
        Object.assign(DATA, fresh);
    }
    else if (type === 'fullSync') {
        // Client sends entire data object (for import)
        const d = payload.data;
        if (d && d.members && d.tasks) {
            Object.assign(DATA, d);
            if (!DATA.rewardLog) DATA.rewardLog = [];
            if (!DATA.actLog) DATA.actLog = [];
        }
    }

    saveData();
    res.json({ ok: true });

    // Broadcast to all connected WebSocket clients
    broadcast({ type: 'sync', data: DATA });
});

// ---- WebSocket ----
function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(str);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('🔌 Client connected. Total:', wss.clients.size);
    // Send current data immediately
    ws.send(JSON.stringify({ type: 'sync', data: DATA }));

    ws.on('close', () => {
        console.log('🔌 Client disconnected. Total:', wss.clients.size);
    });
});

// ---- Start ----
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n⭐ Family Tracker server running on port ${PORT}`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Ready for connections!\n`);
});
