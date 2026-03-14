/* ============================================
   Family Activity Tracker — Full App
   With real-time sync via WebSocket
   ============================================ */

// =========== SOUND EFFECTS ===========
const SFX = {
    ctx: null, enabled: true,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play(type) {
        if (!this.enabled) return;
        this.init();
        const c = this.ctx, now = c.currentTime;
        const n = (freq, start, dur, vol=0.25, wave='sine') => {
            const o=c.createOscillator(), g=c.createGain();
            o.connect(g); g.connect(c.destination); o.type=wave;
            o.frequency.setValueAtTime(freq,now+start);
            g.gain.setValueAtTime(vol,now+start);
            g.gain.exponentialRampToValueAtTime(0.001,now+start+dur);
            o.start(now+start); o.stop(now+start+dur);
        };
        if(type==='complete'){n(523,0,0.2);n(659,0.1,0.2);n(784,0.2,0.25);}
        else if(type==='undo'){n(500,0,0.15,0.2,'triangle');n(350,0.08,0.15,0.2,'triangle');}
        else if(type==='reward'){n(523,0,0.3);n(659,0.12,0.3);n(784,0.24,0.3);n(1047,0.36,0.4);}
        else if(type==='allDone'){[523,659,784,1047,784,1047].forEach((f,i)=>n(f,i*0.1,0.25));}
        else if(type==='click'){n(800,0,0.06,0.08);}
    }
};

const CATS = [
    {id:'all',name:'All',emoji:'⭐'},{id:'cleanliness',name:'Clean',emoji:'🧹'},
    {id:'dogs',name:'Dogs',emoji:'🐕'},{id:'school',name:'School',emoji:'📚'},
    {id:'health',name:'Health',emoji:'🥗'},{id:'household',name:'Home',emoji:'🏠'},
];

// =========== SERVER SYNC ===========
let D = null;
let ws = null;
let wsTimer = null;

function apiUrl(p) { return window.location.origin + p; }
function wsUrl() { return (location.protocol==='https:'?'wss:':'ws:')+'//'+location.host; }

async function fetchData() {
    try { const r=await fetch(apiUrl('/api/data')); D=await r.json(); SFX.enabled=D.settings?.sound!==false; return true; }
    catch(e) { console.error('Fetch failed:',e); return false; }
}

async function sendUpdate(type, payload) {
    try { await fetch(apiUrl('/api/update'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,payload})}); }
    catch(e) { console.error('Update failed:',e); toast('⚠️ Connection error'); }
}

function connectWS() {
    if (ws && ws.readyState <= 1) return;
    try {
        ws = new WebSocket(wsUrl());
        ws.onopen = () => { clearTimeout(wsTimer); const ind=document.getElementById('offline-ind'); if(ind)ind.remove(); };
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'sync') {
                    D = msg.data; SFX.enabled = D.settings?.sound !== false;
                    if (screen === 'main' && user) { user = D.members.find(m=>m.id===user.id)||user; renderTab(); updHdr(); }
                }
            } catch(err) {}
        };
        ws.onclose = () => { showOffline(); wsTimer = setTimeout(connectWS, 3000); };
        ws.onerror = () => { ws.close(); };
    } catch(e) { wsTimer = setTimeout(connectWS, 3000); }
}

function showOffline() {
    if (document.getElementById('offline-ind')) return;
    const d=document.createElement('div'); d.id='offline-ind';
    d.style.cssText='position:fixed;top:0;left:0;right:0;background:#FF6B6B;color:#fff;text-align:center;padding:4px;font-size:0.75rem;font-weight:700;z-index:9999;';
    d.textContent='⚡ Reconnecting...'; document.body.appendChild(d);
}

// =========== STATE ===========
let user = null, screen = 'login', selDate = today(), selCat = 'all', tab = 'tasks', allDoneMap = {};
let parentEditChild = null, parentEditDate = null;

