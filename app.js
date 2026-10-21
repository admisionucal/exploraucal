(() => {
const CFG = window.EXPLORA_CONFIG || {};
const MUNDOS = ["ARQUITECTURA","COMUNICACIONES","DISEÑO","NEGOCIOS","PSICOLOGIA"];
const CARRERAS = {
  "Arquitectura":"ARQUITECTURA","Arquitectura de Interiores":"ARQUITECTURA","Diseño Digital de Interiores":"ARQUITECTURA",
  "Comunicación Audiovisual y Cine":"COMUNICACIONES","Comunicación y Marketing Digital":"COMUNICACIONES","Comunicación y Publicidad Transmedia":"COMUNICACIONES",
  "Diseño Gráfico Publicitario":"DISEÑO","Diseño Gráfico y Marketing Digital":"DISEÑO",
  "Administración y Dirección de Empresas":"NEGOCIOS","Administración y Marketing":"NEGOCIOS","Administración y Negocios Internacionales":"NEGOCIOS","Marketing e Innovación":"NEGOCIOS",
  "Psicología":"PSICOLOGIA"
};
const PADRES = new Set(["Madre","Padre","Familiar"]);
const $ = s => document.querySelector(s);
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const digits = s => String(s ?? "").replace(/\D/g,"");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ls = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };

let sb=null, session=null, channel=null;
let eventos=[], eid=null, regs=[], cortes=[];
let editingId=null, grado=null, acomp=[];
let corteHora="";

/* ---------- helpers ---------- */
function toast(msg, kind=""){
  const t=$("#toast"); t.textContent=msg; t.className="toast "+kind; t.hidden=false;
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true, 2800);
}
function banner(msg){ const b=$("#banner"); b.textContent=msg||""; b.hidden=!msg; }
function curEvent(){ return eventos.find(e=>e.id===eid) || null; }
function fmtHora(iso){ if(!iso) return "—"; return new Date(iso).toLocaleTimeString("es-PE",{hour:"numeric",minute:"2-digit"}); }
function fmtHM(hm){ if(!hm) return ""; const [h,m]=hm.split(":").map(Number); const d=new Date(); d.setHours(h,m,0,0); return d.toLocaleTimeString("es-PE",{hour:"numeric",minute:"2-digit"}); }
function nowHM(){ return new Date().toTimeString().slice(0,5); }
function eventYear(){ const e=curEvent(); return e?.fecha ? Number(e.fecha.slice(0,4)) : new Date().getFullYear(); }
function egresoDe(g){ const y=eventYear(); return g==="5to"?y : g==="4to"?y+1 : g==="3ero"?y+2 : ""; }
function gradoLabel(g){ return g==="Ya acabo el colegio" ? "Egresado" : (g||"—"); }
function upsertLocal(list,row){ const i=list.findIndex(x=>x.id===row.id); if(i>=0) list[i]=row; else list.push(row); }
function dbError(e){
  console.error(e);
  const m=String(e?.message||"");
  if(/row-level security|permission|JWT/i.test(m)) toast("Sin permiso: inicia sesión con tu correo @"+(CFG.DOMINIO||"ucal.edu.pe"),"bad");
  else if(/Failed to fetch|NetworkError/i.test(m)) toast("Sin conexión. Revisa el internet e intenta de nuevo.","bad");
  else toast("No se pudo guardar: "+m,"bad");
}

