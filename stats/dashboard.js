/* The private stats dashboard served by worker.js at /dashboard. One page, no
 * external requests: it fetches /api/stats (same origin, same Basic auth) and
 * renders with textContent only, because error messages come from players'
 * browsers and must never be parsed as HTML. */
export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Ratel Rage — player stats</title>
<style>
.viz-root{color-scheme:light;--surface-0:#f3f3f1;--surface-1:#fcfcfb;--border:#e2e1dc;--grid:#ecebe7;
  --text-primary:#0b0b0b;--text-secondary:#52514e;--text-muted:#77766f;--series-1:#2a78d6;--focus:#2a78d6;--accent:#e34948}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{color-scheme:dark;--surface-0:#111110;
  --surface-1:#1a1a19;--border:#2e2e2c;--grid:#262624;--text-primary:#fff;--text-secondary:#c3c2b7;--text-muted:#94938a;--series-1:#3987e5;--focus:#3987e5;--accent:#e66767}}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.viz-root{background:var(--surface-0);color:var(--text-primary);min-height:100vh;padding:20px clamp(12px,3vw,32px) 40px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:0 0 4px}
.sub{color:var(--text-secondary);font-size:13px;margin:2px 0 0}
header{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:end;justify-content:space-between;margin-bottom:16px}
.filters{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button,input{font:inherit;color:inherit}
.seg{border:1px solid var(--border);background:var(--surface-1);border-radius:8px;padding:6px 11px;cursor:pointer}
.seg[aria-pressed="true"]{background:var(--text-primary);color:var(--surface-1);border-color:var(--text-primary)}
.seg:focus-visible,input:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
input[type=date]{border:1px solid var(--border);background:var(--surface-1);border-radius:8px;padding:5px 8px}
.grid{display:grid;gap:12px}
.tiles{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:12px}
.tile,.card{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.tile .k{color:var(--text-secondary);font-size:12.5px}
.tile .v{font-size:28px;font-weight:650;letter-spacing:-.01em;margin-top:2px;font-variant-numeric:tabular-nums}
.tile .h{color:var(--text-muted);font-size:12px;margin-top:2px}
.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--series-1);margin-right:6px;vertical-align:1px}
.cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.wide{grid-column:1/-1}
.cardhead{display:flex;justify-content:space-between;gap:8px;align-items:start;margin-bottom:8px}
.link{background:none;border:0;color:var(--text-secondary);text-decoration:underline;cursor:pointer;padding:0;font-size:12.5px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--text-secondary);font-weight:500;font-size:12.5px;padding:4px 6px;border-bottom:1px solid var(--border)}
td{padding:5px 6px;border-bottom:1px solid var(--grid);vertical-align:top}
td.n,th.n{text-align:right;white-space:nowrap}
.meter{height:8px;border-radius:0 4px 4px 0;background:var(--series-1);min-width:2px}
.mcell{width:38%}
.msg{word-break:break-word;font-family:ui-monospace,Consolas,monospace;font-size:12.5px}
.muted{color:var(--text-muted)}
.chartwrap{position:relative}
svg text{fill:var(--text-muted);font-size:11px}
.tip{position:absolute;pointer-events:none;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;
  padding:7px 9px;font-size:12.5px;box-shadow:0 4px 14px rgba(0,0,0,.12);white-space:nowrap;display:none}
.tip b{display:block;margin-bottom:2px}
.err{color:var(--accent)}
footer{color:var(--text-muted);font-size:12px;margin-top:18px}
</style></head>
<body><div class="viz-root">
<header>
  <div><h1>Ratel Rage — player stats</h1><p class="sub" id="asof">Loading…</p></div>
  <div class="filters" role="group" aria-label="Date range">
    <button class="seg" data-r="today">Today</button><button class="seg" data-r="7">7 days</button>
    <button class="seg" data-r="30">30 days</button><button class="seg" data-r="90">90 days</button>
    <label class="muted" for="from">From</label><input type="date" id="from">
    <label class="muted" for="to">to</label><input type="date" id="to">
    <button class="seg" id="refresh">Refresh</button>
  </div>