// =========== UTILS ===========
function today() { return new Date().toISOString().slice(0,10); }
function fmtDate(ds) {
    if(ds===today()) return '📅 Today';
    const y=new Date(); y.setDate(y.getDate()-1);
    if(ds===y.toISOString().slice(0,10)) return '📅 Yesterday';
    return new Date(ds+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}
function addDays(ds,n){const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function last7(){const o=[];for(let i=6;i>=0;i--)o.push(addDays(today(),-i));return o;}
function prog(mid,ds){return(D.progress[ds]||{})[mid]||{};}
function tcount(mid,ds,tid){return prog(mid,ds)[tid]||0;}
function dayPts(mid,ds){const p=prog(mid,ds);let s=0;for(const tid in p){const t=D.tasks.find(x=>x.id===tid);if(t)s+=p[tid]*t.pts;}return s;}
function maxPts(){return D.tasks.reduce((s,t)=>s+t.pts*t.max,0);}
function lifePts(mid){let s=0;for(const ds in D.progress)s+=dayPts(mid,ds);return s-(D.rewardLog||[]).filter(r=>r.mid===mid).reduce((a,r)=>a+r.cost,0);}
function streak(mid){let s=0,d=today(),mx=maxPts();while(dayPts(mid,d)>=mx*0.5){s++;d=addDays(d,-1);}return s;}

// =========== UI HELPERS ===========
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2500);}
function floatPts(x,y,pts){const e=document.createElement('div');e.className='float-points';e.textContent='+'+pts;e.style.left=x+'px';e.style.top=y+'px';document.body.appendChild(e);setTimeout(()=>e.remove(),1000);}
function confetti(){const em=['🎉','⭐','🌟','✨','💫','🎊','🥳','💖','🌈','💎'];for(let i=0;i<24;i++){const e=document.createElement('div');e.className='confetti';e.textContent=em[Math.floor(Math.random()*em.length)];e.style.left=Math.random()*100+'vw';e.style.animationDelay=Math.random()*0.8+'s';e.style.fontSize=(1+Math.random()*1.5)+'rem';document.body.appendChild(e);setTimeout(()=>e.remove(),3500);}}
function checkAllDone(){const k=user.id+'_'+selDate;if(allDoneMap[k])return;if(dayPts(user.id,selDate)>=maxPts()){allDoneMap[k]=true;SFX.play('allDone');confetti();toast('🎉 ALL TASKS COMPLETE! Amazing job! 🎉');}}

async function modal(title,msg,btns){
    return new Promise(res=>{
        const o=document.createElement('div');o.className='modal-overlay';
        o.innerHTML='<div class="modal-box"><h3>'+title+'</h3><p>'+msg+'</p><div class="modal-btns">'+btns.map((b,i)=>'<button class="modal-btn '+(b.cls||'')+'" data-i="'+i+'">'+b.label+'</button>').join('')+'</div></div>';
        document.body.appendChild(o);
        o.querySelectorAll('.modal-btn').forEach(b=>b.addEventListener('click',()=>{o.remove();res(+b.dataset.i);}));
    });
}

const app = document.getElementById('app');
function render(){screen==='login'?renderHome():renderMain();}