/* ---------- corte ---------- */
function corteLimit(){
  if(!corteHora) return null;
  const day = curEvent()?.fecha || new Date().toISOString().slice(0,10);
  return new Date(day+"T"+corteHora+":59");
}
function computeCorte(limit){
  const cols=[...MUNDOS];
  if(regs.some(r=>r.asistio && !MUNDOS.includes(r.mundo))) cols.push("SIN CARRERA");
  const z=()=>Object.fromEntries(cols.map(c=>[c,0]));
  const t={padres:z(),otros:z(),egresados:z(),quinto:z(),nv:z(),singrado:z()};
  for(const r of regs){
    if(!r.asistio) continue;
    if(limit && r.hora && new Date(r.hora) > limit) continue;
    const m = MUNDOS.includes(r.mundo) ? r.mundo : "SIN CARRERA";
    if(r.grado==="Ya acabo el colegio") t.egresados[m]++;
    else if(r.grado==="5to") t.quinto[m]++;
    else if(r.grado==="3ero"||r.grado==="4to") t.nv[m]++;
    else t.singrado[m]++;
    for(const a of (r.acomp||[])){ if(PADRES.has(a.tipo)) t.padres[m]++; else t.otros[m]++; }
  }
  const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
  const total=z(); for(const c of cols) total[c]=t.padres[c]+t.otros[c]+t.egresados[c]+t.quinto[c]+t.nv[c]+t.singrado[c];
  const rows=[
    {k:"total",label:"Total asistentes (Padres + Alumnos)",v:total,cls:"tot"},
    {k:"padres",label:"Padres",v:t.padres},
    {k:"otros",label:"Otros acompañantes",v:t.otros,hideZero:true},
    {k:"egresados",label:"Alumnos Egresados",v:t.egresados},
    {k:"quinto",label:"Alumnos 5to",v:t.quinto},
    {k:"nv",label:"Alumnos no vendibles",v:t.nv},
    {k:"singrado",label:"Alumnos sin grado",v:t.singrado,hideZero:true},
  ].filter(r=>!(r.hideZero && sum(r.v)===0)).map(r=>({...r,sum:sum(r.v)}));
  return {cols,rows,total:sum(total),
    alumnos:sum(t.egresados)+sum(t.quinto)+sum(t.nv)+sum(t.singrado),
    padres:sum(t.padres)+sum(t.otros), vend:sum(t.egresados)+sum(t.quinto), nv:sum(t.nv), byMundo:total};
}
function corteLabel(){ return "Corte a las "+(corteHora ? fmtHM(corteHora) : fmtHM(nowHM())); }

function renderLive(){
  const c=computeCorte(null);
  $("#liveTotal").textContent=c.total; $("#liveAlum").textContent=c.alumnos; $("#livePad").textContent=c.padres;
  $("#liveVend").textContent=c.vend; $("#liveNV").textContent=c.nv;
  $("#liveTime").textContent=fmtHM(nowHM());
  const max=Math.max(1,...Object.values(c.byMundo));
  $("#liveBars").innerHTML=c.cols.map(m=>`<div class="mbar"><span>${esc(m)}</span><div class="track"><div class="fill" style="width:${(c.byMundo[m]/max*100).toFixed(1)}%"></div></div><b class="num">${c.byMundo[m]}</b></div>`).join("");
  $("#cntAsis").textContent=regs.filter(r=>r.asistio).length;
}
function renderCorte(){
  const ev=curEvent(); const c=computeCorte(corteLimit());
  $("#corteTitle").textContent=`Total asistentes · ${corteLabel()}`;
  $("#corteHora").value=corteHora;
  $("#btnAhora").classList.toggle("primary", !corteHora);
  const head=`<thead><tr><th>${esc(ev?.nombre||"Evento")}</th>${c.cols.map(m=>`<th class="n">${esc(m)}</th>`).join("")}<th class="n">TOTAL</th></tr></thead>`;
  const body=c.rows.map(r=>`<tr class="${r.cls||""}"><td>${esc(r.label)}</td>${c.cols.map(m=>`<td class="n">${r.v[m]}</td>`).join("")}<td class="n rowtot">${r.sum}</td></tr>`).join("");
  $("#corteTable").innerHTML=head+"<tbody>"+body+"</tbody>";
  renderCortes();
}
function corteText(){
  const ev=curEvent(); const c=computeCorte(corteLimit());
  const L=[`*${ev?.nombre||"Evento"}*`, `Total asistentes – ${corteLabel()}`, ``, `*Total (Padres + Alumnos): ${c.total}*`];
  for(const r of c.rows.slice(1)) L.push(`${r.label}: ${r.sum}`);
  L.push("", "*Por mundo*");
  for(const m of c.cols){
    const g=k=>c.rows.find(r=>r.k===k)?.v[m]??0;
    L.push(`• ${m}: ${c.byMundo[m]} (Padres ${g("padres")} · Egres. ${g("egresados")} · 5to ${g("quinto")} · No vend. ${g("nv")})`);
  }
  return L.join("\n");
}
function renderCortes(){
  const el=$("#cortesList");
  if(!cortes.length){ el.innerHTML=`<p class="note">Aún no hay cortes guardados. Usa "Guardar corte" para dejar registro de la hora y los totales (por ejemplo, el de las 12:00 pm).</p>`; return; }
  el.innerHTML=`<div class="tablewrap"><table><thead><tr><th>Corte</th><th class="n">Total</th>${MUNDOS.map(m=>`<th class="n">${m}</th>`).join("")}<th>Guardado por</th><th></th></tr></thead><tbody>${
    [...cortes].sort((a,b)=>String(a.hora).localeCompare(String(b.hora))).map(k=>`<tr><td>${esc(k.label)}</td><td class="n"><b>${k.total}</b></td>${MUNDOS.map(m=>`<td class="n">${k.by_mundo?.[m]??0}</td>`).join("")}<td>${esc(k.por||"")}</td><td><button class="btn sm ghost" data-delcorte="${esc(k.id)}">Quitar</button></td></tr>`).join("")
  }</tbody></table></div>`;
}

