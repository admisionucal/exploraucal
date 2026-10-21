(() => {
const CFG = window.EXPLORA_CONFIG || {};

/* ================= Catálogos ================= */
const MUNDOS = ["ARQUITECTURA","COMUNICACIONES","DISEÑO","NEGOCIOS","PSICOLOGIA"];
// Para agregar o renombrar carreras, edita esta lista.
const CARRERAS = {
  "Arquitectura":"ARQUITECTURA",
  "Arquitectura de Interiores":"ARQUITECTURA",
  "Diseño Digital de Interiores":"ARQUITECTURA",
  "Comunicación Audiovisual y Cine":"COMUNICACIONES",
  "Comunicación y Marketing Digital":"COMUNICACIONES",
  "Comunicación y Publicidad Transmedia":"COMUNICACIONES",
  "Diseño Gráfico Publicitario":"DISEÑO",
  "Diseño Gráfico y Marketing Digital":"DISEÑO",
  "Administración y Dirección de Empresas":"NEGOCIOS",
  "Administración y Marketing":"NEGOCIOS",
  "Administración y Negocios Internacionales":"NEGOCIOS",
  "Marketing e Innovación":"NEGOCIOS",
  "Ingeniería de Sistemas":"NEGOCIOS",
  "Contabilidad":"NEGOCIOS",
  "Psicología":"PSICOLOGIA"
};
const PADRES = new Set(["Madre","Padre","Familiar"]);
const GRADOS = ["3ero","4to","5to","Ya acabo el colegio"];

/* Columnas que reconoce la importación (se comparan sin tildes, mayúsculas ni signos) */
const COLS_INSCRITOS = [
  {f:"nombre", label:"Nombres y Apellidos", req:true, alias:["nombres y apellidos","nombre y apellido","nombre completo","nombres","nombre","alumno","estudiante"]},
  {f:"celular", label:"Celular", alias:["celular","telefono","movil","whatsapp","numero"]},
  {f:"dni", label:"DNI", alias:["dni","documento","nro documento","numero de documento"]},
  {f:"id_prometeo", label:"ID Prometeo", alias:["id prometeo","prometeo"]},
  {f:"carrera", label:"Carrera", alias:["carrera","carrera de interes"]},
  {f:"mundo", label:"Mundo", alias:["mundo"]},
  {f:"grado", label:"¿En qué grado está?", alias:["en que grado esta","grado"]},
  {f:"egreso", label:"Año egreso de cole", alias:["ano egreso de cole","ano de egreso","ano egreso","egreso"]},
  {f:"cod_modular", label:"Cod Modular", alias:["cod modular","codigo modular"]},
  {f:"colegio", label:"Nombre Colegio", alias:["nombre colegio","colegio","centro educativo"]},
  {f:"distrito", label:"Distrito", alias:["distrito"]},
  {f:"confirmo", label:"¿Confirmó asistencia?", alias:["confirmo asistencia","confirmo"]},
  {f:"registrador", label:"Registrador", hint:"si viene lleno, se carga como que ya llegó", alias:["registrador"]},
  {f:"acomp", label:"¿Quien es? / Nombres y apellidos del acompañante / Celular del acompañante", hint:"también con 2 y 3", alias:[]}
];
const COLS_COLEGIOS = [
  {f:"codigo_modular", label:"CODIGO MODULAR", req:true, alias:["codigo modular","cod modular"]},
  {f:"nombre", label:"CENTRO EDUCATIVO", req:true, alias:["centro educativo","nombre colegio","colegio","institucion educativa"]},
  {f:"departamento", label:"DEPARTAMENTO", alias:["departamento"]},
  {f:"provincia", label:"PROVINCIA", alias:["provincia"]},
  {f:"distrito", label:"DISTRITO", alias:["distrito"]},
  {f:"direccion", label:"DIRECCION CENTRO EDUCATIVO", alias:["direccion centro educativo","direccion"]}
];

/* ================= Utilidades ================= */
const $ = s => document.querySelector(s);
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
const digits = s => String(s ?? "").replace(/\D/g,"");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ls = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };
const codMod = v => { const d=digits(v); return d ? d.padStart(7,"0") : ""; };

function lev(a,b){
  if(a===b) return 0; if(!a.length) return b.length; if(!b.length) return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i), cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    [prev,cur]=[cur,prev];
  }
  return prev[b.length];
}
const sim = (a,b) => { const m=Math.max(a.length,b.length); return m ? 1-lev(a,b)/m : 0; };
/* Parecido de texto 0..1: cada palabra buscada contra la palabra más parecida del nombre */
function textScore(q, target){
  const qn=norm(q), tn=norm(target); if(!qn||!tn) return 0;
  if(tn.includes(qn)) return 1;
  const qt=qn.split(" "), tt=tn.split(" ");
  let tot=0;
  for(const w of qt){
    let best=0;
    for(const t of tt){ const s = t.startsWith(w) ? (w.length>=2?1:.6) : sim(w,t); if(s>best) best=s; if(best===1) break; }
    tot+=best;
  }
  return Math.max(tot/qt.length, sim(qn,tn));
}
/* Parecido de números: contiene → 100%; si no, compara dígito a dígito */
function numScore(qd, val){
  const v=digits(val); if(!qd||!v) return 0;
  if(v.includes(qd)) return 1;
  if(Math.abs(v.length-qd.length)<=1) return sim(qd,v);
  return 0;
}

/* ================= Estado ================= */
let sb=null, session=null, me="", channel=null;
let eventos=[], eid=null, regs=[];
let colegios=[], colByCod=new Map(), distritos=[], colLoaded=false, selDist=null;
let editingId=null, grado=null, acomp=[];
let corteHora="", filtro="asis";