// =========== HOME DASHBOARD ===========
function renderHome(){
    const children=D.members.filter(m=>m.role==='child');
    const mx=maxPts();
    const td=today();
    const dateStr=new Date(td+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    const catList=[{id:'cleanliness',emoji:'🧹',name:'Clean'},{id:'dogs',emoji:'🐕',name:'Dogs'},{id:'school',emoji:'📚',name:'School'},{id:'health',emoji:'🥗',name:'Health'},{id:'household',emoji:'🏠',name:'Home'}];

    // Flowers
    let flowers='';
    for(let i=0;i<14;i++){
        const em=['🌸','🌺','🌼','✨','🎀','💖','🍓'][Math.floor(Math.random()*7)];
        flowers+='<div class="home-flower" style="left:'+Math.random()*100+'%;top:'+Math.random()*100+'%;animation-delay:'+Math.random()*4+'s;font-size:'+(1+Math.random()*0.8)+'rem">'+em+'</div>';
    }

    // SVG gradient definitions
    let svgDefs='<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="grad-sophia" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#FF69B4"/><stop offset="100%" style="stop-color:#FF1493"/></linearGradient><linearGradient id="grad-olivia" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#9B59B6"/><stop offset="100%" style="stop-color:#8E44AD"/></linearGradient></defs></svg>';

    // Build kid columns
    let kidCols=children.map((ch,idx)=>{
        const pts=dayPts(ch.id,td);
        const pct=mx?Math.min(100,Math.round(pts/mx*100)):0;
        const life=lifePts(ch.id);
        const str=streak(ch.id);
        const cls=idx===0?'sophia':'olivia';
        return '<div class="home-kid-col" data-id="'+ch.id+'">'
            +'<div class="home-ring-wrap"><svg class="home-ring-svg" viewBox="0 0 140 140">'
            +'<circle class="home-ring-bg" cx="70" cy="70" r="60"/>'
            +'<circle class="home-ring-fill '+cls+'" cx="70" cy="70" r="60" data-pct="'+pct+'"/>'
            +'</svg><div class="home-ring-center"><span class="home-ring-avatar">'+ch.avatar+'</span></div></div>'
            +'<div class="home-kid-name">'+ch.name+'</div>'
            +'<div class="home-pts-big">'+Math.floor(pts)+'</div>'
            +'<div class="home-pts-label">pts today</div>'
            +'<div class="home-pts-pct">'+pct+'%</div>'
            +'<div class="home-lifetime">💰 '+Math.floor(life)+' total</div>'
            +(str>1?'<div class="home-streak">🔥 '+str+' day streak!</div>':'')
            +'</div>';
    }).join('');

    // Category comparison bars
    let catBars=catList.map(cat=>{
        const catTasks=D.tasks.filter(t=>t.cat===cat.id);
        const catMax=catTasks.reduce((s,t)=>s+t.pts*t.max,0);
        if(catMax===0) return '';
        const s1=catTasks.reduce((s,t)=>s+tcount(children[0]?.id||'',td,t.id)*t.pts,0);
        const s2=catTasks.reduce((s,t)=>s+tcount(children[1]?.id||'',td,t.id)*t.pts,0);
        const p1=Math.round(s1/catMax*100);
        const p2=Math.round(s2/catMax*100);
        return '<div class="home-cat-row"><div class="home-cat-emoji">'+cat.emoji+'</div><div class="home-cat-bar-wrap"><div class="home-cat-bar-pair"><div class="home-cat-bar sophia" style="width:'+Math.max(4,p1)+'%"></div><div class="home-cat-bar olivia" style="width:'+Math.max(4,p2)+'%"></div></div><div class="home-cat-name">'+cat.name+'</div></div></div>';
    }).join('');

    app.innerHTML='<div class="screen home-screen active">'+svgDefs+'<div class="home-flowers">'+flowers+'</div>'
        +'<div class="home-header"><div class="home-title">🌟 Family Tracker</div><div class="home-date-area"><div class="home-date">'+dateStr+'</div></div></div>'
        +'<div class="home-kids">'+kidCols+'</div>'
        +'<div class="home-compare"><div class="home-compare-title">📊 Today\'s Battle</div><div class="home-cat-bars">'+catBars+'</div></div>'
        +'<div class="home-bottom"><button class="home-btn parent-btn" id="home-parent">👑 Parent</button><button class="home-btn board-btn" id="home-board">🏆 Scores</button></div></div>';

    // Animate rings
    requestAnimationFrame(()=>{
        document.querySelectorAll('.home-ring-fill').forEach(el=>{
            const pct=+el.dataset.pct;
            const circ=2*Math.PI*60;
            el.style.strokeDashoffset=circ-(pct/100)*circ;
        });
    });

    // Tap kid to enter
    app.querySelectorAll('.home-kid-col').forEach(card=>card.addEventListener('click',()=>{
        SFX.play('click');
        const m=D.members.find(x=>x.id===card.dataset.id);
        if(m) loginAs(m);
    }));

    // Parent button
    document.getElementById('home-parent').addEventListener('click',()=>{
        SFX.play('click');
        const parents=D.members.filter(m=>m.role==='parent');
        if(parents.length===1){parents[0].pin?pinDialog(parents[0]):loginAs(parents[0]);}
        else{
            const o=document.createElement('div');o.className='modal-overlay';
            o.innerHTML='<div class="modal-box"><h3>👑 Parent Login</h3><p>Who\'s logging in?</p><div class="modal-btns">'+parents.map(p=>'<button class="modal-btn confirm" data-pid="'+p.id+'">'+p.avatar+' '+p.name+'</button>').join('')+'<button class="modal-btn cancel">Cancel</button></div></div>';
            document.body.appendChild(o);
            o.querySelectorAll('[data-pid]').forEach(b=>b.addEventListener('click',()=>{o.remove();const p=D.members.find(x=>x.id===b.dataset.pid);p.pin?pinDialog(p):loginAs(p);}));
            o.querySelector('.cancel').addEventListener('click',()=>o.remove());
        }
    });

    // Board button
    document.getElementById('home-board').addEventListener('click',()=>{
        SFX.play('click');
        const p=D.members.find(m=>m.role==='parent');
        if(p&&p.pin){pinDialog(p);}
        else if(p){user=p;screen='main';tab='board';selDate=today();render();}
    });
}

function pinDialog(member){
    const o=document.createElement('div');o.className='login-pin-overlay';
    o.innerHTML='<div class="login-pin-box"><h3>🔒 '+member.name+'</h3><p>Enter your 4-digit PIN</p><div class="pin-inputs"><input type="tel" maxlength="1" inputmode="numeric" autofocus><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"><input type="tel" maxlength="1" inputmode="numeric"></div><div class="pin-error" id="pin-err">Wrong PIN — try again!</div><button class="pin-cancel">Cancel</button></div>';
    document.body.appendChild(o);
    const ins=o.querySelectorAll('.pin-inputs input');ins[0].focus();
    ins.forEach((inp,i)=>{
        inp.addEventListener('input',()=>{if(inp.value&&i<3)ins[i+1].focus();const pin=Array.from(ins).map(x=>x.value).join('');if(pin.length===4){if(pin===member.pin){o.remove();loginAs(member);}else{o.querySelector('#pin-err').style.display='block';ins.forEach(x=>x.value='');ins[0].focus();SFX.play('undo');}}});
        inp.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!inp.value&&i>0)ins[i-1].focus();});
    });
    o.querySelector('.pin-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
}
function loginAs(m){user=m;screen='main';selDate=today();tab='tasks';selCat='all';render();}