/* ---------- formulario ---------- */
function fillCarreras(){
  const groups={}; for(const [c,m] of Object.entries(CARRERAS)) (groups[m]=groups[m]||[]).push(c);
  $("#fCarrera").innerHTML=`<option value="">Elige carrera…</option>`+MUNDOS.map(m=>`<optgroup label="${m}">${groups[m].map(c=>`<option>${esc(c)}</option>`).join("")}</optgroup>`).join("");
}
function setGrado(g){
  grado=g||null;
  document.querySelectorAll("#segGrado button").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.v===grado)));
  if(grado && grado!=="Ya acabo el colegio") $("#fEgreso").value=egresoDe(grado);
  else if(grado==="Ya acabo el colegio" && Number($("#fEgreso").value)>=eventYear()) $("#fEgreso").value="";
}
function renderAcomp(){
  $("#acompList").innerHTML = acomp.map((a,i)=>`<div class="arow">
    <select data-i="${i}" data-k="tipo">${["Madre","Padre","Familiar","Estudiante"].map(t=>`<option ${a.tipo===t?"selected":""}>${t}</option>`).join("")}</select>
    <input class="an" type="text" data-i="${i}" data-k="nombre" placeholder="Nombres y apellidos" value="${esc(a.nombre)}">
    <input type="tel" data-i="${i}" data-k="celular" placeholder="Celular" value="${esc(a.celular)}">
    <button type="button" class="btn sm ghost" data-rm="${i}" aria-label="Quitar acompañante">Quitar</button></div>`).join("");
  $("#addAcomp").querySelectorAll("button").forEach(b=>b.disabled = acomp.length>=3);
}
function clearForm(){
  editingId=null;
  ["fNombre","fCel","fDni","fProm","fCole","fCod","fEgreso","fMundo"].forEach(id=>$("#"+id).value="");
  $("#fCarrera").value=""; setGrado(null); acomp=[]; renderAcomp();
  $("#formTitle").textContent="Nuevo asistente"; $("#formStatus").innerHTML="";
  $("#btnSave").textContent="Registrar llegada";
}
function loadIntoForm(r){
  editingId=r.id;
  $("#fNombre").value=r.nombre||""; $("#fCel").value=r.celular||""; $("#fDni").value=r.dni||""; $("#fProm").value=r.id_prometeo||"";
  $("#fCarrera").value=CARRERAS[r.carrera]?r.carrera:""; $("#fMundo").value=r.mundo||CARRERAS[r.carrera]||"";
  $("#fCole").value=r.colegio||""; $("#fCod").value=r.cod_modular||""; $("#fEgreso").value=r.egreso||"";
  setGrado(r.grado||null); if(r.egreso) $("#fEgreso").value=r.egreso;
  acomp=(r.acomp||[]).map(a=>({...a})); renderAcomp();
  $("#formTitle").textContent="Editar asistente";
  $("#formStatus").innerHTML = `<span class="pill ok">Llegó ${fmtHora(r.hora)}</span>`;
  $("#btnSave").textContent = "Guardar cambios";
  $("#fNombre").focus();
}
async function saveForm(ev){
  ev?.preventDefault();
  if(!eid){ toast("Primero crea o elige un evento","bad"); return; }
  const nombre=$("#fNombre").value.trim(), cel=digits($("#fCel").value), carrera=$("#fCarrera").value, regis=$("#fRegistrador").value.trim(), dni=digits($("#fDni").value);
  const miss=[]; if(!nombre) miss.push("nombre"); if(!cel) miss.push("celular"); if(!carrera) miss.push("carrera"); if(!grado) miss.push("grado"); if(!regis) miss.push("registrador");
  if(miss.length){ toast("Falta: "+miss.join(", "),"bad"); return; }
  if(!editingId){
    const dup=regs.find(r=>digits(r.celular)===cel || (dni && digits(r.dni)===dni));
    if(dup && dup.asistio){ toast(`${dup.nombre} ya está registrado (${fmtHora(dup.hora)})`,"bad"); loadIntoForm(dup); return; }
  }
  const prev = editingId ? regs.find(r=>r.id===editingId) : null;
  const data={
    evento_id:eid, nombre, celular:cel, dni, id_prometeo:digits($("#fProm").value),
    carrera, mundo:CARRERAS[carrera]||"", grado, egreso:Number($("#fEgreso").value)||null,
    colegio:$("#fCole").value.trim(), cod_modular:digits($("#fCod").value),
    acomp:acomp.filter(a=>a.nombre.trim()||a.celular.trim()||a.tipo).map(a=>({tipo:a.tipo,nombre:a.nombre.trim(),celular:digits(a.celular)})),
    confirmo:prev?.confirmo||"", origen:prev?.origen||"walkin",
    registrador: prev?.asistio ? (prev.registrador||regis) : regis,
    asistio:true, hora: prev?.asistio ? (prev.hora||null) : new Date().toISOString(),
    actualizado:new Date().toISOString()
  };
  ls.set("explora.registrador", regis);
  $("#btnSave").disabled=true;
  try{
    const q = editingId ? sb.from("registros").update(data).eq("id",editingId) : sb.from("registros").insert(data);
    const {data:row,error}=await q.select().single();
    if(error) throw error;
    upsertLocal(regs,row); renderAll();
    toast(prev?.asistio ? "Cambios guardados" : `Llegada registrada: ${nombre}${data.acomp.length?` + ${data.acomp.length}`:""}`,"ok");
    clearForm(); $("#fNombre").focus();
  }catch(e){ dbError(e); }
  finally{ $("#btnSave").disabled=false; }
}

