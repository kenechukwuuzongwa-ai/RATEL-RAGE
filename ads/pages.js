/* RATEL RAGE — rr-ads pages. Server-rendered shells; every value that came from
 * a person (business names, links, notes) is handed to the page as JSON and put
 * on screen with textContent, never as HTML. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const data = (o) => `<script type="application/json" id="data">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

const CSS = `
:root{--bg:#0f1114;--card:#191c21;--line:#2a2f37;--ink:#eef0f3;--dim:#9aa3ae;--accent:#f5c518;--ok:#3ccf7a;--bad:#ff5d5d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}header{padding:22px 20px 8px;max-width:1100px;margin:auto}header h1{margin:0;font-size:26px;letter-spacing:.5px}
header p{margin:4px 0 0;color:var(--dim)}main{max-width:1100px;margin:auto;padding:10px 20px 60px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.card img.board{width:100%;height:150px;object-fit:contain;background:#0b0d10;border-radius:8px}
h2{font-size:19px;margin:0 0 6px}h3{font-size:16px;margin:18px 0 6px}.dim{color:var(--dim)}.small{font-size:13px}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:600;background:#2a2f37}
.pill.ok{background:#173d29;color:var(--ok)}.pill.bad{background:#3d1717;color:var(--bad)}.pill.warn{background:#3d3317;color:var(--accent)}
.btn{display:inline-block;background:var(--accent);color:#111;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;text-decoration:none;font-size:15px}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn:disabled{opacity:.5;cursor:default}
.btn.small{padding:6px 10px;font-size:13px}
label{display:block;margin:10px 0 4px;font-weight:600;font-size:14px}
input,select,textarea{width:100%;background:#0b0d10;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:9px 10px;font:inherit}
input[type=range]{padding:0}input[type=checkbox]{width:auto}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.two{grid-template-columns:1fr}}
.cols{display:grid;grid-template-columns:1.1fr .9fr;gap:20px;align-items:start}@media(max-width:900px){.cols{grid-template-columns:1fr}}
canvas.preview{width:100%;background:#0b0d10;border-radius:10px;border:1px solid var(--line)}
.err{color:var(--bad);font-weight:600;min-height:1.4em}.okmsg{color:var(--ok);font-weight:600}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:7px 6px;text-align:left;vertical-align:top;font-size:14px}
.hp{position:absolute;left:-5000px}
.booking{display:grid;grid-template-columns:260px 1fr;gap:14px}@media(max-width:700px){.booking{grid-template-columns:1fr}}
.booking img{width:100%;border-radius:8px;background:#0b0d10}
.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
`;
const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex"><style>${CSS}</style></head><body>${body}</body></html>`;
const naira = `const naira=(n)=>'\\u20a6'+Number(n).toLocaleString('en-NG');`;
const el = `const $=(s)=>document.querySelector(s);const mk=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,y]of Object.entries(a)){if(x==='text')e.textContent=y;else if(x==='cls')e.className=y;else e.setAttribute(x,y)}for(const c of k)e.append(c);return e};const D=JSON.parse($('#data').textContent);`;

export function landingPage({ boards, gameOrigin, notFound = false }) {
  return shell('Advertise in Ratel Rage', `
<header><h1>Advertise in Ratel Rage</h1><p>Put your brand on a billboard inside the game. Players fight past it on every run.</p></header>
<main>${notFound ? '<p class="err">That board does not exist. Pick one below.</p>' : ''}
<div class="card" style="margin-bottom:16px"><b>How it works:</b> pick a board, upload your artwork (we show you exactly how it looks in the game), choose your dates and send the booking.
We check every advert before it goes live; once it is approved and paid, it appears on that board for every player. Your private status page shows views and taps.</div>
<div class="grid" id="boards"></div>
<p class="small dim" style="margin-top:24px">Play the game: <a id="play"></a>. Adverts must be suitable for an 18+ audience; no real brands without the owner's permission; no gambling or alcohol until our legal review is done.</p>
</main>${data({ boards, gameOrigin })}<script>${el}${naira}
$('#play').textContent=D.gameOrigin;$('#play').href=D.gameOrigin;
for(const b of D.boards){
  const c=mk('div',{cls:'card'});
  c.append(mk('img',{cls:'board',src:D.gameOrigin+'/'+b.art,alt:b.name}),mk('h2',{text:b.name}),mk('div',{cls:'dim small',text:b.where}));
  c.append(mk('div',{cls:'small',text:'Artwork: '+b.upload.w+' x '+b.upload.h+' px'}));
  if(b.views30) c.append(mk('div',{cls:'small',text:b.views30.toLocaleString()+' views in the last 30 days'}));
  const now=b.taken.find(t=>t.start<=new Date().toISOString().slice(0,10));
  const st=!b.bookable?mk('span',{cls:'pill',text:'Reserved'}):now?mk('span',{cls:'pill warn',text:'Booked until '+now.end}):mk('span',{cls:'pill ok',text:'Available'});
  c.append(mk('p',{},st,' ',mk('b',{text:naira(b.price)+' / month'})));
  if(b.bookable) c.append(mk('a',{cls:'btn',href:'/b/'+b.id,text:'Book this board'}));
  $('#boards').append(c);
}</script>`);
}

export function boardPage({ board, today, gameOrigin, payments, artScale }) {
  return shell(`${board.name} - Advertise in Ratel Rage`, `
<header><a href="/" class="small">All boards</a><h1 id="title"></h1><p id="where"></p></header>
<main><div class="cols">
<section>
  <canvas id="pv" class="preview"></canvas>
  <p class="small dim">This is the board as it stands in the game, with your artwork on it. The dashed line is the safe area: keep text and logos inside it.</p>
  <div class="card">
    <h3 style="margin-top:0">Artwork</h3>
    <p class="small"><b id="size"></b> pixels, PNG or JPEG. Players see it small and moving, often for a second or two: use a big logo, one short line and strong colours.
    A phone number or web address works better than a QR code (a player cannot scan their own screen).</p>
    <button class="btn ghost small" id="tpl" type="button">Download the template</button>
    <label for="file">Your artwork</label><input type="file" id="file" accept="image/png,image/jpeg">
    <div class="two"><div><label for="fit">Fit</label><select id="fit"><option value="fill">Fill the board (crops the edges)</option><option value="fit">Show the whole image</option></select></div>
    <div><label for="bg">Background (for "whole image")</label><input type="color" id="bg" value="#ffffff"></div></div>
    <div class="two"><div><label for="zoom">Zoom</label><input type="range" id="zoom" min="1" max="3" step="0.01" value="1"></div>
    <div><label for="px">Position</label><input type="range" id="px" min="-1" max="1" step="0.01" value="0"><input type="range" id="py" min="-1" max="1" step="0.01" value="0"></div></div>
  </div>
</section>
<section class="card">
  <div id="facts"></div>
  <form id="f" autocomplete="on">
    <label for="business">Business name</label><input id="business" required maxlength="80">
    <label for="brand">Brand shown in the game's pause menu (short)</label><input id="brand" required maxlength="30" placeholder="e.g. Mama Put Kitchen">
    <div class="two"><div><label for="name">Contact name</label><input id="name" required maxlength="80"></div>
    <div><label for="phone">Phone (optional)</label><input id="phone" maxlength="30" inputmode="tel"></div></div>
    <label for="email">Email</label><input id="email" type="email" required maxlength="120">
    <label for="link">Where a tap takes players (optional)</label><input id="link" type="url" maxlength="300" placeholder="https://your-site.com">
    <div class="two"><div><label for="start">Start date</label><input id="start" type="date" required></div>
    <div><label for="months">Months</label><select id="months"></select></div></div>
    <label for="note">Anything we should know (optional)</label><textarea id="note" rows="2" maxlength="600"></textarea>
    <input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p><b id="total"></b></p>
    <p class="small dim">We review every advert before it goes live (usually within 2 working days). ${payments ? 'After booking you can pay securely with Paystack.' : 'After review we send you an invoice; your advert goes live once it is paid.'}</p>
    <p class="err" id="err"></p>
    <button class="btn" id="send" type="submit">Send booking</button>
  </form>
  <div id="done" hidden></div>
</section></div></main>
${data({ board, today, gameOrigin, payments, artScale })}<script>${el}${naira}
const B=D.board,W=B.upload.w,H=B.upload.h,S=D.artScale;
$('#title').textContent=B.name;$('#where').textContent=B.where;$('#size').textContent=W+' x '+H;
const facts=$('#facts');facts.append(mk('h2',{text:naira(B.price)+' per month'}));
if(B.views30)facts.append(mk('p',{cls:'small',text:B.views30.toLocaleString()+' views on this board in the last 30 days'}));
if(B.taken.length){facts.append(mk('p',{cls:'small',text:'Already booked: '+B.taken.map(t=>t.start+' to '+t.end).join(', ')}))}
for(let m=1;m<=12;m++)$('#months').append(mk('option',{value:m,text:m+(m>1?' months':' month')}));
$('#start').min=D.today;$('#start').value=D.today;
const total=()=>{$('#total').textContent='Total: '+naira(B.price*Number($('#months').value))};$('#months').onchange=total;total();
if(!B.bookable){$('#send').disabled=true;$('#err').textContent='This board is reserved and not open for booking.'}
// the artwork, made at the exact upload size
const art=document.createElement('canvas');art.width=W;art.height=H;const ac=art.getContext('2d');
let img=null;
function drawArt(){ac.fillStyle=$('#bg').value;ac.fillRect(0,0,W,H);
  if(!img){ac.fillStyle='#d9dde3';ac.fillRect(0,0,W,H);ac.fillStyle='#555';ac.font='bold '+Math.round(H/9)+'px system-ui';ac.textAlign='center';ac.textBaseline='middle';ac.fillText('YOUR ADVERT HERE',W/2,H/2);return}
  const z=Number($('#zoom').value),fill=$('#fit').value==='fill';
  const s=(fill?Math.max(W/img.width,H/img.height):Math.min(W/img.width,H/img.height))*z;
  const dw=img.width*s,dh=img.height*s;
  const ox=(W-dw)/2+Number($('#px').value)*Math.abs(W-dw)/2,oy=(H-dh)/2+Number($('#py').value)*Math.abs(H-dh)/2;
  ac.imageSmoothingQuality='high';ac.drawImage(img,ox,oy,dw,dh)}
// the board as it stands in the game, with the artwork on its face
const pv=$('#pv'),pc=pv.getContext('2d');const board=new Image();board.src=D.gameOrigin+'/'+B.art;
function drawPreview(){const k=2;pv.width=B.artW*k;pv.height=B.artH*k;pc.clearRect(0,0,pv.width,pv.height);
  if(board.complete&&board.naturalWidth)pc.drawImage(board,0,0,pv.width,pv.height);
  const f=B.face;pc.drawImage(art,f.x*k,f.y*k,f.w*k,f.h*k);
  const m=B.safe;pc.setLineDash([8,6]);pc.strokeStyle='rgba(245,197,24,.9)';pc.lineWidth=2;
  pc.strokeRect((f.x+f.w*m)*k,(f.y+f.h*m)*k,f.w*(1-2*m)*k,f.h*(1-2*m)*k);pc.setLineDash([])}
const redraw=()=>{drawArt();drawPreview()};board.onload=redraw;
for(const id of ['fit','bg','zoom','px','py'])$('#'+id).oninput=redraw;
$('#file').onchange=()=>{const f=$('#file').files[0];if(!f)return;$('#err').textContent='';
  if(!/^image\\/(png|jpeg)$/.test(f.type)){$('#err').textContent='Use a PNG or JPEG file.';return}
  const u=URL.createObjectURL(f);const i=new Image();i.onload=()=>{img=i;redraw()};i.onerror=()=>{$('#err').textContent='That image could not be read.'};i.src=u};
$('#tpl').onclick=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  g.fillStyle='#ffffff';g.fillRect(0,0,W,H);const m=B.safe;g.setLineDash([12,8]);g.strokeStyle='#e0a800';g.lineWidth=4;g.strokeRect(W*m,H*m,W*(1-2*m),H*(1-2*m));
  g.fillStyle='#333';g.textAlign='center';g.textBaseline='middle';g.font='bold '+Math.round(H/10)+'px system-ui';g.fillText(B.id+'  '+W+' x '+H+' px',W/2,H/2-H/10);
  g.font=Math.round(H/16)+'px system-ui';g.fillText('Keep text and logos inside the dashed line',W/2,H/2+H/12);
  const a=mk('a',{download:'ratel-rage-'+B.id+'-template.png',href:c.toDataURL('image/png')});document.body.append(a);a.click();a.remove()};
redraw();
$('#f').onsubmit=async(e)=>{e.preventDefault();$('#err').textContent='';
  if(!img){$('#err').textContent='Add your artwork first.';return}
  let q=.92,dataUrl=art.toDataURL('image/jpeg',q);while(dataUrl.length>1500000&&q>.5){q-=.1;dataUrl=art.toDataURL('image/jpeg',q)}
  const body={slot:B.id,art:dataUrl,months:Number($('#months').value),start:$('#start').value,website:$('#website').value};
  for(const k of ['business','brand','name','email','phone','link','note'])body[k]=$('#'+k).value;
  $('#send').disabled=true;$('#send').textContent='Sending...';
  try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const o=await r.json();if(!r.ok)throw new Error(o.error||'The booking could not be sent.');
    $('#f').hidden=true;const d=$('#done');d.hidden=false;
    d.append(mk('h2',{text:'Booking received'}),mk('p',{text:'Total '+naira(o.amount)+', from '+body.start+' to '+o.end+'. We will review your artwork and email you.'}),
      mk('p',{},'Keep this link to follow your booking, pay and see your numbers: ',mk('a',{href:o.status,text:location.origin+o.status})));
    if(o.pay){const b=mk('button',{cls:'btn',type:'button',text:'Pay now with Paystack'});b.onclick=async()=>{b.disabled=true;const r=await fetch(o.pay,{method:'POST'});const p=await r.json();if(p.url)location.href=p.url;else{b.disabled=false;alert(p.error||'Payment could not start.')}};d.append(b)}
  }catch(x){$('#err').textContent=x.message;$('#send').disabled=false;$('#send').textContent='Send booking'}};
</script>`);
}

export function statusPage({ missing = false, booking, stats, board, gameOrigin, payments, today }) {
  if (missing) return shell('Booking not found', '<header><h1>Booking not found</h1><p>Check the link from your booking confirmation.</p></header>');
  return shell(`Your booking - Ratel Rage`, `
<header><a href="/" class="small">All boards</a><h1>Your billboard booking</h1><p id="sub"></p></header>
<main><div class="cols"><section><canvas id="pv" class="preview"></canvas></section>
<section class="card"><div id="state"></div><table id="t"></table><h3>Numbers</h3><div id="nums"></div><div id="pay"></div></section></div></main>
${data({ booking, stats, board, gameOrigin, payments, today })}<script>${el}${naira}
const b=D.booking,B=D.board;$('#sub').textContent=b.business+' on '+B.name;
const live=b.status==='approved'&&b.paid&&b.start<=D.today&&b.end>D.today;
const st=b.status==='rejected'?['bad','Not approved']:b.status==='cancelled'?['bad','Cancelled']:live?['ok','Live in the game']:
  b.status==='approved'&&b.paid?['ok','Approved and paid: goes live on '+b.start]:b.status==='approved'?['warn','Approved: waiting for payment']:['warn','Waiting for review'];
$('#state').append(mk('p',{},mk('span',{cls:'pill '+st[0],text:st[1]})));
if(b.reason)$('#state').append(mk('p',{cls:'err',text:'Reason: '+b.reason}));
const rows=[['Board',B.name],['Brand',b.brand],['Dates',b.start+' to '+b.end+' ('+b.months+(b.months>1?' months)':' month)')],['Total',naira(b.amount)],['Payment',b.paid?'Paid':'Not paid yet'],['Tap link',b.link||'(none)']];
for(const[k,v]of rows)$('#t').append(mk('tr',{},mk('th',{text:k}),mk('td',{text:v})));
$('#nums').append(mk('p',{text:D.stats.views.toLocaleString()+' views, '+D.stats.taps.toLocaleString()+' taps so far'}),
  mk('p',{cls:'small dim',text:'A view is your board at least half on screen for at least one second. A tap is a player opening your link from the pause menu.'}));
if(!b.paid&&b.status!=='rejected'&&b.status!=='cancelled'){
  if(D.payments){const btn=mk('button',{cls:'btn',type:'button',text:'Pay '+naira(b.amount)+' with Paystack'});
    btn.onclick=async()=>{btn.disabled=true;const r=await fetch('/api/pay/'+b.token,{method:'POST'});const p=await r.json();if(p.url)location.href=p.url;else{btn.disabled=false;alert(p.error||'Payment could not start.')}};$('#pay').append(btn)}
  else $('#pay').append(mk('p',{cls:'small dim',text:'We will email you an invoice. Your advert goes live once it is approved and paid.'}))}
const pv=$('#pv'),pc=pv.getContext('2d'),k=2;pv.width=B.artW*k;pv.height=B.artH*k;
const bi=new Image();const ai=new Image();let n=0;const draw=()=>{if(++n<2)return;pc.drawImage(bi,0,0,pv.width,pv.height);const f=B.face;pc.drawImage(ai,f.x*k,f.y*k,f.w*k,f.h*k)};
bi.onload=draw;ai.onload=draw;bi.onerror=draw;bi.src=D.gameOrigin+'/'+B.art;ai.src='/c/'+b.id+'?t='+b.token;
</script>`);
}

export function adminPage({ gameOrigin }) {
  return shell('Ratel Rage ads - admin', `
<header><h1>Billboard admin</h1><p>Review, approve, mark paid. A board shows an advert only when it is approved, paid and inside its dates.</p></header>
<main><div class="card"><h2>Boards</h2><table id="boards"></table></div>
<h2 style="margin-top:22px">Bookings</h2><p class="small"><label style="display:inline"><input type="checkbox" id="all"> show closed (rejected / cancelled / ended)</label></p>
<div id="list"></div><p class="err" id="err"></p></main>
${data({ gameOrigin })}<script>${el}${naira}
let A=null;
async function load(){const r=await fetch('/api/admin/data');A=await r.json();render()}
async function act(id,action,extra={}){$('#err').textContent='';const r=await fetch('/api/admin/bookings/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});const o=await r.json();if(!r.ok)$('#err').textContent=o.error||'Failed';await load()}
function render(){
  const bt=$('#boards');bt.textContent='';bt.append(mk('tr',{},...['Board','Price / month (naira)','Open for booking','Views 30 days','Taps 30 days',''].map(t=>mk('th',{text:t}))));
  for(const b of A.boards){const s=A.stats30.filter(x=>x.slot===b.id);const v=s.reduce((a,x)=>a+x.views,0),t=s.reduce((a,x)=>a+x.taps,0);
    const price=mk('input',{type:'number',min:'0',value:b.price});const open=mk('input',{type:'checkbox'});open.checked=b.bookable;
    const save=mk('button',{cls:'btn small',type:'button',text:'Save'});save.onclick=async()=>{const r=await fetch('/api/admin/boards/'+b.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({price:Number(price.value),bookable:open.checked})});if(!r.ok)$('#err').textContent=(await r.json()).error;await load()};
    bt.append(mk('tr',{},mk('td',{},mk('b',{text:b.id}),mk('div',{cls:'small dim',text:b.name})),mk('td',{},price),mk('td',{},open),mk('td',{text:v.toLocaleString()}),mk('td',{text:t.toLocaleString()}),mk('td',{},save)))}
  const list=$('#list');list.textContent='';const all=$('#all').checked;
  const shown=A.bookings.filter(b=>all||(b.status!=='rejected'&&b.status!=='cancelled'&&b.end_day>A.today));
  if(!shown.length)list.append(mk('p',{cls:'dim',text:'No bookings.'}));
  for(const b of shown){const c=mk('div',{cls:'card booking'});c.style.marginBottom='12px';
    const pill=b.live?['ok','LIVE']:b.status==='approved'&&b.paid?['ok','approved + paid']:b.status==='approved'?['warn','approved, unpaid']:b.status==='review'?['warn','to review']:['bad',b.status];
    const info=mk('div',{},mk('p',{},mk('span',{cls:'pill '+pill[0],text:pill[1]}),' ',mk('b',{text:b.brand}),' ',mk('span',{cls:'dim',text:'('+b.business+') on '+b.slot})));
    const rows=[['Dates',b.start_day+' to '+b.end_day+' ('+b.months+' mo)'],['Amount',naira(b.amount)+(b.paid?' - paid ('+b.pay_ref+')':' - unpaid')],['Contact',b.name+', '+b.email+(b.phone?', '+b.phone:'')],['Tap link',b.link||'(none)'],['Note',b.note||''],['Numbers',b.views+' views, '+b.taps+' taps'],['Status page','/status/'+b.token],['Booked',new Date(b.created).toLocaleString()]];
    if(b.reason)rows.push(['Reason',b.reason]);const t=mk('table');for(const[k,v]of rows)t.append(mk('tr',{},mk('th',{text:k}),mk('td',{text:v})));info.append(t);
    const ac=mk('div',{cls:'actions'});const B=(label,fn,cls='btn small')=>{const x=mk('button',{cls,type:'button',text:label});x.onclick=fn;ac.append(x)};
    if(b.status!=='approved')B('Approve',()=>act(b.id,'approve'));
    if(b.status!=='rejected')B('Reject',()=>{const reason=prompt('Reason shown to the advertiser:');if(reason!==null)act(b.id,'reject',{reason})},'btn small ghost');
    if(!b.paid)B('Mark paid',()=>{const ref=prompt('Payment reference (invoice number, transfer ref):','invoice');if(ref!==null)act(b.id,'paid',{ref})},'btn small ghost');else B('Mark unpaid',()=>act(b.id,'unpaid'),'btn small ghost');
    if(b.status!=='cancelled')B('Cancel',()=>{if(confirm('Cancel this booking?'))act(b.id,'cancel')},'btn small ghost');
    B('Delete',()=>{if(confirm('Delete this booking and its artwork for good?'))act(b.id,'delete')},'btn small ghost');
    info.append(ac);c.append(mk('img',{src:'/c/'+b.id,alt:b.brand}),info);list.append(c)}}
$('#all').onchange=render;load().catch(e=>$('#err').textContent=String(e));
</script>`);
}