// =========== MAIN ===========
function renderMain(){
    const isP=user.role==='parent';
    const tabs=[{id:'tasks',icon:'✅',label:'Tasks'},{id:'shop',icon:'🎁',label:'Shop'},{id:'board',icon:'🏆',label:'Board'}];
    if(isP)tabs.push({id:'parent',icon:'👑',label:'Parent'});
    app.innerHTML='<div class="screen active"><header class="dash-header"><button class="back-btn" id="logout-btn">←</button><div class="dash-title"><span>'+user.avatar+'</span> <span>'+user.name+'</span></div><div class="header-points"><span class="header-points-value" id="hdr-pts">'+Math.floor(dayPts(user.id,selDate))+'</span><span class="header-points-label">pts today</span></div></header><div id="content"></div><nav class="bottom-nav">'+tabs.map(t=>'<button class="nav-btn '+(tab===t.id?'active':'')+'" data-tab="'+t.id+'"><span class="nav-icon">'+t.icon+'</span>'+t.label+'</button>').join('')+'</nav></div>';
    document.getElementById('logout-btn').addEventListener('click',()=>{SFX.play('click');user=null;screen='login';render();});
    document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>{SFX.play('click');tab=b.dataset.tab;renderMain();}));
    renderTab();
}
function updHdr(){const e=document.getElementById('hdr-pts');if(e){e.textContent=Math.floor(dayPts(user.id,selDate));e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop');}}
function renderTab(){const c=document.getElementById('content');if(!c)return;if(tab==='tasks')renderTasks(c);else if(tab==='shop')renderShop(c);else if(tab==='board')renderBoard(c);else if(tab==='parent')renderParent(c);}

// =========== TASKS ===========
function renderTasks(c){
    const pts=dayPts(user.id,selDate),mx=maxPts(),pct=mx?Math.min(100,Math.round(pts/mx*100)):0,isToday=selDate===today();
    const tasks=selCat==='all'?D.tasks:D.tasks.filter(t=>t.cat===selCat);
    let html='<div class="date-nav"><button class="date-arrow" id="dp">‹</button><span class="date-label">'+fmtDate(selDate)+'</span><button class="date-arrow" id="dn" '+(isToday?'disabled':'')+'>›</button></div>';
    html+='<div class="progress-container"><svg class="progress-ring" viewBox="0 0 120 120"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%"><stop offset="0%" style="stop-color:#6C63FF"/><stop offset="100%" style="stop-color:#FF6B6B"/></linearGradient></defs><circle class="progress-ring-bg" cx="60" cy="60" r="54"/><circle class="progress-ring-fill" id="pfill" cx="60" cy="60" r="54" stroke="url(#grad)"/></svg><div class="progress-text"><span class="progress-pct">'+pct+'</span><span class="pct-sign">%</span></div></div>';
    html+='<div class="category-tabs">'+CATS.map(cat=>'<button class="cat-tab '+(selCat===cat.id?'active':'')+'" data-c="'+cat.id+'">'+cat.emoji+' '+cat.name+'</button>').join('')+'</div>';
    html+='<div class="tasks-list">'+tasks.map(t=>{
        const cnt=tcount(user.id,selDate,t.id),multi=t.max>1,done=cnt>=t.max;
        let card='<div class="task-card '+(done?'completed':'')+' '+(!isToday?'locked':'')+'" data-t="'+t.id+'" data-m="'+multi+'">';
        card+='<div class="task-check">'+(done?'✓':t.emoji)+'</div>';
        card+='<div class="task-info"><div class="task-name">'+t.name+'</div><div class="task-meta">'+(multi?cnt+'/'+t.max+' · ':'')+t.pts+' pts'+(multi?' each':'')+'</div></div>';
        if(multi&&isToday)card+='<div class="task-counter"><button class="cm" data-t="'+t.id+'" '+(cnt<=0?'disabled':'')+'>−</button><span class="count">'+cnt+'</span><button class="cp" data-t="'+t.id+'" '+(cnt>=t.max?'disabled':'')+'>+</button></div>';
        card+='<div class="task-points-badge">'+(multi?cnt*t.pts:t.pts)+'</div></div>';
        return card;
    }).join('')+'</div>';
    html+='<div style="text-align:center;padding:16px"><span style="font-size:0.8rem;color:var(--text-light)">💰 Lifetime: </span><strong style="color:var(--primary);font-size:1.1rem">'+Math.floor(lifePts(user.id))+'</strong><span style="font-size:0.8rem;color:var(--text-light)"> pts</span></div>';
    c.innerHTML=html;
    requestAnimationFrame(()=>{const f=document.getElementById('pfill');if(f)f.style.strokeDashoffset=339.292-(pct/100)*339.292;});
    document.getElementById('dp').addEventListener('click',()=>{selDate=addDays(selDate,-1);renderTab();updHdr();});
    document.getElementById('dn').addEventListener('click',()=>{if(selDate<today()){selDate=addDays(selDate,1);renderTab();updHdr();}});
    c.querySelectorAll('.cat-tab').forEach(b=>b.addEventListener('click',()=>{SFX.play('click');selCat=b.dataset.c;renderTab();}));
    c.querySelectorAll('.task-card[data-m="false"]').forEach(card=>{
        if(card.classList.contains('locked'))return;
        card.addEventListener('click',()=>{
            const tid=card.dataset.t,t=D.tasks.find(x=>x.id===tid),cnt=tcount(user.id,selDate,tid),nc=cnt>0?0:1;
            if(!D.progress[selDate])D.progress[selDate]={};if(!D.progress[selDate][user.id])D.progress[selDate][user.id]={};
            D.progress[selDate][user.id][tid]=nc;
            if(nc>0){SFX.play('complete');const r=card.getBoundingClientRect();floatPts(r.right-40,r.top,t.pts);}else SFX.play('undo');
            renderTab();updHdr();checkAllDone();sendUpdate('taskComplete',{mid:user.id,date:selDate,tid:tid,count:nc});
        });
    });
    c.querySelectorAll('.cp').forEach(b=>b.addEventListener('click',e=>{
        e.stopPropagation();const tid=b.dataset.t,t=D.tasks.find(x=>x.id===tid),cnt=tcount(user.id,selDate,tid);
        if(cnt<t.max){const nc=cnt+1;if(!D.progress[selDate])D.progress[selDate]={};if(!D.progress[selDate][user.id])D.progress[selDate][user.id]={};
        D.progress[selDate][user.id][tid]=nc;SFX.play('complete');const r=b.getBoundingClientRect();floatPts(r.left,r.top-10,t.pts);
        renderTab();updHdr();checkAllDone();sendUpdate('taskComplete',{mid:user.id,date:selDate,tid:tid,count:nc});}
    }));
    c.querySelectorAll('.cm').forEach(b=>b.addEventListener('click',e=>{
        e.stopPropagation();const tid=b.dataset.t,cnt=tcount(user.id,selDate,tid);
        if(cnt>0){const nc=cnt-1;if(!D.progress[selDate])D.progress[selDate]={};if(!D.progress[selDate][user.id])D.progress[selDate][user.id]={};
        D.progress[selDate][user.id][tid]=nc;SFX.play('undo');renderTab();updHdr();sendUpdate('taskComplete',{mid:user.id,date:selDate,tid:tid,count:nc});}
    }));
}

// =========== SHOP ===========
function renderShop(c){
    const bal=lifePts(user.id),hist=(D.rewardLog||[]).filter(r=>r.mid===user.id).reverse().slice(0,8);
    let html='<div style="text-align:center;padding:20px 16px 8px"><div style="font-size:0.75rem;color:var(--text-light);font-weight:700;text-transform:uppercase;letter-spacing:1px">Your Balance</div><div style="font-size:2.8rem;font-weight:900;color:var(--primary);line-height:1">'+Math.floor(bal)+'</div><div style="font-size:0.75rem;color:var(--text-light)">points available to spend</div></div>';
    html+='<div class="rewards-grid">'+D.rewards.map(r=>{const can=bal>=r.cost;return '<div class="reward-card '+(can?'affordable':'')+'" data-r="'+r.id+'"><span class="reward-icon">'+r.emoji+'</span><div class="reward-name">'+r.name+'</div><span class="reward-cost">⭐ '+r.cost.toLocaleString()+'</span><br><button class="reward-btn '+(can?'can-redeem':'cant-redeem')+'" data-r="'+r.id+'" '+(can?'':'disabled')+'>'+(can?'🎉 Redeem':'Need '+(r.cost-Math.floor(bal))+' more')+'</button></div>';}).join('')+'</div>';
    if(hist.length)html+='<div class="reward-history"><h3>🎁 Recent Rewards</h3>'+hist.map(r=>'<div class="rh-item"><span class="rh-icon">'+(r.emoji||'🎁')+'</span><div class="rh-info"><div class="rh-name">'+r.name+'</div><div class="rh-date">'+r.date+'</div></div><span class="rh-cost">-'+r.cost+'</span></div>').join('')+'</div>';
    c.innerHTML=html;
    c.querySelectorAll('.reward-btn.can-redeem').forEach(b=>b.addEventListener('click',async()=>{
        const r=D.rewards.find(x=>x.id===b.dataset.r);
        const ch=await modal('🎁 Redeem Reward?','Spend <strong>'+r.cost+'</strong> points on <strong>'+r.name+'</strong>?',[{label:'Yes! 🎉',cls:'confirm'},{label:'Cancel',cls:'cancel'}]);
        if(ch===0){SFX.play('reward');confetti();toast('🎉 '+r.name+' redeemed!');await sendUpdate('rewardRedeem',{mid:user.id,reward:{id:r.id,name:r.name,emoji:r.emoji,cost:r.cost}});await fetchData();renderShop(c);updHdr();}
    }));
}

// =========== SCOREBOARD ===========
function renderBoard(c){
    const ranked=[...D.members].map(m=>({...m,pts:dayPts(m.id,selDate),str:streak(m.id)})).sort((a,b)=>b.pts-a.pts);
    const topPts=Math.max(...ranked.map(r=>r.pts),1),medals=['🥇','🥈','🥉',''];
    const days=last7(),dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let html='<div class="date-nav"><button class="date-arrow" id="bdp">‹</button><span class="date-label">'+fmtDate(selDate)+'</span><button class="date-arrow" id="bdn" '+(selDate===today()?'disabled':'')+'>›</button></div>';
    html+='<div class="scoreboard-section">'+ranked.map((m,i)=>'<div class="scoreboard-card"><div class="sb-rank '+(['gold','silver','bronze',''][i]||'')+'">'+(medals[i]||(i+1))+'</div><div class="sb-avatar">'+m.avatar+'</div><div class="sb-info"><div class="sb-name">'+m.name+(m.str>1?' <span class="sb-streak">🔥'+m.str+' day streak</span>':'')+'</div><div class="sb-bar-wrap"><div class="sb-bar" style="width:'+(m.pts/topPts*100)+'%"></div></div></div><div class="sb-points">'+Math.floor(m.pts)+'</div></div>').join('')+'</div>';
    html+='<div class="weekly-summary"><h3>📊 This Week</h3>'+D.members.filter(m=>m.role==='child').map(m=>'<div style="margin-bottom:16px"><div style="font-size:0.85rem;font-weight:700;margin-bottom:6px">'+m.avatar+' '+m.name+'</div><div class="weekly-bars">'+days.map(d=>{const p=dayPts(m.id,d),mx=maxPts(),h=mx?Math.max(4,Math.round(p/mx*80)):4;return '<div class="weekly-bar-col"><div class="weekly-bar '+(d===today()?'today':'')+'" style="height:'+h+'px"></div><div class="weekly-day">'+dn[new Date(d+'T12:00:00').getDay()]+'</div></div>';}).join('')+'</div></div>').join('')+'</div>';
    c.innerHTML=html;
    document.getElementById('bdp').addEventListener('click',()=>{selDate=addDays(selDate,-1);renderTab();updHdr();});
    document.getElementById('bdn').addEventListener('click',()=>{if(selDate<today()){selDate=addDays(selDate,1);renderTab();updHdr();}});
}

// =========== PARENT ===========
function renderParent(c){
    const children=D.members.filter(m=>m.role==='child');
    if(!parentEditChild)parentEditChild=children[0]?.id||null;
    if(!parentEditDate)parentEditDate=today();
    const logs=(D.actLog||[]).slice().reverse().slice(0,40);

    let html='<div class="parent-section"><h3>📋 Activity Log</h3><div class="parent-card"><div class="parent-log">';
    if(!logs.length) html+='<div style="text-align:center;color:var(--text-light);padding:12px">No activity yet</div>';
    else html+=logs.map(l=>{const m=D.members.find(x=>x.id===l.mid),t=D.tasks.find(x=>x.id===l.tid);const icon=l.action==='reward'?'🎁':(l.action.includes('undo')?'↩️':'✅');const desc=l.action==='reward'?(l.detail||'reward'):(t?t.name:'Unknown');return '<div class="log-item"><span class="log-avatar">'+(m?m.avatar:'?')+'</span><span class="log-text">'+icon+' '+(m?m.name:'?')+': '+desc+'</span><span class="log-time">'+l.time+' · '+(l.date===today()?'today':l.date)+'</span>'+(l.action==='complete'?'<button class="log-undo" data-mid="'+l.mid+'" data-tid="'+l.tid+'" data-date="'+l.date+'">Undo</button>':'')+'</div>';}).join('');
    html+='</div></div>';

    html+='<h3>✏️ Edit Child Tasks</h3><div class="parent-card"><div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+children.map(ch=>'<button class="cat-tab '+(parentEditChild===ch.id?'active':'')+'" data-ech="'+ch.id+'">'+ch.avatar+' '+ch.name+'</button>').join('')+'</div>';
    html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><button class="date-arrow" id="pedp">‹</button><span style="font-weight:700;font-size:0.9rem;flex:1;text-align:center">'+fmtDate(parentEditDate)+'</span><button class="date-arrow" id="pedn" '+(parentEditDate===today()?'disabled':'')+'>›</button></div>';
    html+=D.tasks.map(t=>{const cnt=parentEditChild?tcount(parentEditChild,parentEditDate,t.id):0;return '<div class="parent-task-row"><span style="font-size:1.1rem">'+t.emoji+'</span><span class="parent-task-name">'+t.name+'</span><div class="task-counter"><button class="pe-m" data-t="'+t.id+'">−</button><span class="count">'+cnt+'</span><button class="pe-p" data-t="'+t.id+'" data-max="'+t.max+'">+</button></div></div>';}).join('')+'</div>';

    html+='<h3>⚙️ Task Point Values</h3><div class="parent-card">'+D.tasks.map(t=>'<div class="parent-task-row"><span style="font-size:1.1rem">'+t.emoji+'</span><span class="parent-task-name">'+t.name+'</span><input type="number" class="ptv" data-t="'+t.id+'" value="'+t.pts+'" min="0" max="100" step="0.5" style="width:55px;text-align:center;border:2px solid #E8E6FF;border-radius:8px;padding:4px;font-family:inherit;font-weight:700;font-size:0.85rem"><span style="font-size:0.7rem;color:var(--text-light)">×'+t.max+'/day</span></div>').join('')+'</div>';

    html+='<h3>🎁 Reward Costs</h3><div class="parent-card">'+D.rewards.map(r=>'<div class="parent-task-row"><span style="font-size:1.1rem">'+r.emoji+'</span><span class="parent-task-name">'+r.name+'</span><input type="number" class="rcv" data-r="'+r.id+'" value="'+r.cost+'" min="0" max="99999" step="50" style="width:70px;text-align:center;border:2px solid #E8E6FF;border-radius:8px;padding:4px;font-family:inherit;font-weight:700;font-size:0.85rem"><span style="font-size:0.7rem;color:var(--text-light)">pts</span></div>').join('')+'</div>';

    html+='<h3>🔐 PIN Management</h3><div class="parent-card">'+D.members.map(m=>'<div class="parent-task-row"><span style="font-size:1.1rem">'+m.avatar+'</span><span class="parent-task-name">'+m.name+' <span style="font-size:0.7rem;color:var(--text-light)">('+m.role+')</span></span><input type="tel" class="pin-inp" data-mid="'+m.id+'" value="'+(m.pin||'')+'" maxlength="4" placeholder="None" style="width:65px;text-align:center;border:2px solid #E8E6FF;border-radius:8px;padding:4px;font-family:inherit;font-weight:700;font-size:0.9rem;letter-spacing:3px"></div>').join('')+'<div style="font-size:0.7rem;color:var(--text-light);margin-top:8px">Leave blank for no PIN. Changes save automatically.</div></div>';

    html+='<h3>🔧 Settings</h3><div class="parent-card"><label style="display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer"><div class="toggle-switch '+(D.settings.sound!==false?'on':'')+'" id="snd-tog"></div>🔊 Sound Effects</label></div>';
    html+='<button class="btn-action" id="exp-btn">📥 Export Data (JSON)</button>';
    html+='<label class="btn-action" style="cursor:pointer;display:block">📤 Import Data (JSON)<input type="file" id="imp-inp" accept=".json" style="display:none"></label>';
    html+='<button class="btn-action danger" id="rst-btn">🗑️ Reset Today\'s Progress</button>';
    html+='<button class="btn-action danger" id="rsta-btn">⚠️ Reset ALL Data</button></div>';
    c.innerHTML=html;

    // Log undo
    c.querySelectorAll('.log-undo').forEach(b=>b.addEventListener('click',async()=>{
        const mid=b.dataset.mid,tid=b.dataset.tid,dt=b.dataset.date||today();
        const cnt=tcount(mid,dt,tid);if(cnt>0){
            if(!D.progress[dt])D.progress[dt]={};if(!D.progress[dt][mid])D.progress[dt][mid]={};
            D.progress[dt][mid][tid]=cnt-1;toast('↩️ Undone');renderTab();updHdr();
            sendUpdate('parentEdit',{mid:mid,date:dt,tid:tid,count:cnt-1});
        }
    }));
    // Child tabs
    c.querySelectorAll('[data-ech]').forEach(b=>b.addEventListener('click',()=>{parentEditChild=b.dataset.ech;renderTab();}));
    // Parent edit date
    const pedp=document.getElementById('pedp'),pedn=document.getElementById('pedn');
    if(pedp)pedp.addEventListener('click',()=>{parentEditDate=addDays(parentEditDate,-1);renderTab();});
    if(pedn)pedn.addEventListener('click',()=>{if(parentEditDate<today()){parentEditDate=addDays(parentEditDate,1);renderTab();}});
    // Edit +/-
    c.querySelectorAll('.pe-p').forEach(b=>b.addEventListener('click',()=>{
        const tid=b.dataset.t,mx=+b.dataset.max,cnt=tcount(parentEditChild,parentEditDate,tid);
        if(cnt<mx){if(!D.progress[parentEditDate])D.progress[parentEditDate]={};if(!D.progress[parentEditDate][parentEditChild])D.progress[parentEditDate][parentEditChild]={};
        D.progress[parentEditDate][parentEditChild][tid]=cnt+1;renderTab();updHdr();sendUpdate('parentEdit',{mid:parentEditChild,date:parentEditDate,tid:tid,count:cnt+1});}
    }));
    c.querySelectorAll('.pe-m').forEach(b=>b.addEventListener('click',()=>{
        const tid=b.dataset.t,cnt=tcount(parentEditChild,parentEditDate,tid);
        if(cnt>0){if(!D.progress[parentEditDate])D.progress[parentEditDate]={};if(!D.progress[parentEditDate][parentEditChild])D.progress[parentEditDate][parentEditChild]={};
        D.progress[parentEditDate][parentEditChild][tid]=cnt-1;renderTab();updHdr();sendUpdate('parentEdit',{mid:parentEditChild,date:parentEditDate,tid:tid,count:cnt-1});}
    }));
    // Task pts
    c.querySelectorAll('.ptv').forEach(inp=>inp.addEventListener('change',()=>{
        const t=D.tasks.find(x=>x.id===inp.dataset.t);if(t){t.pts=Math.max(0,parseFloat(inp.value)||0);toast('✅ Updated');updHdr();sendUpdate('updateTasks',{tasks:D.tasks});}
    }));
    // Reward costs
    c.querySelectorAll('.rcv').forEach(inp=>inp.addEventListener('change',()=>{
        const r=D.rewards.find(x=>x.id===inp.dataset.r);if(r){r.cost=Math.max(0,parseInt(inp.value)||0);toast('✅ Updated');sendUpdate('updateRewards',{rewards:D.rewards});}
    }));
    // PINs
    c.querySelectorAll('.pin-inp').forEach(inp=>inp.addEventListener('change',()=>{
        const m=D.members.find(x=>x.id===inp.dataset.mid);if(m){m.pin=inp.value;toast('🔐 PIN updated');sendUpdate('updateMembers',{members:D.members});}
    }));
    // Sound toggle
    const st=document.getElementById('snd-tog');if(st)st.addEventListener('click',()=>{
        D.settings.sound=!D.settings.sound;SFX.enabled=D.settings.sound;renderTab();sendUpdate('updateSettings',{settings:D.settings});
    });
    // Export
    document.getElementById('exp-btn').addEventListener('click',()=>{
        const blob=new Blob([JSON.stringify(D,null,2)],{type:'application/json'});
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='family-tracker-'+today()+'.json';a.click();toast('📥 Exported!');
    });
    // Import
    document.getElementById('imp-inp').addEventListener('change',async e=>{
        const file=e.target.files[0];if(!file)return;
        const ch=await modal('📤 Import Data?','This will REPLACE all data. Sure?',[{label:'Import',cls:'danger'},{label:'Cancel',cls:'cancel'}]);
        if(ch===0){try{const d=JSON.parse(await file.text());if(d.members&&d.tasks){await sendUpdate('fullSync',{data:d});await fetchData();toast('✅ Imported!');renderTab();updHdr();}else toast('❌ Invalid file');}catch(e){toast('❌ Parse error');}}
    });
    // Reset today
    document.getElementById('rst-btn').addEventListener('click',async()=>{
        const ch=await modal('🗑️ Reset Today?','Clear all progress for today?',[{label:'Reset',cls:'danger'},{label:'Cancel',cls:'cancel'}]);
        if(ch===0){delete D.progress[today()];await sendUpdate('resetToday',{});toast('🗑️ Reset!');renderTab();updHdr();}
    });
    // Reset all
    document.getElementById('rsta-btn').addEventListener('click',async()=>{
        const ch=await modal('⚠️ Reset ALL?','Delete everything? Cannot be undone!',[{label:'Delete All',cls:'danger'},{label:'Cancel',cls:'cancel'}]);
        if(ch===0){await sendUpdate('resetAll',{});await fetchData();user=null;screen='login';render();}
    });
}

// =========== INIT ===========
async function init() {
    const ok = await fetchData();
    if (ok) { connectWS(); render(); }
    else { app.innerHTML = '<div style="text-align:center;padding:60px 20px;"><h2>⚠️ Cannot connect to server</h2><p>Please check your connection and refresh.</p><button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;border:none;border-radius:12px;background:#6C63FF;color:#fff;font-weight:700;font-size:1rem;cursor:pointer;">Retry</button></div>'; }
}
init();