/* ---------- lista ---------- */
function renderLista(){
  if(!eid){ $("#listaTable").innerHTML=""; return; }
  const q=norm($("#qLista").value), qd=digits($("#qLista").value);
  let rows=regs.filter(r=>r.asistio);
  if(q) rows=rows.filter(r=>norm([r.nombre,r.carrera,r.mundo,r.registrador,r.colegio,...(r.acomp||[]).map(a=>a.nombre)].join(" ")).includes(q) || (qd.length>=3 && (digits(r.celular).includes(qd)||digits(r.dni).includes(qd))));
  rows.sort((a,b)=>String(b.hora||"").localeCompare(String(a.hora||"")));
  if(!rows.length){ $("#listaTable").innerHTML=`<tbody><tr><td style="text-align:center;color:var(--muted);padding:24px">${regs.length?"Nadie coincide con la búsqueda.":"Todavía no hay asistentes en este evento. Registra la primera llegada en la pestaña Registro."}</td></tr></tbody>`; return; }
  $("#listaTable").innerHTML=`<thead><tr><th>Llegada</th><th>Nombres y apellidos</th><th>Celular</th><th>Carrera</th><th>Mundo</th><th>Grado</th><th>Acompañantes</th><th>Registrador</th><th></th></tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td><span class="pill ok">${fmtHora(r.hora)}</span></td>
      <td class="wrap">${esc(r.nombre)}</td><td class="num">${esc(r.celular)}</td><td>${esc(r.carrera||"—")}</td><td>${esc(r.mundo||"—")}</td>
      <td>${r.grado==="3ero"||r.grado==="4to"?`<span class="pill warn">${esc(r.grado)}</span>`:esc(gradoLabel(r.grado))}</td>
      <td class="wrap">${(r.acomp||[]).map(a=>esc(a.tipo)+(a.nombre?": "+esc(a.nombre):"")).join("<br>")||"—"}</td>
      <td>${esc(r.registrador||"—")}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn sm" data-edit="${esc(r.id)}">Editar</button>
        <button class="btn sm danger" data-del="${esc(r.id)}">Eliminar</button></div></td></tr>`).join("")
  }</tbody>`;
}

/* ---------- eventos y datos ---------- */
function renderEventos(){
  const sorted=[...eventos].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  $("#evSelect").innerHTML = sorted.length ? sorted.map(e=>`<option value="${esc(e.id)}" ${e.id===eid?"selected":""}>${esc(e.nombre)}</option>`).join("") : `<option value="">Sin eventos</option>`;
  const e=curEvent(); $("#evTitle").textContent = e ? e.nombre : "Registro de asistentes";
}
function renderAll(){
  renderEventos(); renderLive(); renderLista(); renderCorte();
  const names=[...new Set([ls.get("explora.registrador"),...regs.map(r=>r.registrador)].filter(Boolean))];
  $("#regList").innerHTML=names.map(n=>`<option value="${esc(n)}">`).join("");
}
async function fetchAll(table, evId){
  const out=[]; const size=1000;
  for(let from=0;;from+=size){
    const {data,error}=await sb.from(table).select("*").eq("evento_id",evId).range(from,from+size-1);
    if(error) throw error; out.push(...data); if(data.length<size) break;
  }
  return out;
}
async function selectEvent(id){
  eid=id||null; ls.set("explora.evento", id||"");
  regs=[]; cortes=[]; clearForm(); renderAll();
  if(!id) return;
  try{
    const [r,c]=await Promise.all([fetchAll("registros",id), fetchAll("cortes",id)]);
    if(eid!==id) return;
    regs=r; cortes=c; renderAll();
  }catch(e){ dbError(e); }
}
async function loadEventos(){
  const {data,error}=await sb.from("eventos").select("*").order("fecha",{ascending:false});
  if(error){ dbError(error); return; }
  eventos=data;
  if(!eventos.length){ renderAll(); $("#newEvForm").hidden=false; $("#nevDate").value=new Date().toISOString().slice(0,10); return; }
  const saved=ls.get("explora.evento");
  await selectEvent(eventos.find(e=>e.id===saved)?.id || eventos[0].id);
}
function subscribe(){
  channel?.unsubscribe();
  channel=sb.channel("explora")
    .on("postgres_changes",{event:"*",schema:"public",table:"registros"},p=>{
      if(p.eventType==="DELETE"){ regs=regs.filter(r=>r.id!==p.old.id); }
      else if(p.new.evento_id===eid){ upsertLocal(regs,p.new); }
      else return;
      renderAll();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"cortes"},p=>{
      if(p.eventType==="DELETE") cortes=cortes.filter(c=>c.id!==p.old.id);
      else if(p.new.evento_id===eid) upsertLocal(cortes,p.new);
      renderCortes();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"eventos"},p=>{
      if(p.eventType==="DELETE") eventos=eventos.filter(e=>e.id!==p.old.id); else upsertLocal(eventos,p.new);
      renderEventos();
    })
    .subscribe(status=>{
      $("#syncDot").dataset.on = status==="SUBSCRIBED" ? "1" : "0";
      $("#syncDot").title = status==="SUBSCRIBED" ? "Conectado en tiempo real" : "Reconectando…";
    });
}

/* ---------- exportar ---------- */
function regsSheet(){
  const H=["Registrador","ID Prometeo","Nombres y Apellidos","DNI","Celular","Carrera","Mundo","¿Confirmó asistencia?","Cod Modular","Nombre Colegio","¿En qué grado está?","Año egreso de cole"];
  for(const s of [""," 2"," 3"]) H.push("¿Tiene acompañante?"+s,"¿Quien es?"+s,"Nombres y apellidos del acompañante"+s,"Celular del acompañante"+s);
  H.push("Hora de llegada");
  const num=v=>v&&/^\d+$/.test(v)?Number(v):(v||"");
  const data=[...regs].sort((a,b)=>String(a.nombre).localeCompare(b.nombre)).map(r=>{
    const row=[r.asistio?r.registrador:"",num(r.id_prometeo),r.nombre,num(r.dni),num(r.celular),r.carrera,r.mundo,r.confirmo||"",num(r.cod_modular),r.colegio,r.grado,r.egreso||""];
    for(let i=0;i<3;i++){ const a=(r.acomp||[])[i]; row.push(a?"Si":"",a?a.tipo:"",a?a.nombre:"",a?num(a.celular):""); }
    row.push(r.hora?new Date(r.hora).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit",hour12:false}):"");
    return row;
  });
  const ws=XLSX.utils.aoa_to_sheet([H,...data]); ws["!cols"]=H.map((h,i)=>({wch:i===2||i===9?32:16})); return ws;
}
function corteSheet(){
  const ev=curEvent(); const c=computeCorte(corteLimit());
  const aoa=[[`Total asistentes - ${corteLabel()}`],[],[ev?.nombre||"Evento",...c.cols,"TOTAL"],...c.rows.map(r=>[r.label,...c.cols.map(m=>r.v[m]),r.sum]),[],["*Alumnos egresados son los que ya acabaron el colegio"],["*Alumnos no vendibles son los que están en 3ero o 4to sec."]];
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws["!cols"]=[{wch:38},...c.cols.map(()=>({wch:16})),{wch:10}]; return ws;
}
function exportXlsx(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, corteSheet(), "Corte");
  XLSX.utils.book_append_sheet(wb, regsSheet(), "Registros");
  const name=(curEvent()?.nombre||"evento").replace(/[^\w.\- ]+/g,"").trim()||"evento";
  XLSX.writeFile(wb, `${name}.xlsx`);
}

/* ---------- eventos de UI ---------- */
function showTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", String(t.dataset.tab===name)));
  ["registro","corte","lista"].forEach(v=>$("#v-"+v).hidden = v!==name);
  if(name==="corte") renderCorte(); if(name==="lista") renderLista(); if(name==="registro") $("#fNombre").focus();
}
function bindUI(){
  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>showTab(t.dataset.tab)));
  document.addEventListener("click",e=>{ const g=e.target.closest("[data-goto]"); if(g) showTab(g.dataset.goto); });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape" && !$("#v-registro").hidden && !$("#app").hidden){ clearForm(); $("#fNombre").focus(); }
    if(e.key==="Enter" && (e.ctrlKey||e.metaKey) && !$("#v-registro").hidden && !$("#app").hidden){ e.preventDefault(); saveForm(); }
  });
  $("#fCarrera").addEventListener("change",()=>{ $("#fMundo").value=CARRERAS[$("#fCarrera").value]||""; });
  $("#segGrado").addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) setGrado(b.dataset.v); });
  $("#addAcomp").addEventListener("click",e=>{ const b=e.target.closest("[data-t]"); if(!b||acomp.length>=3) return; acomp.push({tipo:b.dataset.t,nombre:"",celular:""}); renderAcomp(); $(`#acompList [data-i="${acomp.length-1}"][data-k="nombre"]`)?.focus(); });
  const accSync=e=>{ const el=e.target; if(el.dataset.i!=null) acomp[+el.dataset.i][el.dataset.k]=el.value; };
  $("#acompList").addEventListener("input",accSync); $("#acompList").addEventListener("change",accSync);
  $("#acompList").addEventListener("click",e=>{ const b=e.target.closest("[data-rm]"); if(b){ acomp.splice(+b.dataset.rm,1); renderAcomp(); } });
  $("#btnClear").addEventListener("click",()=>{ clearForm(); $("#fNombre").focus(); });
  $("#regForm").addEventListener("submit",saveForm);

  $("#evSelect").addEventListener("change",e=>selectEvent(e.target.value));
  $("#btnNewEv").addEventListener("click",()=>{ $("#newEvForm").hidden=false; $("#nevDate").value=new Date().toISOString().slice(0,10); $("#nevName").focus(); });
  $("#nevCancel").addEventListener("click",()=>$("#newEvForm").hidden=true);
  $("#newEvForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const nombre=$("#nevName").value.trim(), fecha=$("#nevDate").value; if(!nombre||!fecha) return;
    const {data,error}=await sb.from("eventos").insert({nombre,fecha}).select().single();
    if(error){ dbError(error); return; }
    upsertLocal(eventos,data); $("#newEvForm").hidden=true; $("#nevName").value=""; await selectEvent(data.id); toast("Evento creado","ok");
  });

  $("#corteHora").addEventListener("change",e=>{ corteHora=e.target.value; renderCorte(); });
  $("#btnAhora").addEventListener("click",()=>{ corteHora=""; renderCorte(); });
  $("#btnCopy").addEventListener("click",()=>{
    const txt=corteText();
    navigator.clipboard.writeText(txt).then(()=>toast("Corte copiado. Pégalo en WhatsApp.","ok")).catch(()=>{
      const ta=document.createElement("textarea"); ta.value=txt; ta.style.cssText="width:100%;height:220px"; $("#cortesList").before(ta); ta.select(); toast("Copia el texto seleccionado");
    });
  });
  $("#btnSaveCorte").addEventListener("click",async()=>{
    if(!eid) return; const c=computeCorte(corteLimit()); const hm=corteHora||nowHM();
    const rec={evento_id:eid,hora:hm,label:"Corte "+fmtHM(hm),total:c.total,by_mundo:c.byMundo,filas:Object.fromEntries(c.rows.map(r=>[r.k,r.sum])),por:$("#fRegistrador").value.trim()||session?.user?.email||""};
    const {data,error}=await sb.from("cortes").upsert(rec,{onConflict:"evento_id,hora"}).select().single();
    if(error){ dbError(error); return; } upsertLocal(cortes,data); renderCortes(); toast("Corte guardado","ok");
  });
  $("#cortesList").addEventListener("click",async e=>{ const b=e.target.closest("[data-delcorte]"); if(!b) return;
    const {error}=await sb.from("cortes").delete().eq("id",b.dataset.delcorte); if(error) return dbError(error);
    cortes=cortes.filter(c=>c.id!==b.dataset.delcorte); renderCortes(); });
  $("#btnExportCorte").addEventListener("click",exportXlsx);
  $("#btnExportAll").addEventListener("click",exportXlsx);

  $("#qLista").addEventListener("input",renderLista);
  let pendingDel=null;
  $("#listaTable").addEventListener("click",async e=>{
    const ed=e.target.closest("[data-edit]"), del=e.target.closest("[data-del]");
    if(ed){ const r=regs.find(x=>x.id===ed.dataset.edit); if(r){ showTab("registro"); loadIntoForm(r); } }
    if(del){
      if(pendingDel!==del.dataset.del){ pendingDel=del.dataset.del; del.textContent="¿Seguro? Clic otra vez"; setTimeout(()=>{ if(pendingDel===del.dataset.del){ pendingDel=null; del.textContent="Eliminar"; } },3000); return; }
      pendingDel=null; const id=del.dataset.del;
      const {error}=await sb.from("registros").delete().eq("id",id); if(error) return dbError(error);
      regs=regs.filter(r=>r.id!==id); renderAll(); toast("Registro eliminado");
    }
  });


  // Login
  $("#loginForm").addEventListener("submit",async e=>{
    e.preventDefault(); $("#loginMsg").textContent="";
    const email=$("#lEmail").value.trim().toLowerCase(), password=$("#lPass").value;
    if(!email.endsWith("@"+CFG.DOMINIO)){ $("#loginMsg").textContent=`Usa tu correo @${CFG.DOMINIO}.`; return; }
    $("#btnLogin").disabled=true;
    const {error}=await sb.auth.signInWithPassword({email,password});
    $("#btnLogin").disabled=false;
    if(error) $("#loginMsg").textContent = /Invalid login/i.test(error.message) ? "Correo o contraseña incorrectos." : error.message;
  });
  $("#btnMagic").addEventListener("click",async()=>{
    const email=$("#lEmail").value.trim().toLowerCase();
    if(!email.endsWith("@"+CFG.DOMINIO)){ $("#loginMsg").textContent=`Escribe tu correo @${CFG.DOMINIO} y vuelve a presionar.`; return; }
    const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.href.split("#")[0]}});
    $("#loginMsg").textContent = error ? (/not found|signups not allowed/i.test(error.message)?"Ese correo no tiene acceso. Pide al administrador que te agregue.":error.message) : "Te enviamos un enlace de acceso. Revisa tu correo.";
  });
  $("#btnLogout").addEventListener("click",()=>sb.auth.signOut());

  setInterval(()=>{ renderLive(); if(!corteHora && !$("#v-corte").hidden) renderCorte(); }, 30000);
}

