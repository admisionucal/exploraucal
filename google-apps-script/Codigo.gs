/**
 * Búsqueda en la base Prometeo para la página Registro Explora UCAL.
 *
 * Se pega en la hoja de Google Sheets: Extensiones → Apps Script.
 * La hoja NO se comparte ni se publica. Este script:
 *   - solo responde si la consulta trae una sesión válida de la página
 *     (la verifica con Supabase) y el correo es @ucal.edu.pe;
 *   - devuelve como máximo 8 coincidencias por búsqueda, nunca la hoja completa;
 *   - busca por ID PROMETEO, NOMBRES, NUMERO DE DOCUMENTO y en todas las columnas de teléfono
 *     (Telefono 1, Telefono 2 y las de padre/madre/familiar si existen);
 *   - devuelve ID, asesor (ASESOR ULT TIP DF SN CONTC) y SUBCANAL 2 (si existe);
 *   - pide al menos 3 dígitos o 4 letras;
 *   - limita a 40 búsquedas por minuto por usuario.
 */

// ====== CONFIGURACIÓN (copia los mismos datos de config.js) ======
const SUPABASE_URL      = 'https://ixvvwaadxfpssgekyjjx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wFOiAOr24jMrzHbspmJN3w_5Azizzbk';
const DOMINIO           = 'ucal.edu.pe';
const NOMBRE_HOJA       = '';   // vacío = primera pestaña; o escribe el nombre exacto de la pestaña
const MAX_RESULTADOS    = 8;
const MAX_POR_MINUTO    = 40;

// Nombres de columna aceptados (sin tildes ni mayúsculas)
const COLUMNAS = {
  id:      ['id prometeo', 'id', 'prometeo', 'codigo prometeo', 'id_prometeo'],
  nombre:  ['nombres', 'nombre', 'nombres y apellidos', 'nombre completo', 'alumno', 'prospecto', 'lead'],
  dni:     ['numero de documento', 'nro de documento', 'nro documento', 'documento', 'dni', 'numero documento'],
  asesor:  ['asesor ult tip df sn contc', 'asesor', 'asesora', 'asesor comercial', 'ejecutivo', 'ejecutiva', 'promotor', 'vendedor', 'responsable', 'asesor asignado'],
  subcanal:['subcanal 2', 'subcanal2', 'sub canal 2']   // opcional: si no existe, se devuelve vacío
};
// Teléfonos: se busca en TODAS las columnas cuyo nombre contenga telefono / celular / movil / whatsapp
// (Telefono 1, Telefono 2, Celular Madre, Telefono Padre, Celular Apoderado…)
const RE_TELEFONO = /(telefono|celular|movil|whatsapp)/;
const RE_FAMILIAR = /(padre|madre|apoderad|familiar|tutor|acompanante)/;

// ====== Punto de entrada ======
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const email = validarSesion_(body.token);
    if (!email) return json_({ ok: false, error: 'sesión no válida' });
    if (!dentroDelLimite_(email)) return json_({ ok: false, error: 'demasiadas búsquedas, espera un minuto' });

    const field = String(body.field || '');
    const q = String(body.q || '').trim();
    const qd = q.replace(/\D/g, '');
    if (field === 'nombre' ? norm_(q).length < 4 : qd.length < 3) return json_({ ok: true, items: [] });

    return json_({ ok: true, items: buscar_(field, q, qd) });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'error en la búsqueda' });
  }
}

function doGet() {
  return json_({ ok: false, error: 'usa la página de registro' });
}

// ====== Seguridad ======
function validarSesion_(token) {
  if (!token || token.length < 20) return null;
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const cached = cache.get(key);
  if (cached) return cached;
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return null;
  const user = JSON.parse(res.getContentText());
  const email = String(user.email || '').toLowerCase();
  if (!email.endsWith('@' + DOMINIO)) return null;
  cache.put(key, email, 600); // 10 minutos
  return email;
}

function dentroDelLimite_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'rate_' + email + '_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  return n <= MAX_POR_MINUTO;
}

