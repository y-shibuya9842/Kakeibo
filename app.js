const DB_NAME = 'kakeibo-db';
const STORE = 'expenses';
const CATEGORIES = ['食費','交通費','日用品','娯楽','固定費','その他'];
const CAT_ICONS = { '食費':'🍽️','交通費':'🚃','日用品':'🧴','娯楽':'🎮','固定費':'🏠','その他':'🧾' };

const state = {
  view: 'home',
  currentMonth: new Date().toISOString().slice(0,7),
  historyCategory: 'すべて',
  graphYear: new Date().getFullYear(),
  graphCategory: 'すべて',
  graphSelectedMonth: new Date().getMonth()+1,
};

let db;
const main = document.getElementById('main');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');

function yen(n){ return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n||0); }
function monthText(ym){ const [y,m]=ym.split('-'); return `${y}年${Number(m)}月`; }
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function today(){ return new Date().toISOString().slice(0,10); }

async function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{ const d=req.result; if(!d.objectStoreNames.contains(STORE)){ const s=d.createObjectStore(STORE,{keyPath:'id'}); s.createIndex('date','date'); } };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function tx(mode='readonly'){ return db.transaction(STORE,mode).objectStore(STORE); }
async function getAll(){ return new Promise((res,rej)=>{ const r=tx().getAll(); r.onsuccess=()=>res(r.result.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))); r.onerror=()=>rej(r.error); }); }
async function putExpense(x){ return new Promise((res,rej)=>{ const r=tx('readwrite').put(x); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
async function deleteExpense(id){ return new Promise((res,rej)=>{ const r=tx('readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
async function clearAll(){ return new Promise((res,rej)=>{ const r=tx('readwrite').clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }

function setView(view){ state.view=view; document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); render(); }
function setHeader(title,subtitle=''){ pageTitle.textContent=title; pageSubtitle.textContent=subtitle; }
function shiftMonth(ym,delta){ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+delta,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthSum(items,ym,category='すべて'){ return items.filter(x=>x.date.startsWith(ym) && (category==='すべて'||x.category===category)).reduce((a,x)=>a+Number(x.amount),0); }
function showToast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.append(t); setTimeout(()=>t.remove(),1800); }

async function render(){
  const items=await getAll();
  if(state.view==='home') renderHome(items);
  if(state.view==='history') renderHistory(items);
  if(state.view==='graph') renderGraph(items);
  if(state.view==='settings') renderSettings(items);
}

function renderHome(items){
  setHeader('家計簿','シンプルに、毎月の支出を把握');
  const total=monthSum(items,state.currentMonth); const prev=shiftMonth(state.currentMonth,-1); const prevTotal=monthSum(items,prev); const diff=total-prevTotal;
  const recent=items.slice(0,5);
  main.innerHTML=`
    <section class="card summary-card">
      <div class="row"><div class="eyebrow">対象月</div><div class="month-switcher"><button id="prevMonth">‹</button><div class="month-label">${monthText(state.currentMonth)}</div><button id="nextMonth">›</button></div></div>
      <div class="eyebrow" style="margin-top:16px">今月の合計</div>
      <div class="big-amount">${yen(total)}</div>
      <div class="delta">前月より ${diff===0?'±0円':`${diff>0?'+':''}${yen(diff)}`}</div>
    </section>
    <section class="section"><button class="primary-btn" id="addExpense">＋ 支出を追加</button></section>
    <section class="section">
      <div class="section-head"><h2>最近の支出</h2><button class="link-btn" id="seeAll">すべて見る</button></div>
      <div class="card list">${recent.length?recent.map(expenseRow).join(''):'<div class="empty">まだ支出がありません<br>「支出を追加」から登録しましょう</div>'}</div>
    </section>`;
  document.getElementById('prevMonth').onclick=()=>{state.currentMonth=shiftMonth(state.currentMonth,-1);render();};
  document.getElementById('nextMonth').onclick=()=>{state.currentMonth=shiftMonth(state.currentMonth,1);render();};
  document.getElementById('addExpense').onclick=()=>renderExpenseForm();
  document.getElementById('seeAll').onclick=()=>setView('history');
  main.querySelectorAll('.expense-row').forEach(b=>b.onclick=()=>renderExpenseForm(b.dataset.id));
}

function expenseRow(x){
  return `<button class="expense-row" data-id="${x.id}"><div class="icon-badge">${CAT_ICONS[x.category]||'🧾'}</div><div class="expense-main"><div class="expense-title">${escapeHtml(x.title)}</div><div class="expense-meta">${x.date.slice(5).replace('-','/')} ・ ${escapeHtml(x.category)}</div></div><div class="expense-amount">${yen(x.amount)}</div></button>`;
}

async function renderExpenseForm(id=null){
  const items=await getAll(); const x=id?items.find(i=>i.id===id):null;
  setHeader(x?'支出を編集':'支出を追加',x?'内容を修正して保存できます':'入力は端末内に保存されます');
  main.innerHTML=`<section class="card form-card">
    <div class="field"><label>内容</label><input id="fTitle" value="${escapeHtml(x?.title||'')}" placeholder="例：スーパー" maxlength="40"></div>
    <div class="field"><label>金額</label><input id="fAmount" value="${x?.amount||''}" type="number" inputmode="numeric" min="1" step="1" placeholder="例：3280"><div class="help">円単位で入力</div></div>
    <div class="field"><label>カテゴリ</label><select id="fCategory">${CATEGORIES.map(c=>`<option ${x?.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>日付</label><input id="fDate" type="date" value="${x?.date||today()}"></div>
    <div class="field"><label>メモ（任意）</label><textarea id="fMemo" maxlength="100" placeholder="例：夕食の食材を購入">${escapeHtml(x?.memo||'')}</textarea></div>
    <div class="actions"><button class="primary-btn" id="saveExpense">保存</button>${x?'<button class="danger-btn" id="removeExpense">この支出を削除</button>':''}<button class="secondary-btn" id="cancelEdit">キャンセル</button></div>
  </section>`;
  document.getElementById('cancelEdit').onclick=()=>render();
  document.getElementById('saveExpense').onclick=async()=>{
    const title=document.getElementById('fTitle').value.trim(); const amount=Number(document.getElementById('fAmount').value); const category=document.getElementById('fCategory').value; const date=document.getElementById('fDate').value; const memo=document.getElementById('fMemo').value.trim();
    if(!title||!Number.isInteger(amount)||amount<=0||!date){ showToast('内容・金額・日付を確認してください'); return; }
    await putExpense({ id:x?.id||uid(), title, amount, category, date, memo, createdAt:x?.createdAt||new Date().toISOString() });
    state.currentMonth=date.slice(0,7); showToast(x?'更新しました':'保存しました'); setTimeout(()=>setView('home'),250);
  };
  if(x) document.getElementById('removeExpense').onclick=async()=>{ if(confirm('この支出を削除しますか？')){ await deleteExpense(x.id); showToast('削除しました'); setTimeout(()=>setView('history'),250);} };
}

function renderHistory(items){
  setHeader('履歴','月別・カテゴリ別に支出を確認');
  const filtered=items.filter(x=>x.date.startsWith(state.currentMonth)&&(state.historyCategory==='すべて'||x.category===state.historyCategory));
  const total=monthSum(items,state.currentMonth,state.historyCategory);
  const groups={}; filtered.forEach(x=>(groups[x.date]??=[]).push(x));
  main.innerHTML=`
    <section class="card summary-card"><div class="row"><button class="link-btn" id="hPrev">‹</button><div class="month-label">${monthText(state.currentMonth)}</div><button class="link-btn" id="hNext">›</button></div><div class="eyebrow" style="margin-top:16px">合計</div><div class="big-amount">${yen(total)}</div></section>
    <section class="section"><div class="chips">${['すべて',...CATEGORIES].map(c=>`<button class="chip ${state.historyCategory===c?'active':''}" data-cat="${c}">${c}</button>`).join('')}</div></section>
    <section class="section">${Object.keys(groups).length?Object.entries(groups).map(([date,list])=>`<div class="group-title">${date.replaceAll('-','/')}</div><div class="card list">${list.map(expenseRow).join('')}</div>`).join(''):'<div class="card empty">この条件の支出はありません</div>'}</section>`;
  document.getElementById('hPrev').onclick=()=>{state.currentMonth=shiftMonth(state.currentMonth,-1);render();};
  document.getElementById('hNext').onclick=()=>{state.currentMonth=shiftMonth(state.currentMonth,1);render();};
  main.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{state.historyCategory=b.dataset.cat;render();});
  main.querySelectorAll('.expense-row').forEach(b=>b.onclick=()=>renderExpenseForm(b.dataset.id));
}

function renderGraph(items){
  setHeader('グラフ','カテゴリ別に年間の支出を比較');
  const values=Array.from({length:12},(_,i)=>monthSum(items,`${state.graphYear}-${String(i+1).padStart(2,'0')}`,state.graphCategory));
  const max=Math.max(...values,1); const selected=state.graphSelectedMonth;
  main.innerHTML=`
    <section class="section" style="margin-top:0"><div class="chips">${['すべて',...CATEGORIES].map(c=>`<button class="chip ${state.graphCategory===c?'active':''}" data-gcat="${c}">${c}</button>`).join('')}</div></section>
    <section class="section"><div class="card summary-card"><div class="row"><button class="link-btn" id="gPrev">‹</button><div class="month-label">${state.graphYear}年</div><button class="link-btn" id="gNext">›</button></div></div></section>
    <section class="section card graph-card"><div id="chartWrap" class="chart-wrap"></div></section>
    <section class="section"><button class="secondary-btn" id="openSelectedMonth">この月の明細を見る</button></section>`;
  document.getElementById('gPrev').onclick=()=>{state.graphYear--;render();};
  document.getElementById('gNext').onclick=()=>{state.graphYear++;render();};
  main.querySelectorAll('[data-gcat]').forEach(b=>b.onclick=()=>{state.graphCategory=b.dataset.gcat;render();});
  drawChart(values,max,selected);
  document.getElementById('openSelectedMonth').onclick=()=>{ state.currentMonth=`${state.graphYear}-${String(state.graphSelectedMonth).padStart(2,'0')}`; state.historyCategory=state.graphCategory; setView('history'); };
}

function drawChart(values,max,selected){
  const wrap=document.getElementById('chartWrap'); const W=360,H=300,padL=36,padR=8,padT=22,padB=36; const cw=W-padL-padR,ch=H-padT-padB; const step=cw/12; const barW=Math.min(18,step*.65);
  let svg=`<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for(let i=0;i<5;i++){ const y=padT+(ch/4)*i; svg+=`<line class="gridline" x1="${padL}" x2="${W-padR}" y1="${y}" y2="${y}"/>`; const v=Math.round(max*(1-i/4)); svg+=`<text class="axis-text" x="2" y="${y+4}">${v?Math.round(v/1000)+'k':'0'}</text>`; }
  values.forEach((v,i)=>{ const h=v/max*ch; const x=padL+i*step+(step-barW)/2; const y=padT+ch-h; svg+=`<rect class="bar ${selected===i+1?'selected':''}" data-month="${i+1}" x="${x}" y="${y}" width="${barW}" height="${Math.max(h,2)}"></rect><text class="axis-text" x="${x+barW/2}" y="${H-12}" text-anchor="middle">${i+1}</text>`; });
  svg+='</svg>'; wrap.innerHTML=svg;
  const showTip=(month)=>{ state.graphSelectedMonth=month; wrap.querySelectorAll('.bar').forEach(b=>b.classList.toggle('selected',Number(b.dataset.month)===month)); wrap.querySelector('.tooltip')?.remove(); const bar=wrap.querySelector(`[data-month="${month}"]`); const rect=bar.getBoundingClientRect(), wr=wrap.getBoundingClientRect(); const tip=document.createElement('div'); tip.className='tooltip'; tip.textContent=`${month}月  ${yen(values[month-1])}`; tip.style.left=`${rect.left-wr.left+rect.width/2}px`; tip.style.top=`${Math.max(42,rect.top-wr.top)}px`; wrap.append(tip); };
  wrap.querySelectorAll('.bar').forEach(b=>b.addEventListener('click',()=>showTip(Number(b.dataset.month))));
  showTip(selected);
}

function renderSettings(items){
  setHeader('設定','バックアップとデータ管理');
  main.innerHTML=`
    <section class="card settings-list">
      <button class="settings-item" id="backup">データをバックアップ（JSON）</button>
      <button class="settings-item" id="restore">バックアップから復元</button>
      <button class="settings-item" id="deleteAll" style="color:var(--danger)">すべてのデータを削除</button>
    </section>
    <section class="section card form-card"><div class="eyebrow">保存件数</div><div style="font-size:26px;font-weight:800">${items.length}件</div><p class="help">データはこの端末のブラウザ内に保存されます。定期的なバックアップをおすすめします。</p></section>`;
  document.getElementById('backup').onclick=()=>backup(items);
  document.getElementById('restore').onclick=()=>document.getElementById('restoreFile').click();
  document.getElementById('deleteAll').onclick=async()=>{ if(confirm('本当にすべての家計簿データを削除しますか？')){ await clearAll(); showToast('すべて削除しました'); render(); } };
}

function backup(items){
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),expenses:items},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`kakeibo-backup-${today()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.getElementById('restoreFile').addEventListener('change',async(e)=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{ const data=JSON.parse(await file.text()); if(!Array.isArray(data.expenses)) throw new Error(); if(!confirm('現在のデータを置き換えて復元しますか？'))return; await clearAll(); for(const x of data.expenses) await putExpense(x); showToast('復元しました'); render(); }catch{ alert('バックアップファイルを読み込めませんでした'); }
  e.target.value='';
});

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

(async function init(){
  db=await openDB();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
  render();
})();