/* ---------- arranque ---------- */
async function onSession(s){
  session=s;
  const email=s?.user?.email||"";
  if(s && !email.endsWith("@"+CFG.DOMINIO)){ await sb.auth.signOut(); $("#loginMsg").textContent=`Solo pueden entrar correos @${CFG.DOMINIO}.`; return; }
  $("#login").hidden=!!s; $("#app").hidden=!s;
  if(!s){ channel?.unsubscribe(); channel=null; eventos=[]; regs=[]; cortes=[]; eid=null; return; }
  $("#userEmail").textContent=email;
  if(!$("#fRegistrador").value) $("#fRegistrador").value = ls.get("explora.registrador") || "";
  subscribe(); await loadEventos(); $("#fNombre").focus();
}
function boot(){
  fillCarreras(); clearForm(); bindUI();
  if(!window.supabase || !CFG.SUPABASE_URL || /TU-PROYECTO/.test(CFG.SUPABASE_URL)){
    $("#login").hidden=false; $("#loginForm").hidden=true;
    $("#loginMsg").textContent="Falta configurar Supabase: completa SUPABASE_URL y SUPABASE_ANON_KEY en config.js.";
    return;
  }
  sb=window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  let last; // undefined: la primera notificación (con o sin sesión) siempre se procesa
  sb.auth.onAuthStateChange((evt,s)=>{ const id=s?.user?.id||null; if(id===last && evt!=="SIGNED_OUT") return; last=id; setTimeout(()=>onSession(s),0); });
}
boot();
})();