function toast(msg, kind=""){
  const t=$("#toast"); t.textContent=msg; t.className="toast "+kind; t.hidden=false;
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true, 3000);
}
function banner(msg){ const b=$("#banner"); b.textContent=msg||""; b.hidden=!msg; }
const curEvent = () => eventos.find(e=>e.id===eid) || null;
const fmtHora = iso => iso ? new Date(iso).toLocaleTimeString("es-PE",{hour:"numeric",minute:"2-digit"}) : "—";
function fmtHM(hm){ if(!hm) return ""; const [h,m]=hm.split(":").map(Number); const d=new Date(); d.setHours(h,m,0,0); return d.toLocaleTimeString("es-PE",{hour:"numeric",minute:"2-digit"}); }
const nowHM = () => new Date().toTimeString().slice(0,5);
function eventYear(){ const e=curEvent(); return e?.fecha ? Number(e.fecha.slice(0,4)) : new Date().getFullYear(); }
function egresoDe(g){ const y=eventYear(); return g==="5to"?y : g==="4to"?y+1 : g==="3ero"?y+2 : ""; }
const gradoLabel = g => g==="Ya acabo el colegio" ? "Egresado" : (g||"—");
function upsertLocal(list,row,key="id"){ const i=list.findIndex(x=>x[key]===row[key]); if(i>=0) list[i]=row; else list.push(row); }
function dbError(e){
  console.error(e);
  const m=String(e?.message||"");
  if(/row-level security|permission|JWT/i.test(m)) toast("Sin permiso: inicia sesión con tu correo @"+(CFG.DOMINIO||"ucal.edu.pe"),"bad");
  else if(/Failed to fetch|NetworkError/i.test(m)) toast("Sin conexión. Revisa el internet e intenta de nuevo.","bad");
  else if(/distrito|colegios/i.test(m) && /column|relation|does not exist/i.test(m)) toast("Falta actualizar la base: vuelve a correr schema.sql en Supabase.","bad");
  else toast("No se pudo guardar: "+m,"bad");
}

/* ================= Combos (lista desplegable con búsqueda) ================= */
function combo(input, pop, getOptions, onPick){
  let timer=null;
  const render=()=>{
    const groups=getOptions(input.value);
    const html=groups.map(g=>(g.title?`<div class="optgrp">${esc(g.title)}</div>`:"")+g.items.map((o,i)=>`<button type="button" class="opt" data-g="${groups.indexOf(g)}" data-i="${i}"><span>${esc(o.label)}</span>${o.sub?`<small>${esc(o.sub)}</small>`:""}</button>`).join("")).join("");
    pop.innerHTML=html; pop.hidden=!html; pop._groups=groups;
  };
  let hideT=null;
  input.addEventListener("focus",()=>{ clearTimeout(hideT); render(); });
  input.addEventListener("input",()=>{ clearTimeout(hideT); clearTimeout(timer); timer=setTimeout(render,90); });
  input.addEventListener("blur",()=>{ clearTimeout(timer); hideT=setTimeout(()=>pop.hidden=true,160); });
  pop.addEventListener("mousedown",e=>e.preventDefault());
  pop.addEventListener("click",e=>{ const b=e.target.closest(".opt"); if(!b) return; const o=pop._groups[+b.dataset.g].items[+b.dataset.i]; pop.hidden=true; onPick(o); });
  return {render, close(){ pop.hidden=true; }};
}