// ====== Búsqueda ======
function buscar_(field, q, qd) {
  const sh = NOMBRE_HOJA ? SpreadsheetApp.getActive().getSheetByName(NOMBRE_HOJA) : SpreadsheetApp.getActive().getSheets()[0];
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  const heads = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(norm_);
  const col = {};
  Object.keys(COLUMNAS).forEach(k => {
    for (const alias of COLUMNAS[k]) { const i = heads.indexOf(alias); if (i >= 0) { col[k] = i + 1; break; } }
  });
  const telCols = heads.map((h, i) => RE_TELEFONO.test(h) ? i + 1 : 0).filter(Boolean);
  const headsTxt = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  if (!col.id) throw new Error('No se encontró la columna ID Prometeo');

  const n = lastRow - 1;
  const leer = c => c ? sh.getRange(2, c, n, 1).getDisplayValues().map(r => r[0]) : null;
  let scored = [];

  if (field === 'prom') {
    const ids = leer(col.id);
    ids.forEach((v, i) => { const d = String(v).replace(/\D/g, ''); if (d && d.indexOf(qd) >= 0) scored.push({ i, s: d === qd ? 1 : 0.9 }); });
  } else if (field === 'dni') {
    if (!col.dni) return [];
    const docs = leer(col.dni).map(v => String(v).replace(/\D/g, ''));
    docs.forEach((v, i) => { if (v && v.indexOf(qd) >= 0) scored.push({ i, s: v === qd ? 1 : 0.9 }); });
  } else if (field === 'cel') {
    if (!telCols.length) return [];
    const best = {};   // fila -> {s, c}
    const anota = (i, s, c) => { if (!best[i] || s > best[i].s || (s === best[i].s && RE_FAMILIAR.test(heads[best[i].c - 1]) && !RE_FAMILIAR.test(heads[c - 1]))) best[i] = { s, c }; };
    telCols.forEach(c => {
      const cels = leer(c).map(v => String(v).replace(/\D/g, ''));
      cels.forEach((v, i) => { if (v && v.indexOf(qd) >= 0) anota(i, 1, c); });                    // rápido: contiene
    });
    if (!Object.keys(best).length && qd.length >= 7) {                                              // si no hay, aproximado
      telCols.forEach(c => leer(c).forEach((v, i) => { const s = numScore_(qd, v); if (s >= 0.8) anota(i, s, c); }));
    }
    scored = Object.keys(best).map(i => ({ i: Number(i), s: best[i].s, c: best[i].c }));
  } else {
    if (!col.nombre) return [];
    const noms = leer(col.nombre);
    const qn = norm_(q), first = qn.split(' ')[0].slice(0, 3);
    noms.forEach((v, i) => {
      const t = norm_(v); if (!t) return;
      if (t.indexOf(first) < 0 && sim_(first, t.slice(0, 3)) < 0.66) return; // filtro rápido
      const s = textScore_(qn, t); if (s >= 0.7) scored.push({ i, s });
    });
  }

  scored.sort((a, b) => b.s - a.s);
  scored = scored.slice(0, MAX_RESULTADOS);
  return scored.map(o => {
    const row = sh.getRange(o.i + 2, 1, 1, lastCol).getDisplayValues()[0];
    const g = c => c ? String(row[c - 1]).trim() : '';
    // celular del alumno: columnas de teléfono que NO son de padres; prefiere uno que empiece con 9
    const propias = telCols.filter(c => !RE_FAMILIAR.test(heads[c - 1])).map(c => g(c).replace(/\D/g, '').slice(-9)).filter(Boolean);
    const viaFamiliar = field === 'cel' && o.c && RE_FAMILIAR.test(heads[o.c - 1]);
    const tel = (field === 'cel' && !viaFamiliar && propias.find(t => t.indexOf(qd) >= 0)) || propias.find(t => /^9\d{8}$/.test(t)) || propias[0] || '';
    return {
      id: g(col.id).replace(/\D/g, ''), nombre: g(col.nombre), celular: tel, dni: g(col.dni).replace(/\D/g, ''),
      asesor: g(col.asesor), subcanal: g(col.subcanal),
      via: field === 'cel' && o.c ? headsTxt[o.c - 1] : '',    // en qué columna coincidió el teléfono
      viaFamiliar: !!viaFamiliar,
      s: Math.round(o.s * 100) / 100
    };
  });
}

// ====== Utilidades (mismas reglas de parecido que la página) ======
function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev_(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = []; for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function sim_(a, b) { const m = Math.max(a.length, b.length); return m ? 1 - lev_(a, b) / m : 0; }
function textScore_(qn, tn) {
  if (tn.indexOf(qn) >= 0) return 1;
  const qt = qn.split(' '), tt = tn.split(' ');
  let tot = 0;
  qt.forEach(w => { let best = 0; tt.forEach(t => { const s = t.indexOf(w) === 0 ? (w.length >= 2 ? 1 : 0.6) : sim_(w, t); if (s > best) best = s; }); tot += best; });
  return Math.max(tot / qt.length, sim_(qn, tn));
}
function numScore_(qd, val) {
  const v = String(val).replace(/\D/g, ''); if (!qd || !v) return 0;
  if (v.indexOf(qd) >= 0) return 1;
  const v9 = v.slice(-qd.length);
  return Math.abs(v.length - qd.length) <= 3 ? sim_(qd, v9) : 0;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecuta esta función una vez desde el editor para autorizar los permisos y probar la lectura. */
function probar() {
  console.log(JSON.stringify(buscar_('nombre', 'maria', '')));
}