</header>
<p class="err" id="error" hidden></p>
<section class="grid tiles" aria-label="Headline numbers">
  <div class="tile"><div class="k"><span class="live" aria-hidden="true"></span>Online now</div><div class="v" id="t-online">–</div><div class="h" id="t-online-h"></div></div>
  <div class="tile"><div class="k">Players</div><div class="v" id="t-players">–</div><div class="h" id="t-players-h"></div></div>
  <div class="tile"><div class="k">Play sessions</div><div class="v" id="t-sessions">–</div><div class="h" id="t-sessions-h"></div></div>
  <div class="tile"><div class="k">Time played</div><div class="v" id="t-time">–</div><div class="h" id="t-time-h"></div></div>
  <div class="tile"><div class="k">MC Olodo defeated</div><div class="v" id="t-wins">–</div><div class="h" id="t-wins-h"></div></div>
</section>
<section class="grid cards">
  <div class="card wide"><div class="cardhead"><div><h2>Players per day</h2><p class="sub">Unique players who started a session each day (your local time). Hover a bar for sessions and time played.</p></div>
    <button class="link" id="toggle">Show as table</button></div>
    <div class="chartwrap" id="chart"></div><div id="dailytable" hidden></div></div>
  <div class="card"><h2>Level progress</h2><p class="sub">How far players get. Counts are players (sessions where no player id is stored).</p><div id="funnel"></div></div>
  <div class="card"><h2>Where Darki goes down</h2><p class="sub">Deaths by arena section. <span id="bossdeaths"></span></p><div id="sections"></div></div>
  <div class="card"><h2>Devices</h2><div id="b-device"></div><h2 style="margin-top:12px">App or browser</h2><div id="b-platform"></div></div>
  <div class="card"><h2>Browsers</h2><div id="b-browser"></div><h2 style="margin-top:12px">Systems</h2><div id="b-os"></div></div>
  <div class="card"><h2>Countries</h2><div id="b-country"></div></div>
  <div class="card"><h2>Difficulty picked</h2><div id="difficulty"></div><h2 style="margin-top:12px">Ranks earned</h2><div id="ranks"></div></div>
  <div class="card"><h2>Speed on players' devices</h2><div id="perf"></div></div>
  <div class="card wide"><h2>Errors players hit</h2><p class="sub">Grouped by message. Fix the top rows first.</p><div id="errors"></div></div>