/* ================= Corte ================= */
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
  const car={}; // por carrera
  for(const r of regs){
    if(!r.asistio) continue;
    if(limit && r.hora && new Date(r.hora) > limit) continue;
    const m = MUNDOS.includes(r.mundo) ? r.mundo : "SIN CARRERA";
    if(r.grado==="Ya acabo el colegio") t.egresados[m]++;
    else if(r.grado==="5to") t.quinto[m]++;
    else if(r.grado==="3ero"||r.grado==="4to") t.nv[m]++;
    else t.singrado[m]++;
    for(const a of (r.acomp||[])){ if(PADRES.has(a.tipo)) t.padres[m]++; else t.otros[m]++; }
    const ck=r.carrera||"Sin carrera";
    const k=car[ck]=car[ck]||{carrera:ck,mundo:CARRERAS[ck]||m,padres:0,otros:0,egresados:0,quinto:0,nv:0,singrado:0};
    if(r.grado==="Ya acabo el colegio") k.egresados++; else if(r.grado==="5to") k.quinto++; else if(r.grado==="3ero"||r.grado==="4to") k.nv++; else k.singrado++;
    for(const a of (r.acomp||[])){ if(PADRES.has(a.tipo)) k.padres++; else k.otros++; }
  }
  const mOrder=m=>{ const i=MUNDOS.indexOf(m); return i<0?99:i; };
  const byCarrera=Object.values(car).map(k=>({...k,total:k.padres+k.otros+k.egresados+k.quinto+k.nv+k.singrado}))
    .sort((a,b)=>mOrder(a.mundo)-mOrder(b.mundo) || b.total-a.total || a.carrera.localeCompare(b.carrera));
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
    padres:sum(t.padres)+sum(t.otros), vend:sum(t.egresados)+sum(t.quinto), nv:sum(t.nv), byMundo:total, byCarrera,
    showOtros:sum(t.otros)>0, showSinGrado:sum(t.singrado)>0};
}
function carreraCols(c){
  return [["total","Total"],["padres","Padres"],...(c.showOtros?[["otros","Otros acomp."]]:[]),["egresados","Alumnos Egresados"],["quinto","Alumnos 5to"],["nv","Alumnos no vendibles"],...(c.showSinGrado?[["singrado","Sin grado"]]:[])];
}
const corteLabel = () => "Corte a las "+(corteHora ? fmtHM(corteHora) : fmtHM(nowHM()));
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
  const cc=carreraCols(c);
  const tot=Object.fromEntries(cc.map(([k])=>[k,c.byCarrera.reduce((a,x)=>a+x[k],0)]));
  $("#carreraTable").innerHTML = c.byCarrera.length
    ? `<thead><tr><th>Mundo</th><th>Carrera</th>${cc.map(([,l])=>`<th>${l}</th>`).join("")}</tr></thead><tbody>${
        c.byCarrera.map((k,i,arr)=>`<tr${i>0&&arr[i-1].mundo!==k.mundo?' class="grpstart"':""}><td class="mundo">${i===0||arr[i-1].mundo!==k.mundo?esc(k.mundo):""}</td><td>${esc(k.carrera)}</td>${cc.map(([f])=>`<td${f==="total"?' class="rowtot"':""}>${k[f]}</td>`).join("")}</tr>`).join("")
      }<tr class="tot"><td colspan="2">Total</td>${cc.map(([f])=>`<td>${tot[f]}</td>`).join("")}</tr></tbody>`
    : `<tbody><tr><td style="color:var(--muted);padding:20px">Aún no hay asistentes en este corte.</td></tr></tbody>`;
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
  if(c.byCarrera.length){
    L.push("", "*Por carrera*");
    for(const k of c.byCarrera) L.push(`• ${k.carrera}: ${k.total} (Padres ${k.padres} · Egres. ${k.egresados} · 5to ${k.quinto} · No vend. ${k.nv})`);
  }
  return L.join("\n");
}
/* ================= Formulario ================= */
function fillMundos(){
  $("#fMundo").innerHTML=`<option value="">Todos los mundos</option>`+MUNDOS.map(m=>`<option>${m}</option>`).join("");
}
function carreraExacta(txt){ const n=norm(txt); return Object.keys(CARRERAS).find(c=>norm(c)===n) || ""; }
function carreraParecida(txt){
  if(!norm(txt)) return "";
  const exact=carreraExacta(txt); if(exact) return exact;
  let best="", bs=0; for(const c of Object.keys(CARRERAS)){ const s=textScore(txt,c); if(s>bs){bs=s;best=c;} }
  return bs>=0.75 ? best : "";
}
function carreraOptions(q){
  const mundo=$("#fMundo").value;
  const list=Object.keys(CARRERAS).filter(c=>!mundo || CARRERAS[c]===mundo);
  const qn=norm(q); const exact=carreraExacta(q);
  if(!qn || exact){
    const byM={}; list.forEach(c=>(byM[CARRERAS[c]]=byM[CARRERAS[c]]||[]).push({label:c,value:c}));
    return MUNDOS.filter(m=>byM[m]).map(m=>({title:m,items:byM[m]}));
  }
  const rank=arr=>arr.map(c=>({label:c,value:c,sub:CARRERAS[c],s:textScore(q,c)})).filter(o=>o.s>=0.45).sort((a,b)=>b.s-a.s);
  const items=rank(list);
  if(items.length) return [{items}];
  const otros=rank(Object.keys(CARRERAS).filter(c=>!list.includes(c)));
  return otros.length?[{title:"En otros mundos",items:otros}]:[];
}
function setCarrera(c){
  $("#fCarrera").value=c||"";
  if(c && CARRERAS[c]) $("#fMundo").value=CARRERAS[c];
}
function setGrado(g){
  grado=g||null;
  document.querySelectorAll("#segGrado button").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.v===grado)));
  // 5to = año del evento, 4to = +1, 3ero = +2, ya acabó = año anterior (editable)
  if(grado) $("#fEgreso").value = grado==="Ya acabo el colegio" ? eventYear()-1 : egresoDe(grado);
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
  ["fNombre","fCel","fDni","fProm","fCole","fCod","fDistrito","fEgreso","fCarrera"].forEach(id=>$("#"+id).value=""); selDist=null;
  $("#fMundo").value=""; setGrado(null); acomp=[]; renderAcomp(); coleHint();
  $("#formTitle").textContent="Nuevo asistente"; $("#formStatus").innerHTML="";
  $("#btnSave").textContent="Registrar llegada";
}
function loadIntoForm(r){
  editingId=r.id;
  $("#fNombre").value=r.nombre||""; $("#fCel").value=r.celular||""; $("#fDni").value=r.dni||""; $("#fProm").value=r.id_prometeo||"";
  $("#fMundo").value=MUNDOS.includes(r.mundo)?r.mundo:""; setCarrera(carreraExacta(r.carrera)||r.carrera||"");
  $("#fCod").value=r.cod_modular||""; $("#fCole").value=r.colegio||""; $("#fDistrito").value=r.distrito||""; selDist=colByCod.get(codMod(r.cod_modular))?._k||null;
  $("#fEgreso").value=r.egreso||""; setGrado(r.grado||null); if(r.egreso) $("#fEgreso").value=r.egreso;
  if(r.cod_modular && !r.colegio) fillFromCod(); coleHint();
  acomp=(r.acomp||[]).map(a=>({...a})); renderAcomp();
  $("#formTitle").textContent = r.asistio ? "Editar asistente" : "Inscrito: revisa sus datos y registra la llegada";
  $("#formStatus").innerHTML = r.asistio ? `<span class="pill ok">Llegó ${fmtHora(r.hora)}</span>` : `<span class="pill pend">Inscrito${r.confirmo==="Si"?" · confirmó":""}</span>`;
  $("#btnSave").textContent = r.asistio ? "Guardar cambios" : "Registrar llegada";
  $("#results").innerHTML=""; $("#q").value="";
  $("#regForm").scrollIntoView({block:"nearest",behavior:"smooth"});
}
async function saveForm(ev){
  ev?.preventDefault();
  if(!eid){ toast("Primero crea o elige un evento","bad"); return; }
  const nombre=$("#fNombre").value.trim(), cel=digits($("#fCel").value), dni=digits($("#fDni").value);
  const carrera=carreraParecida($("#fCarrera").value);
  const miss=[]; if(!nombre) miss.push("nombre"); if(!cel) miss.push("celular"); if(!carrera) miss.push("carrera (elígela de la lista)"); if(!grado) miss.push("grado");
  if(miss.length){ toast("Falta: "+miss.join(", "),"bad"); return; }
  if(!editingId){
    const dup=regs.find(r=>digits(r.celular)===cel || (dni && digits(r.dni)===dni));
    if(dup){ toast(dup.asistio?`${dup.nombre} ya llegó (${fmtHora(dup.hora)}). Revisa sus datos.`:`${dup.nombre} ya estaba inscrito. Revisa y registra.`, dup.asistio?"bad":""); loadIntoForm(dup); return; }
  }
  const prev = editingId ? regs.find(r=>r.id===editingId) : null;
  const data={
    evento_id:eid, nombre, celular:cel, dni, id_prometeo:digits($("#fProm").value),
    carrera, mundo:CARRERAS[carrera], grado, egreso:Number($("#fEgreso").value)||null,
    colegio:$("#fCole").value.trim(), cod_modular:codMod($("#fCod").value), distrito:$("#fDistrito").value.trim(),
    acomp:acomp.filter(a=>a.nombre.trim()||a.celular.trim()).map(a=>({tipo:a.tipo,nombre:a.nombre.trim(),celular:digits(a.celular)})),
    confirmo:prev?.confirmo||"", origen:prev?.origen||"walkin",
    registrador: prev?.asistio ? (prev.registrador||me) : me,
    asistio:true, hora: prev?.asistio ? (prev.hora||new Date().toISOString()) : new Date().toISOString(),
    actualizado:new Date().toISOString()
  };
  $("#btnSave").disabled=true;
  try{
    const q = editingId ? sb.from("registros").update(data).eq("id",editingId) : sb.from("registros").insert(data);
    const {data:row,error}=await q.select().single();
    if(error) throw error;
    upsertLocal(regs,row); renderAll();
    toast(prev?.asistio ? "Cambios guardados" : `Llegada registrada: ${nombre}${data.acomp.length?` + ${data.acomp.length}`:""}`,"ok");
    clearForm(); window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){ dbError(e); }
  finally{ $("#btnSave").disabled=false; }
}

