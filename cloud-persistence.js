const STORAGE_KEY='ofi_ot_v1';
const API_URL='https://script.google.com/macros/s/AKfycbzTUBdjJMgA0F_txKpNR_b4__F1LT_vb9LRURLvJ_n3tTMs3AFTRllWgLky5gdbV6QV/exec';
let orders=[];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);

async function apiGet(action='list', params={}){
  const q=new URLSearchParams({action,...params});
  const r=await fetch(`${API_URL}?${q.toString()}`,{cache:'no-store'});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const j=await r.json();
  if(!j.ok) throw new Error(j.error||'Error de API');
  return j;
}

async function apiPost(payload){
  const r=await fetch(API_URL,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const j=await r.json();
  if(!j.ok) throw new Error(j.error||'Error de API');
  return j;
}

async function loadOrders(){
  try{
    const legacy=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    const j=await apiGet('list');
    orders=(j.data||[]).map(o=>{
      if(!o.internalId) o.internalId=o.id||crypto.randomUUID();
      return o;
    });

    for(const old of legacy){
      const exists=orders.some(o=>(old.internalId&&o.internalId===old.internalId)||(old.otNumber&&o.otNumber===old.otNumber));
      if(!exists){
        if(!old.internalId) old.internalId=crypto.randomUUID();
        const created=await apiPost({action:'create',data:old});
        const saved=created.data||old;
        if(!saved.internalId) saved.internalId=old.internalId;
        orders.push(saved);
      }
    }

    if(legacy.length) localStorage.removeItem(STORAGE_KEY);
    renderAll();
  }catch(err){
    console.error(err);
    alert('No se pudo conectar con Google Sheets: '+err.message);
    renderAll();
  }
}

function nextNumber(){
  const year=new Date().getFullYear();
  const nums=orders.map(o=>o.otNumber).filter(x=>x&&x.startsWith('OT-'+year+'-')).map(x=>parseInt(x.split('-').pop(),10)||0);
  return `OT-${year}-${String((nums.length?Math.max(...nums):0)+1).padStart(4,'0')}`;
}

function showView(id,title){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $(id).classList.add('active');
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  $('pageTitle').textContent=title||({dashboard:'Dashboard',editor:'Orden de Trabajo',active:'Órdenes activas',archive:'Archivo'}[id]||'');
  window.scrollTo({top:0,behavior:'smooth'});
}

function newOT(){
  $('otForm').reset();
  $('internalId').value='';
  $('otNumber').value=nextNumber();
  $('date').value=today();
  $('status').value='Pendiente';
  $('priority').value='Media';
  $('closed').value='No';
  $('versions').innerHTML='';
  addVersion();
  showView('editor','Nueva Orden de Trabajo');
}

function addVersion(v={}) {
  const row=document.createElement('div'); row.className='version-row';
  row.innerHTML=`<input placeholder="Versión" value="${esc(v.version||'V'+(document.querySelectorAll('.version-row').length+1))}">
  <input type="date" value="${esc(v.date||today())}">
  <input placeholder="Cambio solicitado" value="${esc(v.change||'')}">
  <input placeholder="Responsable" value="${esc(v.responsible||'')}">
  <select><option ${v.approved==='No'?'selected':''}>No</option><option ${v.approved==='Sí'?'selected':''}>Sí</option></select>
  <button type="button" class="smallbtn">×</button>`;
  row.querySelector('button').onclick=()=>row.remove();
  $('versions').appendChild(row);
}

function getChecks(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value)}
function setChecks(name,vals=[]){document.querySelectorAll(`input[name="${name}"]`).forEach(x=>x.checked=vals.includes(x.value))}

function formData(){
  const ids=['internalId','otNumber','date','client','responsible','priority','status','project','deliveryDate','pieceType','quantity','requestedBy','designer','objective','description','audience','message','matLogo','matTexts','matPhotos','matRefs','materialNotes','finalSize','orientation','colors','fonts','resolution','bleed','visualStyle','editable','specialNotes','paper','weight','printSystem','printQty','finishes','prodSize','colorProof','productionNotes','deliveredFormat','finalDeliveryDate','sentProduction','deliveryMedium','finalApproval','approvalDate','closed','closingNotes'];
  const o={}; ids.forEach(id=>o[id]=$(id).value);
  o.channels=getChecks('channel');
  o.versions=[...document.querySelectorAll('.version-row')].map(r=>{const c=r.children;return {version:c[0].value,date:c[1].value,change:c[2].value,responsible:c[3].value,approved:c[4].value}});
  o.updatedAt=new Date().toISOString();
  return o;
}