</section>
<footer>Anonymous: no names, emails, IP addresses or accounts. "Online now" = a game tab seen in the last <span id="win">3</span> minutes.</footer>
</div>
<script>
(function(){
  var $=function(id){return document.getElementById(id)};
  var DAY=86400000, range={kind:'7'}, data=null, asTable=false;
  var el=function(tag,txt,cls){var e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e};
  var fmt=function(n){return n==null?'–':Math.round(n).toLocaleString()};
  var dur=function(s){s=Math.round(s||0);if(s<60)return s+'s';var m=Math.floor(s/60);if(m<60)return m+'m '+(s%60)+'s';var h=Math.floor(m/60);return h.toLocaleString()+'h '+(m%60)+'m'};
  var dayStart=function(d){var x=new Date(d);x.setHours(0,0,0,0);return x.getTime()};
  var iso=function(t){var d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  function span(){
    var now=Date.now();
    if(range.kind==='today')return [dayStart(now),now];
    if(range.kind==='custom'){var f=new Date(range.from+'T00:00:00').getTime(),t=new Date(range.to+'T00:00:00').getTime()+DAY;return [f,Math.min(t,now)]}
    return [dayStart(now-(+range.kind-1)*DAY),now];
  }
  function pressed(){document.querySelectorAll('.seg[data-r]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.r===range.kind))})}
  function table(cols,rows){
    var t=el('table'),hr=el('tr');
    cols.forEach(function(c){var th=el('th',c.label);if(c.num)th.className='n';hr.appendChild(th)});
    var th=el('thead');th.appendChild(hr);t.appendChild(th);var tb=el('tbody');
    if(!rows.length){var tr=el('tr'),td=el('td','No data in this range yet.','muted');td.colSpan=cols.length;tr.appendChild(td);tb.appendChild(tr)}
    rows.forEach(function(r){var tr=el('tr');cols.forEach(function(c){var v=c.get(r),td=el('td');
      if(v instanceof Node)td.appendChild(v);else td.textContent=v;if(c.num)td.className='n';if(c.cls)td.classList.add(c.cls);tr.appendChild(td)});tb.appendChild(tr)});
    t.appendChild(tb);return t;
  }
  function meter(v,max){var w=el('div');var m=el('div',null,'meter');m.style.width=(max?Math.max(1,100*v/max):0)+'%';w.appendChild(m);return w}
  function breakdown(id,rows,label){
    var max=rows.reduce(function(a,r){return Math.max(a,r.n)},0),sum=rows.reduce(function(a,r){return a+r.n},0);
    var box=$(id);box.textContent='';
    box.appendChild(table([{label:label,get:function(r){return String(r.k)}},{label:'',cls:'mcell',get:function(r){return meter(r.n,max)}},
      {label:'Sessions',num:1,get:function(r){return fmt(r.n)}},{label:'Share',num:1,get:function(r){return sum?Math.round(100*r.n/sum)+'%':'–'}}],rows));
  }
  function chart(){
    var box=$('chart');box.textContent='';
    var sp=span(),tz=-new Date().getTimezoneOffset()*60000,map={};
    data.daily.forEach(function(d){map[d.day]=d});
    var days=[];for(var t=dayStart(sp[0]);t<sp[1];t+=DAY){var k=Math.floor((t+tz+DAY/2)/DAY);var d=map[k]||{players:0,sessions:0,seconds:0};days.push({t:t,players:d.players,sessions:d.sessions,seconds:d.seconds})}
    var W=Math.max(320,box.clientWidth||800),H=220,L=40,R=8,T=10,B=24,iw=W-L-R,ih=H-T-B;
    var max=Math.max(1,days.reduce(function(a,d){return Math.max(a,d.players)},0));
    var step=Math.pow(10,Math.floor(Math.log10(max)));var nice=[1,2,5,10].map(function(m){return m*step}).find(function(s){return max/s<=5})||step*10;
    var top=Math.ceil(max/nice)*nice;
    var NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');
    svg.setAttribute('width',W);svg.setAttribute('height',H);svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Players per day, '+days.length+' days, peak '+max);
    for(var v=0;v<=top;v+=nice){var y=T+ih-ih*v/top;var g=document.createElementNS(NS,'line');
      g.setAttribute('x1',L);g.setAttribute('x2',W-R);g.setAttribute('y1',y);g.setAttribute('y2',y);g.setAttribute('stroke','var(--grid)');svg.appendChild(g);
      var lt=document.createElementNS(NS,'text');lt.setAttribute('x',L-6);lt.setAttribute('y',y+4);lt.setAttribute('text-anchor','end');lt.textContent=v.toLocaleString();svg.appendChild(lt)}
    var bw=iw/days.length,gap=Math.min(2,bw*0.25),r=Math.min(4,(bw-gap)/2);
    var tip=el('div',null,'tip');
    days.forEach(function(d,i){
      var h=ih*d.players/top,x=L+i*bw+gap/2,w=Math.max(1,bw-gap),y=T+ih-h;
      if(h>0){var p=document.createElementNS(NS,'path');var rr=Math.min(r,h);
        p.setAttribute('d','M'+x+','+(T+ih)+'V'+(y+rr)+'Q'+x+','+y+' '+(x+rr)+','+y+'H'+(x+w-rr)+'Q'+(x+w)+','+y+' '+(x+w)+','+(y+rr)+'V'+(T+ih)+'Z');
        p.setAttribute('fill','var(--series-1)');svg.appendChild(p)}
      var hit=document.createElementNS(NS,'rect');hit.setAttribute('x',L+i*bw);hit.setAttribute('y',T);hit.setAttribute('width',bw);hit.setAttribute('height',ih);
      hit.setAttribute('fill','transparent');hit.setAttribute('tabindex','0');
      var show=function(){tip.textContent='';tip.appendChild(el('b',new Date(d.t).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})));
        tip.appendChild(el('div',fmt(d.players)+' players'));tip.appendChild(el('div',fmt(d.sessions)+' sessions'));tip.appendChild(el('div',dur(d.seconds)+' played'));
        tip.style.display='block';var tx=L+i*bw+bw/2;tip.style.left=Math.min(W-150,Math.max(0,tx-60))+'px';tip.style.top=Math.max(0,y-78)+'px'};
      hit.addEventListener('mouseenter',show);hit.addEventListener('focus',show);
      hit.addEventListener('mouseleave',function(){tip.style.display='none'});hit.addEventListener('blur',function(){tip.style.display='none'});
      svg.appendChild(hit);
      var every=Math.ceil(days.length/8);
      if(i%every===0){var lx=document.createElementNS(NS,'text');lx.setAttribute('x',L+i*bw+bw/2);lx.setAttribute('y',H-6);lx.setAttribute('text-anchor','middle');
        lx.textContent=new Date(d.t).toLocaleDateString(undefined,{day:'numeric',month:'short'});svg.appendChild(lx)}
    });
    var base=document.createElementNS(NS,'line');base.setAttribute('x1',L);base.setAttribute('x2',W-R);base.setAttribute('y1',T+ih);base.setAttribute('y2',T+ih);base.setAttribute('stroke','var(--text-muted)');svg.appendChild(base);
    box.appendChild(svg);box.appendChild(tip);
    var dt=$('dailytable');dt.textContent='';
    dt.appendChild(table([{label:'Day',get:function(d){return new Date(d.t).toLocaleDateString()}},{label:'Players',num:1,get:function(d){return fmt(d.players)}},
      {label:'Sessions',num:1,get:function(d){return fmt(d.sessions)}},{label:'Time played',num:1,get:function(d){return dur(d.seconds)}}],days.slice().reverse()));
    box.hidden=asTable;dt.hidden=!asTable;
  }
  function funnel(){
    var lv={};
    data.funnel.forEach(function(f){var k=f.level==null?'?':f.level;lv[k]=lv[k]||{};lv[k][f.e]=f});
    var rows=[];Object.keys(lv).sort().forEach(function(k){var L=lv[k],who=function(e){var f=L[e];return f?(f.players||f.sessions):0},n=function(e){return L[e]?L[e].n:0};
      rows.push({k:'Level '+k,start:who('level_start'),died:who('game_over'),deaths:n('game_over'),retry:n('retry'),quit:n('quit'),won:who('level_complete')})});
    var box=$('funnel');box.textContent='';
    box.appendChild(table([{label:'',get:function(r){return r.k}},{label:'Started',num:1,get:function(r){return fmt(r.start)}},
      {label:'Died',num:1,get:function(r){return fmt(r.died)}},{label:'Deaths',num:1,get:function(r){return fmt(r.deaths)}},
      {label:'Retries',num:1,get:function(r){return fmt(r.retry)}},{label:'Gave up',num:1,get:function(r){return fmt(r.quit)}},
      {label:'Won',num:1,get:function(r){return fmt(r.won)+(r.start?' ('+Math.round(100*r.won/r.start)+'%)':'')}}],rows));
  }
  function render(){
    var d=data;
    $('t-online').textContent=fmt(d.online);$('t-online-h').textContent='live, rechecked every 30 s';$('win').textContent=d.onlineWindowMin;
    $('t-players').textContent=fmt(d.players);$('t-players-h').textContent=fmt(d.newPlayers)+' new · '+fmt(d.returningPlayers)+' returning';
    $('t-sessions').textContent=fmt(d.sessions);$('t-sessions-h').textContent=d.anonSessions?fmt(d.anonSessions)+' without a player id':'every session has a player id';
    $('t-time').textContent=dur(d.seconds);$('t-time-h').textContent='avg '+dur(d.avgSeconds)+' · median '+dur(d.medianSeconds);
    $('t-wins').textContent=fmt(d.wins.n);$('t-wins-h').textContent=d.wins.n?'by '+fmt(d.wins.players)+' players · avg '+dur(d.wins.avgTime)+' · best '+dur(d.wins.bestTime)+' · top score '+fmt(d.wins.bestScore):'no wins in this range';
    chart();funnel();
    $('bossdeaths').textContent=d.bossDeaths?fmt(d.bossDeaths)+' of them at the boss.':'';
    var smax=d.sections.reduce(function(a,r){return Math.max(a,r.n)},0),sbox=$('sections');sbox.textContent='';
    sbox.appendChild(table([{label:'Where',get:function(r){return 'Level '+(r.level==null?'?':r.level)+' · section '+(r.section==null?'?':r.section)}},
      {label:'',cls:'mcell',get:function(r){return meter(r.n,smax)}},{label:'Deaths',num:1,get:function(r){return fmt(r.n)}}],d.sections));
    ['device','platform','browser','os','country'].forEach(function(k){breakdown('b-'+k,d.breakdown[k],{device:'Device',platform:'Where',browser:'Browser',os:'System',country:'Country'}[k])});
    breakdown('difficulty',d.difficulty.map(function(r){return{k:r.k==null?'unknown':r.k,n:r.n}}),'Difficulty');
    breakdown('ranks',d.ranks.map(function(r){return{k:r.k==null?'unknown':r.k,n:r.n}}),'Rank');
    var p=$('perf');p.textContent='';
    p.appendChild(table([{label:'',get:function(r){return r[0]}},{label:'Average',num:1,get:function(r){return r[1]}}],[
      ['Page ready (first screen)',d.perf.bootMs==null?'–':(d.perf.bootMs/1000).toFixed(1)+' s'],
      ['Level ready (art prepared)',d.perf.worldMs==null?'–':(d.perf.worldMs/1000).toFixed(1)+' s'],
      ['Frames per second in play',d.perf.fps==null?'–':d.perf.fps.toFixed(0)]]));
    var e=$('errors');e.textContent='';
    e.appendChild(table([{label:'Kind',get:function(r){return r.e.replace('_',' ')}},{label:'Message',cls:'msg',get:function(r){return (r.msg||'')+(r.file?'  ('+r.file+')':'')}},
      {label:'Times',num:1,get:function(r){return fmt(r.n)}},{label:'Sessions',num:1,get:function(r){return fmt(r.sessions)}},
      {label:'Last seen',num:1,get:function(r){return new Date(r.last).toLocaleString()}}],d.errors));
    $('asof').textContent='Updated '+new Date(d.now).toLocaleTimeString()+' · '+new Date(d.from).toLocaleDateString()+' – '+new Date(d.to-1).toLocaleDateString();
  }
  function load(){
    var sp=span(),tz=-new Date().getTimezoneOffset();
    $('from').value=iso(sp[0]);$('to').value=iso(sp[1]-1);pressed();
    fetch('/api/stats?from='+sp[0]+'&to='+sp[1]+'&tz='+tz,{credentials:'same-origin',cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
      .then(function(j){data=j;$('error').hidden=true;render()})
      .catch(function(err){$('error').hidden=false;$('error').textContent='Could not load the stats: '+err.message})
  }
  document.querySelectorAll('.seg[data-r]').forEach(function(b){b.addEventListener('click',function(){range={kind:b.dataset.r};load()})});
  var custom=function(){if($('from').value&&$('to').value){range={kind:'custom',from:$('from').value,to:$('to').value};load()}};
  $('from').addEventListener('change',custom);$('to').addEventListener('change',custom);
  $('refresh').addEventListener('click',load);
  $('toggle').addEventListener('click',function(){asTable=!asTable;$('toggle').textContent=asTable?'Show as chart':'Show as table';if(data)chart()});
  window.addEventListener('resize',function(){if(data)chart()});
  // live tile only; the rest reloads on Refresh or a range change
  setInterval(function(){if(document.visibilityState!=='visible'||!data)return;
    fetch('/api/stats?only=online',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null})
      .then(function(j){if(j){$('t-online').textContent=fmt(j.online);$('t-online-h').textContent='live · checked '+new Date(j.now).toLocaleTimeString()}}).catch(function(){})},30000);
  load();
})();
</script></body></html>`;