/* ================= Colegios ================= */
function fillFromCod(){
  const c=colByCod.get(codMod($("#fCod").value));
  if(c){ $("#fCole").value=c.nombre; $("#fDistrito").value=c.distrito||""; selDist=c._k; }
  coleHint(); return !!c;
}
function coleHint(){
  const h=$("#coleHint"); if(!h) return;
  const c=colByCod.get(codMod($("#fCod").value));
  if(c) h.innerHTML=`<span class="pill ok">✓ ${esc(c.nombre)}</span> ${esc([c.distrito,c.provincia].filter(Boolean).join(", "))}`;
  else if(!colLoaded) h.textContent="";
  else if(!colegios.length) h.textContent="Sube el padrón de colegios en la pestaña Importar para completar el colegio con el código modular.";
  else if(digits($("#fCod").value).length>=6) h.innerHTML=`<span class="pill warn">Código no encontrado en el padrón</span>`;
  else h.textContent="";
}
function distritoOptions(q){
  if(!distritos.length) return [];
  const qn=norm(q);
  const lima=d=>/^(lima|callao)$/i.test(norm(d.dep))?0:1;
  const items=(qn ? distritos.map(d=>({...d,s:textScore(q,d.label)})).filter(d=>d.s>=0.6).sort((a,b)=>b.s-a.s || lima(a)-lima(b)) : distritos).slice(0,40);
  return items.length?[{items}]:[];
}
function coleOptions(q){
  if(!colegios.length) return [];
  const dist=norm($("#fDistrito").value);
  let pool = selDist ? colegios.filter(c=>c._k===selDist) : dist ? colegios.filter(c=>c._d===dist) : colegios;
  const qn=norm(q);
  if(!qn){ if(!dist) return []; return [{title:`${pool.length} colegios en ${$("#fDistrito").value}`, items:pool.slice(0,60).map(c=>({label:c.nombre,sub:c.codigo_modular,c}))}]; }
  const qd=digits(q);
  let items;
  if(qd.length>=4 && qd.length===qn.replace(/ /g,"").length) items=pool.filter(c=>c.codigo_modular.includes(qd)).map(c=>({c,s:1}));
  else {
    const first=qn.split(" ")[0].slice(0,3);
    const pre = pool.length>4000 ? pool.filter(c=>c._n.includes(first) || sim(first,c._n.slice(0,3))>=.66) : pool;
    items=pre.map(c=>({c,s:textScore(q,c.nombre)})).filter(o=>o.s>=0.6);
  }
  items.sort((a,b)=>b.s-a.s);
  items=items.slice(0,30).map(o=>({label:o.c.nombre, sub:(dist?"":[o.c.distrito,o.c.provincia].filter(Boolean).join(", ")+" · ")+o.c.codigo_modular, c:o.c}));
  return items.length?[{items}]:[];
}
function setColegios(rows){
  colegios=rows.map(c=>({...c,_n:norm(c.nombre),_d:norm(c.distrito),_k:norm(c.distrito)+"|"+norm(c.provincia)}));
  colByCod=new Map(colegios.map(c=>[c.codigo_modular,c]));
  const m=new Map(); for(const c of colegios){ if(!c.distrito) continue; if(!m.has(c._k)) m.set(c._k,{label:c.distrito,key:c._k,dep:c.departamento||"",sub:[c.provincia,c.departamento].filter(Boolean).join(", "),n:0}); m.get(c._k).n++; }
  const lima=d=>/^(lima|callao)$/i.test(norm(d.dep))?0:1;   // Lima y Callao primero
  distritos=[...m.values()].map(d=>({...d,sub:`${d.sub} · ${d.n} colegios`})).sort((a,b)=>lima(a)-lima(b) || a.label.localeCompare(b.label));
  colLoaded=true;
  $("#colCount").textContent = colegios.length ? `Padrón actual: ${colegios.length.toLocaleString("es-PE")} colegios` : "Todavía no hay colegios cargados";
  coleHint();
}
async function loadColegios(){
  try{
    const out=[]; const size=1000;
    for(let from=0;;from+=size){
      const {data,error}=await sb.from("colegios").select("codigo_modular,nombre,departamento,provincia,distrito").order("codigo_modular").range(from,from+size-1);
      if(error) throw error; out.push(...data); if(data.length<size) break;
    }
    setColegios(out);
  }catch(e){ console.error(e); colLoaded=true; $("#colCount").textContent="No se pudo leer el padrón. ¿Corriste el schema.sql actualizado?"; }
}

/* ================= Búsqueda de inscritos ================= */
function search(q){
  const qn=norm(q), qd=digits(q);
  if(!qn) return [];
  const isNum = qd.length>=3 && !/[a-z]/.test(qn);
  return regs.map(r=>{
    const s = isNum ? Math.max(numScore(qd,r.celular),numScore(qd,r.dni),numScore(qd,r.id_prometeo)) : textScore(q,r.nombre);
    return {r,s};
  }).filter(o=>o.s>=(isNum?0.7:0.6)).sort((a,b)=>b.s-a.s || (a.r.asistio-b.r.asistio)).slice(0,8);
}
function renderResults(){
  const q=$("#q").value; const res=search(q);
  if(!q.trim()){ $("#results").innerHTML=""; return; }
  if(!res.length){ $("#results").innerHTML=`<div class="res" style="cursor:default"><span>No se encontró a nadie parecido. Llena el formulario como nuevo asistente.</span><button type="button" class="btn sm" id="btnUseQ">Usar como nombre</button></div>`; return; }
  $("#results").innerHTML=res.map(({r,s})=>`<button type="button" class="res" data-id="${esc(r.id)}">
    <div><b>${esc(r.nombre)}</b><div class="sub num">${esc(r.celular||"")}${r.dni?" · DNI "+esc(r.dni):""}${r.carrera?" · "+esc(r.carrera):""}</div></div>
    <div style="display:flex;gap:8px;align-items:center"><span class="pct num">${Math.round(s*100)}%</span>${r.asistio?`<span class="pill ok">Ya llegó ${fmtHora(r.hora)}</span>`:r.confirmo==="Si"?`<span class="pill blue">Confirmó</span>`:`<span class="pill pend">Inscrito</span>`}</div></button>`).join("");
}