function fillForm(o){
  newOT();
  Object.entries(o).forEach(([k,v])=>{if($(k)&&typeof v!=='object') $(k).value=v??''});
  setChecks('channel',o.channels||[]);
  $('versions').innerHTML='';
  (o.versions||[]).forEach(addVersion);
  if(!(o.versions||[]).length)addVersion();
  showView('editor',o.otNumber);
}

$('otForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const o=formData();
  if(!o.client.trim()){alert('Ingrese CLIENTE / EMPRESA.');return}
  const submitBtn=e.submitter;
  if(submitBtn) submitBtn.disabled=true;
  try{
    const i=orders.findIndex(x=>x.internalId===o.internalId);
    let saved;
    if(i<0){
      if(!o.internalId)o.internalId=crypto.randomUUID();
      o.createdAt=new Date().toISOString();
      saved=(await apiPost({action:'create',data:o})).data;
      if(!saved.internalId)saved.internalId=o.internalId;
      orders.push(saved);
    }else{
      o.id=orders[i].id;
      o.createdAt=orders[i].createdAt;
      saved=(await apiPost({action:'update',data:o})).data;
      if(!saved.internalId)saved.internalId=o.internalId;
      orders[i]=saved;
    }
    $('internalId').value=saved.internalId||saved.id;
    $('otNumber').value=saved.otNumber||o.otNumber;
    renderAll();
    alert('Orden guardada en Google Sheets.');
  }catch(err){
    console.error(err);
    alert('ERROR al guardar en Google Sheets: '+err.message);
  }finally{
    if(submitBtn)submitBtn.disabled=false;
  }
});

function tableHTML(list,archived=false){
  if(!list.length)return '<div class="empty">No hay órdenes para mostrar.</div>';
  return `<div class="tablewrap"><table><thead><tr><th>OT</th><th>Cliente</th><th>Proyecto</th><th>Responsable</th><th>Entrega</th><th>Estado</th><th></th></tr></thead><tbody>${list.map(o=>`<tr><td><b>${esc(o.otNumber)}</b></td><td>${esc(o.client)}</td><td>${esc(o.project)}</td><td>${esc(o.responsible||o.designer)}</td><td>${esc(o.deliveryDate)}</td><td><span class="badge ${esc((o.status||'').replaceAll(' ','-'))}">${esc(o.status)}</span></td><td><button class="btn" onclick="openOrder('${o.internalId}')">Abrir</button></td></tr>`).join('')}</tbody></table></div>`;
}

window.openOrder=id=>{const o=orders.find(x=>x.internalId===id); if(o)fillForm(o)};

function renderAll(){
  const active=orders.filter(o=>o.status!=='Cerrado'&&o.closed!=='Sí');
  const archived=orders.filter(o=>o.status==='Cerrado'||o.closed==='Sí');
  $('statActive').textContent=active.length;
  $('statPending').textContent=active.filter(o=>o.status==='Pendiente').length;
  $('statApproval').textContent=active.filter(o=>o.status==='Aprobación').length;
  $('statArchived').textContent=archived.length;
  const recent=[...orders].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,5);
  $('recentTable').innerHTML=tableHTML(recent);
  filterTables();
}

function filterTables(){
  const aq=($('activeSearch')?.value||'').toLowerCase(), rq=($('archiveSearch')?.value||'').toLowerCase();
  const match=(o,q)=>[o.otNumber,o.client,o.project,o.responsible,o.designer].join(' ').toLowerCase().includes(q);
  const active=orders.filter(o=>o.status!=='Cerrado'&&o.closed!=='Sí').filter(o=>match(o,aq));
  const archived=orders.filter(o=>o.status==='Cerrado'||o.closed==='Sí').filter(o=>match(o,rq));
  $('activeTable').innerHTML=tableHTML(active);
  $('archiveTable').innerHTML=tableHTML(archived,true);
}

$('activeSearch').addEventListener('input',filterTables);
$('archiveSearch').addEventListener('input',filterTables);
document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>{
  if(b.dataset.view==='editor')newOT(); else showView(b.dataset.view);
});
$('newOTTop').onclick=newOT;
$('newOTNav').onclick=newOT;
$('addVersion').onclick=()=>addVersion();

$('duplicateBtn').onclick=()=>{
  const o=formData();
  o.internalId='';
  o.otNumber=nextNumber();
  o.status='Pendiente';
  o.closed='No';
  o.date=today();
  fillForm(o);
  $('internalId').value='';
  $('otNumber').value=o.otNumber;
};

$('closeBtn').onclick=()=>{
  if(!$('internalId').value){alert('Primero guarde la orden.');return}
  $('status').value='Cerrado';
  $('closed').value='Sí';
  if(!$('finalDeliveryDate').value)$('finalDeliveryDate').value=today();
  $('otForm').requestSubmit();
  setTimeout(()=>showView('archive','Archivo'),500);
};