/* ================= Lista ================= */
function renderLista(){
  if(!eid){ $("#listaTable").innerHTML=""; return; }
  const q=$("#qLista").value;
  let rows=regs.filter(r=> filtro==="all" ? true : filtro==="asis" ? r.asistio : !r.asistio);
  if(norm(q)){ const qd=digits(q); rows=rows.filter(r=> textScore(q,[r.nombre,r.carrera,r.mundo,r.colegio,r.distrito].join(" "))>=0.75 || (qd.length>=3 && (digits(r.celular).includes(qd)||digits(r.dni).includes(qd)))); }
  rows.sort((a,b)=> filtro==="asis" ? String(b.hora||"").localeCompare(String(a.hora||"")) : String(a.nombre).localeCompare(b.nombre));
  if(!rows.length){ $("#listaTable").innerHTML=`<tbody><tr><td style="text-align:center;color:var(--muted);padding:24px">${regs.length?"No hay personas con este filtro.":"Todavía no hay registros en este evento. Registra la primera llegada o importa la lista de inscritos."}</td></tr></tbody>`; return; }
  $("#listaTable").innerHTML=`<thead><tr><th>Llegada</th><th>Nombres y apellidos</th><th>Celular</th><th>Carrera</th><th>Mundo</th><th>Grado</th><th>Colegio</th><th>Acompañantes</th><th>Registrador</th><th></th></tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td>${r.asistio?`<span class="pill ok">${fmtHora(r.hora)}</span>`:`<span class="pill pend">${r.confirmo==="Si"?"Confirmó":"Pendiente"}</span>`}</td>
      <td class="wrap">${esc(r.nombre)}</td><td class="num">${esc(r.celular)}</td><td>${esc(r.carrera||"—")}</td><td>${esc(r.mundo||"—")}</td>
      <td>${r.grado==="3ero"||r.grado==="4to"?`<span class="pill warn">${esc(r.grado)}</span>`:esc(gradoLabel(r.grado))}</td>
      <td class="wrap">${esc(r.colegio||"—")}${r.distrito?`<div class="hint">${esc(r.distrito)}</div>`:""}</td>
      <td class="wrap">${(r.acomp||[]).map(a=>esc(a.tipo)+(a.nombre?": "+esc(a.nombre):"")).join("<br>")||"—"}</td>
      <td>${esc(r.registrador||"—")}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn sm ${r.asistio?"":"primary"}" data-edit="${esc(r.id)}">${r.asistio?"Editar":"Registrar llegada"}</button>
        ${r.asistio?`<button class="btn sm ghost" data-unmark="${esc(r.id)}">Quitar llegada</button>`:""}
        <button class="btn sm danger" data-del="${esc(r.id)}">Eliminar</button></div></td></tr>`).join("")
  }</tbody>`;
}

/* ================= Eventos y datos ================= */
function renderEventos(){
  const sorted=[...eventos].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  $("#evSelect").innerHTML = sorted.length ? sorted.map(e=>`<option value="${esc(e.id)}" ${e.id===eid?"selected":""}>${esc(e.nombre)}</option>`).join("") : `<option value="">Sin eventos</option>`;
  const e=curEvent(); $("#evTitle").textContent = e ? e.nombre : "Registro de asistentes";
}
function renderAll(){ renderEventos(); renderLive(); renderResults(); renderLista(); renderCorte(); }
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
  regs=[]; clearForm(); renderAll();
  if(!id) return;
  try{
    const r=await fetchAll("registros",id);
    if(eid!==id) return;
    regs=r; renderAll();
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
    .on("postgres_changes",{event:"*",schema:"public",table:"eventos"},p=>{
      if(p.eventType==="DELETE") eventos=eventos.filter(e=>e.id!==p.old.id); else upsertLocal(eventos,p.new);
      renderEventos();
    })
    .subscribe(status=>{
      $("#syncDot").dataset.on = status==="SUBSCRIBED" ? "1" : "0";
      $("#syncDot").title = status==="SUBSCRIBED" ? "Conectado en tiempo real" : "Reconectando…";
    });
}

/* ================= Importar ================= */
function renderColsHelp(){
  const li=c=>`<li><b>${esc(c.label)}</b>${c.hint?` <small>(${esc(c.hint)})</small>`:""}</li>`;
  $("#colsReqIns").innerHTML=COLS_INSCRITOS.filter(c=>c.req).map(li).join("");
  $("#colsOptIns").innerHTML=COLS_INSCRITOS.filter(c=>!c.req).map(li).join("");
  $("#colsReqCol").innerHTML=COLS_COLEGIOS.filter(c=>c.req).map(li).join("");
  $("#colsOptCol").innerHTML=COLS_COLEGIOS.filter(c=>!c.req).map(li).join("");
}
/* Lee la hoja que mejor coincide con las columnas obligatorias y devuelve {rows, map, unknown} */
async function readSheet(file, spec){
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
  let best=null;
  for(const name of wb.SheetNames){
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:"",raw:false});
    // la fila de encabezados puede no ser la primera: busca en las 10 primeras
    for(let h=0;h<Math.min(10,aoa.length);h++){
      const heads=aoa[h].map(x=>norm(x));
      const map={}; spec.forEach(c=>{ const i=heads.findIndex(x=>x && c.alias.includes(x)); if(i>=0) map[c.f]=i; });
      const hits=spec.filter(c=>c.req && map[c.f]!=null).length + Object.keys(map).length/100;
      if(!best || hits>best.hits) best={hits,name,h,heads,map,aoa};
    }
  }
  const missing=spec.filter(c=>c.req && best.map[c.f]==null).map(c=>c.label);
  const used=new Set(Object.values(best.map));
  return {...best, missing, rows:best.aoa.slice(best.h+1).filter(r=>r.some(v=>String(v).trim()!=="")), used};
}
function setStatus(el, html){ el.innerHTML=html; }
async function importInscritos(file){
  const st=$("#stIns");
  if(!eid){ setStatus(st,`<span class="bad">Primero crea o elige el evento arriba.</span>`); return; }
  let sh; try{ sh=await readSheet(file, COLS_INSCRITOS); }catch(e){ setStatus(st,`<span class="bad">No se pudo leer el archivo. ¿Es un Excel o CSV?</span>`); return; }
  if(sh.missing.length){ setStatus(st,`<span class="bad">Falta la columna obligatoria: ${esc(sh.missing.join(", "))}.</span><span class="hint">Columnas encontradas: ${esc(sh.aoa[sh.h].filter(Boolean).join(" · "))}</span>`); return; }
  // acompañantes: "¿Quien es? 2", "Nombres y apellidos del acompañante 2", "Celular del acompañante 2"
  const acIdx={}; sh.heads.forEach((h,i)=>{ if(/^tiene acompanante( \d)?$/.test(h)) sh.used.add(i); const m=h.match(/^(quien es|nombres y apellidos del acompanante|nombre del acompanante|celular del acompanante)(?: (\d))?$/); if(m){ const k=Number(m[2]||1); acIdx[k]=acIdx[k]||{}; acIdx[k][m[1].startsWith("quien")?"tipo":m[1].startsWith("celular")?"celular":"nombre"]=i; sh.used.add(i);} });
  const get=(r,f)=>sh.map[f]!=null ? String(r[sh.map[f]]??"").trim() : "";
  const recs=sh.rows.map(r=>{
    const carrera=carreraParecida(get(r,"carrera")) || get(r,"carrera");
    const mundoTxt=norm(get(r,"mundo")).toUpperCase(); const mundo=CARRERAS[carrera] || MUNDOS.find(m=>norm(m).toUpperCase()===mundoTxt) || "";
    const acompArr=Object.keys(acIdx).sort().map(k=>acIdx[k]).map(a=>({tipo:a.tipo!=null?String(r[a.tipo]).trim():"",nombre:a.nombre!=null?String(r[a.nombre]).trim():"",celular:a.celular!=null?digits(r[a.celular]):""})).filter(a=>a.nombre||a.tipo).map(a=>({...a,tipo:["Madre","Padre","Familiar","Estudiante"].find(t=>norm(t)===norm(a.tipo))||"Familiar"}));
    const regis=get(r,"registrador"); const cod=codMod(get(r,"cod_modular")); const col=colByCod.get(cod);
    const g=norm(get(r,"grado"));
    return {
      evento_id:eid, nombre:get(r,"nombre"), celular:digits(get(r,"celular")), dni:digits(get(r,"dni")), id_prometeo:digits(get(r,"id_prometeo")),
      carrera, mundo, grado: !g?"": g.startsWith("ya")||g.includes("egres")?"Ya acabo el colegio": g.startsWith("5")?"5to": g.startsWith("4")?"4to": g.startsWith("3")?"3ero": get(r,"grado"),
      egreso:Number(digits(get(r,"egreso")))||null, cod_modular:cod, colegio:get(r,"colegio")||col?.nombre||"", distrito:get(r,"distrito")||col?.distrito||"",
      confirmo: norm(get(r,"confirmo"))==="si"?"Si":(get(r,"confirmo")?"No":""), registrador:regis, acomp:acompArr,
      asistio:!!regis, hora:null, origen:"import"
    };
  }).filter(r=>r.nombre);
  // Misma persona = mismo celular o DNI y nombre parecido. Se combinan en un solo registro.
  const FIELDS=["celular","dni","id_prometeo","carrera","mundo","grado","egreso","cod_modular","colegio","distrito","confirmo"];
  const keysOf=r=>[r.celular&&"c"+r.celular, r.dni&&"d"+r.dni].filter(Boolean);
  const samePerson=(a,b)=>Math.max(textScore(a.nombre,b.nombre),textScore(b.nombre,a.nombre))>=0.6;
  const index=new Map(); const addIdx=r=>keysOf(r).forEach(k=>{ if(!index.has(k)) index.set(k,[]); index.get(k).push(r); });
  regs.forEach(addIdx);
  const nuevos=[], cambiados=new Set(); let combinados=0;
  for(const r of recs){
    const match=keysOf(r).flatMap(k=>index.get(k)||[]).find(x=>samePerson(x,r));
    if(!match){ nuevos.push(r); addIdx(r); continue; }
    combinados++;
    const fuente = r.asistio && !match.asistio;   // la fila del registrador manda
    for(const f of FIELDS){ if(r[f] && (!match[f] || fuente)) match[f]=r[f]; }
    if(String(r.nombre).length>String(match.nombre).length) match.nombre=r.nombre;
    if((r.acomp||[]).length>(match.acomp||[]).length) match.acomp=r.acomp;
    if(r.asistio){ match.asistio=true; match.registrador=match.registrador||r.registrador; }
    addIdx(match);
    if(match.id) cambiados.add(match);
  }
  const ignored=sh.aoa[sh.h].filter((h,i)=>String(h).trim() && !sh.used.has(i));
  const total=nuevos.length+cambiados.size;
  setStatus(st,`<span>Hoja "${esc(sh.name)}": ${recs.length} filas → ${nuevos.length} personas nuevas${cambiados.size?` y ${cambiados.size} ya existentes por actualizar`:""}. Cargando…</span><div class="progress"><div></div></div>`);
  let ok=0, upd=0;
  const prog=()=>st.querySelector(".progress div").style.width=((ok+upd)/Math.max(1,total)*100)+"%";
  for(let i=0;i<nuevos.length;i+=200){
    const {data,error}=await sb.from("registros").insert(nuevos.slice(i,i+200)).select();
    if(error){ dbError(error); break; }
    data.forEach(r=>upsertLocal(regs,r)); ok+=data.length; prog();
  }
  for(const m of cambiados){
    const {id,creado_en,usuario,...body}=m;
    const {data,error}=await sb.from("registros").update(body).eq("id",id).select().single();
    if(error){ dbError(error); break; }
    upsertLocal(regs,data); upd++; prog();
  }
  renderAll();
  setStatus(st,`<span class="ok">Listo: ${ok} inscritos cargados en "${esc(curEvent()?.nombre||"")}"${upd?` y ${upd} actualizados`:""}.</span>${combinados?`<span>${combinados} filas eran la misma persona (mismo celular o DNI y nombre parecido) y se combinaron en un solo registro.</span>`:""}<span class="hint">Columnas usadas: ${esc(Object.keys(sh.map).map(f=>COLS_INSCRITOS.find(c=>c.f===f).label).join(" · "))}${Object.keys(acIdx).length?" · acompañantes":""}${ignored.length?` — no usadas: ${esc(ignored.join(" · "))}`:""}</span>`);
  toast(`${ok} inscritos cargados`,"ok");
}
async function importColegios(file){
  const st=$("#stCol");
  let sh; try{ sh=await readSheet(file, COLS_COLEGIOS); }catch(e){ setStatus(st,`<span class="bad">No se pudo leer el archivo. ¿Es un Excel o CSV?</span>`); return; }
  if(sh.missing.length){ setStatus(st,`<span class="bad">Falta la columna obligatoria: ${esc(sh.missing.join(", "))}.</span><span class="hint">Columnas encontradas: ${esc(sh.aoa[sh.h].filter(Boolean).join(" · "))}</span>`); return; }
  const get=(r,f)=>sh.map[f]!=null ? String(r[sh.map[f]]??"").replace(/\s+/g," ").trim() : "";
  const byCod=new Map();
  for(const r of sh.rows){ const cod=codMod(get(r,"codigo_modular")); const nombre=get(r,"nombre"); if(!cod||!nombre) continue;
    byCod.set(cod,{codigo_modular:cod,nombre,departamento:get(r,"departamento"),provincia:get(r,"provincia"),distrito:get(r,"distrito"),direccion:get(r,"direccion")}); }
  const list=[...byCod.values()];
  setStatus(st,`<span>Hoja "${esc(sh.name)}": ${list.length} colegios. Subiendo…</span><div class="progress"><div></div></div>`);
  let ok=0;
  for(let i=0;i<list.length;i+=500){
    const {error}=await sb.from("colegios").upsert(list.slice(i,i+500),{onConflict:"codigo_modular"});
    if(error){ dbError(error); break; }
    ok+=Math.min(500,list.length-i); st.querySelector(".progress div").style.width=(ok/list.length*100)+"%";
  }
  await loadColegios();
  setStatus(st,`<span class="ok">Listo: ${ok.toLocaleString("es-PE")} colegios guardados.</span><span class="hint">Ya puedes completar el colegio con el código modular o buscarlo por distrito.</span>`);
  toast("Padrón de colegios actualizado","ok");
}

/* ================= Exportar ================= */
function regsSheet(){
  const H=["Registrador","ID Prometeo","Nombres y Apellidos","DNI","Celular","Carrera","Mundo","¿Confirmó asistencia?","Cod Modular","Nombre Colegio","¿En qué grado está?","Año egreso de cole"];
  for(const s of [""," 2"," 3"]) H.push("¿Tiene acompañante?"+s,"¿Quien es?"+s,"Nombres y apellidos del acompañante"+s,"Celular del acompañante"+s);
  H.push("Distrito colegio","Asistió","Hora de llegada");
  const num=v=>v&&/^\d+$/.test(v)&&!/^0/.test(v)?Number(v):(v||"");
  const data=[...regs].sort((a,b)=>String(a.nombre).localeCompare(b.nombre)).map(r=>{
    const row=[r.asistio?r.registrador:"",num(r.id_prometeo),r.nombre,num(r.dni),num(r.celular),r.carrera,r.mundo,r.confirmo||"",r.cod_modular||"",r.colegio,r.grado,r.egreso||""];
    for(let i=0;i<3;i++){ const a=(r.acomp||[])[i]; row.push(a?"Si":"",a?a.tipo:"",a?a.nombre:"",a?num(a.celular):""); }
    row.push(r.distrito||"", r.asistio?"Si":"No", r.hora?new Date(r.hora).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit",hour12:false}):"");
    return row;
  });
  const ws=XLSX.utils.aoa_to_sheet([H,...data]); ws["!cols"]=H.map((h,i)=>({wch:i===2||i===9?32:16})); return ws;
}
function corteSheet(){
  const ev=curEvent(); const c=computeCorte(corteLimit()); const cc=carreraCols(c);
  const aoa=[[`Total asistentes - ${corteLabel()}`],[],[ev?.nombre||"Evento",...c.cols,"TOTAL"],...c.rows.map(r=>[r.label,...c.cols.map(m=>r.v[m]),r.sum]),[],
    ["Por carrera"],["Mundo","Carrera",...cc.map(([,l])=>l)],...c.byCarrera.map(k=>[k.mundo,k.carrera,...cc.map(([f])=>k[f])]),
    ["Total","",...cc.map(([f])=>c.byCarrera.reduce((a,x)=>a+x[f],0))],[],
    ["* Alumnos egresados: ya acabaron el colegio."],["* No vendibles: 3ero o 4to de secundaria."],["* Padres: acompañantes registrados como madre, padre o familiar."]];
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws["!cols"]=[{wch:38},{wch:40},...cc.map(()=>({wch:18}))]; return ws;
}
function exportXlsx(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, corteSheet(), "Corte");
  XLSX.utils.book_append_sheet(wb, regsSheet(), "Registros");
  const name=(curEvent()?.nombre||"evento").replace(/[^\w.\- ]+/g,"").trim()||"evento";
  XLSX.writeFile(wb, `${name}.xlsx`);
}

/* ================= Interfaz ================= */
function showTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", String(t.dataset.tab===name)));
  ["registro","corte","lista","importar"].forEach(v=>$("#v-"+v).hidden = v!==name);
  if(name==="corte") renderCorte(); if(name==="lista") renderLista();
}
function bindUI(){
  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>showTab(t.dataset.tab)));
  document.addEventListener("click",e=>{ const g=e.target.closest("[data-goto]"); if(g) showTab(g.dataset.goto); });

  // búsqueda
  let qt=null;
  $("#q").addEventListener("input",()=>{ clearTimeout(qt); qt=setTimeout(renderResults,120); });
  $("#q").addEventListener("keydown",e=>{ if(e.key==="Enter") e.preventDefault(); });
  $("#results").addEventListener("click",e=>{
    if(e.target.closest("#btnUseQ")){ const v=$("#q").value.trim(); clearForm(); if(!/[a-z]/i.test(v) && digits(v).length>=7) $("#fCel").value=digits(v); else $("#fNombre").value=v; $("#q").value=""; renderResults(); return; }
    const b=e.target.closest("[data-id]"); if(b){ const r=regs.find(x=>x.id===b.dataset.id); if(r) loadIntoForm(r); }
  });

  // mundo ↔ carrera
  const cCar=combo($("#fCarrera"),$("#popCarrera"),carreraOptions,o=>setCarrera(o.value));
  $("#fCarrera").addEventListener("change",()=>{ const c=carreraParecida($("#fCarrera").value); if(c) setCarrera(c); });
  $("#fMundo").addEventListener("change",()=>{ const c=carreraExacta($("#fCarrera").value); if(c && CARRERAS[c]!==$("#fMundo").value && $("#fMundo").value) $("#fCarrera").value=""; $("#fCarrera").focus(); });

  // colegio
  $("#fDistrito").addEventListener("input",()=>{ selDist=null; });
  combo($("#fDistrito"),$("#popDistrito"),distritoOptions,o=>{ $("#fDistrito").value=o.label; selDist=o.key; const c=colByCod.get(codMod($("#fCod").value)); if(c && c._k!==o.key){ $("#fCod").value=""; $("#fCole").value=""; coleHint(); } $("#fCole").focus(); });
  combo($("#fCole"),$("#popCole"),coleOptions,o=>{ $("#fCole").value=o.c.nombre; $("#fCod").value=o.c.codigo_modular; $("#fDistrito").value=o.c.distrito||""; selDist=o.c._k; coleHint(); });
  $("#fCod").addEventListener("input",()=>{ if(digits($("#fCod").value).length>=6) fillFromCod(); else coleHint(); });

  $("#segGrado").addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) setGrado(b.dataset.v); });
  $("#addAcomp").addEventListener("click",e=>{ const b=e.target.closest("[data-t]"); if(!b||acomp.length>=3) return; acomp.push({tipo:b.dataset.t,nombre:"",celular:""}); renderAcomp(); $(`#acompList [data-i="${acomp.length-1}"][data-k="nombre"]`)?.focus(); });
  const accSync=e=>{ const el=e.target; if(el.dataset.i!=null) acomp[+el.dataset.i][el.dataset.k]=el.value; };
  $("#acompList").addEventListener("input",accSync); $("#acompList").addEventListener("change",accSync);
  $("#acompList").addEventListener("click",e=>{ const b=e.target.closest("[data-rm]"); if(b){ acomp.splice(+b.dataset.rm,1); renderAcomp(); } });
  $("#btnClear").addEventListener("click",clearForm);
  $("#regForm").addEventListener("submit",saveForm);
  $("#regForm").addEventListener("keydown",e=>{ if(e.key==="Enter" && e.target.tagName==="INPUT") e.preventDefault(); });

  // eventos
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

  // corte
  $("#corteHora").addEventListener("change",e=>{ corteHora=e.target.value; renderCorte(); });
  $("#btnAhora").addEventListener("click",()=>{ corteHora=""; renderCorte(); });
  $("#btnCopy").addEventListener("click",()=>{
    const txt=corteText();
    navigator.clipboard.writeText(txt).then(()=>toast("Corte copiado. Pégalo en WhatsApp.","ok")).catch(()=>{
      const ta=document.createElement("textarea"); ta.value=txt; ta.style.cssText="width:100%;height:220px"; $("#carreraWrap").after(ta); ta.select(); toast("Copia el texto seleccionado");
    });
  });
  $("#btnExportCorte").addEventListener("click",exportXlsx);
  $("#btnExportAll").addEventListener("click",exportXlsx);

  // lista
  $("#segFiltro").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; filtro=b.dataset.v; document.querySelectorAll("#segFiltro button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); renderLista(); });
  $("#qLista").addEventListener("input",renderLista);
  let pendingDel=null;
  $("#listaTable").addEventListener("click",async e=>{
    const ed=e.target.closest("[data-edit]"), un=e.target.closest("[data-unmark]"), del=e.target.closest("[data-del]");
    if(ed){ const r=regs.find(x=>x.id===ed.dataset.edit); if(r){ showTab("registro"); loadIntoForm(r); } }
    if(un){ const {data,error}=await sb.from("registros").update({asistio:false,hora:null}).eq("id",un.dataset.unmark).select().single();
      if(error) return dbError(error); upsertLocal(regs,data); renderAll(); toast("Llegada quitada"); }
    if(del){
      if(pendingDel!==del.dataset.del){ pendingDel=del.dataset.del; del.textContent="¿Seguro? Clic otra vez"; setTimeout(()=>{ if(pendingDel===del.dataset.del){ pendingDel=null; del.textContent="Eliminar"; } },3000); return; }
      pendingDel=null; const id=del.dataset.del;
      const {error}=await sb.from("registros").delete().eq("id",id); if(error) return dbError(error);
      regs=regs.filter(r=>r.id!==id); renderAll(); toast("Registro eliminado");
    }
  });

  // importar
  document.querySelectorAll(".drop").forEach(drop=>{
    const run=f=> drop.dataset.kind==="colegios" ? importColegios(f) : importInscritos(f);
    ["dragenter","dragover"].forEach(t=>drop.addEventListener(t,e=>{ e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{ e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop",e=>{ const f=e.dataTransfer.files[0]; if(f) run(f); });
    drop.querySelector("input[type=file]").addEventListener("change",e=>{ const f=e.target.files[0]; if(f) run(f); e.target.value=""; });
  });

  // login
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

/* ================= Arranque ================= */
async function onSession(s){
  session=s;
  const email=s?.user?.email||"";
  if(s && !email.endsWith("@"+CFG.DOMINIO)){ await sb.auth.signOut(); $("#loginMsg").textContent=`Solo pueden entrar correos @${CFG.DOMINIO}.`; return; }
  $("#login").hidden=!!s; $("#app").hidden=!s;
  if(!s){ channel?.unsubscribe(); channel=null; eventos=[]; regs=[]; eid=null; return; }
  me = s.user.user_metadata?.name || email.split("@")[0];
  $("#userName").textContent=me;
  subscribe(); loadColegios(); await loadEventos();
}
function boot(){
  fillMundos(); renderColsHelp(); clearForm(); bindUI();
  if(!window.supabase || !CFG.SUPABASE_URL || /TU-PROYECTO/.test(CFG.SUPABASE_URL)){
    $("#login").hidden=false; $("#loginForm").hidden=true;
    $("#loginMsg").textContent="Falta configurar Supabase: completa SUPABASE_URL y SUPABASE_ANON_KEY en config.js.";
    return;
  }
  sb=window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  let last; // la primera notificación (con o sin sesión) siempre se procesa
  sb.auth.onAuthStateChange((evt,s)=>{ const id=s?.user?.id||null; if(id===last && evt!=="SIGNED_OUT") return; last=id; setTimeout(()=>onSession(s),0); });
}
boot();
})();
