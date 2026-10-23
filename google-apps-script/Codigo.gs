/**
 * Búsqueda en la base Prometeo para la página Registro Explora UCAL.
 *
 * Se pega en la hoja de Google Sheets: Extensiones → Apps Script.
 * La hoja NO se comparte ni se publica. Este script:
 *   - solo responde si la consulta trae una sesión válida de la página
 *     (la verifica con Supabase) y el correo es @ucal.edu.pe;
 *   - busca por ID PROMETEO, NOMBRES, NUMERO DE DOCUMENTO y en todas las columnas de teléfono
 *     (Telefono 1, Telefono 2 y las de padre/madre/familiar si existen);
 *   - devuelve ID, asesor (ASESOR ULT TIP DF SN CONTC) y SUBCANAL 2 (si existe);
 *   - el asesor solo se entrega si STATUS DE GESTIÓN es VALORACION POSITIVA VIVA o PROMESA DE PAGO VIVA;
 *   - devuelve como máximo 8 coincidencias por búsqueda, nunca la hoja completa;
 *   - pide al menos 3 dígitos o 4 letras;
 *   - limita a 40 búsquedas por minuto por usuario.
 *
 * VELOCIDAD: para no leer toda la hoja en cada búsqueda, el script guarda un índice
 * (ID, nombre, documento, teléfonos y n° de fila) en la caché interna de Google y lo
 * renueva cada 10 minutos. Ejecuta UNA VEZ la función "instalar" desde el editor.
 */

// ====== CONFIGURACIÓN ======
const SUPABASE_URL      = 'https://ixvvwaadxfpssgekyjjx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wFOiAOr24jMrzHbspmJN3w_5Azizzbk';
const DOMINIO           = 'ucal.edu.pe';
const NOMBRE_HOJA       = '';   // vacío = primera pestaña; o escribe el nombre exacto de la pestaña
const MAX_RESULTADOS    = 8;
const MAX_POR_MINUTO    = 40;
const MINUTOS_INDICE    = 10;   // cada cuánto se renueva el índice

// Nombres de columna aceptados (sin tildes ni mayúsculas; los signos se ignoran)
const COLUMNAS = {
  id:      ['id prometeo', 'id', 'prometeo', 'codigo prometeo', 'id_prometeo'],
  nombre:  ['nombres', 'nombre', 'nombres y apellidos', 'nombre completo', 'alumno', 'prospecto', 'lead'],
  dni:     ['numero de documento', 'nro de documento', 'nro documento', 'documento', 'dni', 'numero documento'],
  asesor:  ['asesor ult tip df sn contc', 'asesor', 'asesora', 'asesor comercial', 'ejecutivo', 'ejecutiva', 'promotor', 'vendedor', 'responsable', 'asesor asignado'],
  subcanal:['subcanal 2', 'subcanal2', 'sub canal 2'],
  status:  ['status de gestion', 'estado de gestion', 'status gestion', 'estatus de gestion']
};
// El asesor SOLO se entrega si STATUS DE GESTIÓN es uno de estos (se comparan sin tildes ni mayúsculas)
// Se escriben tal como están en la hoja: norm_ los pasa a minúsculas y cambia _ por espacio, igual que al comparar.
const STATUS_CON_ASESOR = ['VALORES_VALORACIONES_POSITIVAS_VIVA', 'VALORES_PROMESA_DE_PAGO_VIVA'].map(norm_);
// Si no hay coincidencia exacta, se usa la primera columna que EMPIECE con esto
const PREFIJOS = { asesor: 'asesor', subcanal: 'subcanal 2', status: 'status de gestion' };
// Teléfonos: TODAS las columnas cuyo nombre contenga telefono / celular / movil / whatsapp
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
    if (field === 'diag') return json_({ ok: true, diag: diagnostico_() });

    const q = String(body.q || '').trim();
    const qd = q.replace(/\D/g, '');
    if (field === 'nombre' ? norm_(q).length < 4 : qd.length < 3) return json_({ ok: true, items: [] });

    return json_({ ok: true, items: buscar_(field, q, qd) });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'error en la búsqueda: ' + String(err && err.message || err).slice(0, 120) });
  }
}

function doGet() {
  return json_({ ok: false, error: 'usa la página de registro' });
}

// ====== Instalación (ejecutar una vez desde el editor) ======
function instalar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'actualizarIndice').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('actualizarIndice').timeBased().everyMinutes(MINUTOS_INDICE).create();
  const n = actualizarIndice();
  console.log('Listo. Índice con ' + n + ' filas. Se renovará cada ' + MINUTOS_INDICE + ' minutos.');
}
function actualizarIndice() {
  PropertiesService.getScriptProperties().deleteProperty('idx_error');
  const idx = construirIndice_();
  guardarIndice_(idx);
  return idx.filas.length;
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

// ====== Hoja y columnas ======
function hoja_() {
  return NOMBRE_HOJA ? SpreadsheetApp.getActive().getSheetByName(NOMBRE_HOJA) : SpreadsheetApp.getActive().getSheets()[0];
}
function columnas_(sh, fresco) {
  const cache = CacheService.getScriptCache();
  let txt = !fresco && cache.get('cols') ? JSON.parse(cache.get('cols')) : null;   // encabezados en caché
  if (!txt) {
    txt = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    cache.put('cols', JSON.stringify(txt), MINUTOS_INDICE * 60 * 3);
  }
  const lastCol = txt.length;
  const heads = txt.map(norm_);
  const col = {};
  Object.keys(COLUMNAS).forEach(k => {
    for (const alias of COLUMNAS[k]) { const i = heads.indexOf(alias); if (i >= 0) { col[k] = i + 1; break; } }
    if (!col[k] && PREFIJOS[k]) { const i = heads.findIndex(h => h.indexOf(PREFIJOS[k]) === 0); if (i >= 0) col[k] = i + 1; }
  });
  const tel = heads.map((h, i) => RE_TELEFONO.test(h) ? i + 1 : 0).filter(Boolean);
  return { col, tel, heads, txt, lastCol };
}

// ====== Índice en caché ======
// Cada fila del índice (separada por tabs):
// 0 fila · 1 id · 2 dni · 3 teléfonos por columna (separados por |) · 4 nombre normalizado
// 5 nombre · 6 asesor · 7 status · 8 subcanal
function construirIndice_() {
  const sh = hoja_();
  const c = columnas_(sh, true);   // al renovar el índice se releen los encabezados
  if (!c.col.id) throw new Error('No se encontró la columna ID PROMETEO');
  const lastRow = sh.getLastRow(), n = Math.max(0, lastRow - 1);
  const leer = k => k && n ? sh.getRange(2, k, n, 1).getDisplayValues() : null;
  const ids = leer(c.col.id), noms = leer(c.col.nombre), docs = leer(c.col.dni);
  const ases = leer(c.col.asesor), sts = leer(c.col.status), subs = leer(c.col.subcanal);
  const tels = c.tel.map(leer);
  const limpio = v => String(v == null ? '' : v).replace(/[\t\n\r|]+/g, ' ').trim();
  const filas = [];
  for (let i = 0; i < n; i++) {
    const id = String(ids[i][0]).replace(/\D/g, '');
    if (!id) continue;
    const t = tels.map(arr => String(arr[i][0]).replace(/\D/g, '')).join('|');
    const nom = noms ? limpio(noms[i][0]) : '';
    filas.push([i + 2, id, docs ? String(docs[i][0]).replace(/\D/g, '') : '', t, norm_(nom), nom,
      ases ? limpio(ases[i][0]) : '', sts ? limpio(sts[i][0]) : '', subs ? limpio(subs[i][0]) : '']);
  }
  return { filas, creado: Date.now(), tel: c.tel, col: c.col };
}
function guardarIndice_(idx) {
  const cache = CacheService.getScriptCache();
  const texto = idx.filas.map(f => f.join('\t')).join('\n');
  const zip = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(texto, 'text/plain')).getBytes());
  const TAM = 95000, partes = {};
  let k = 0;
  for (let i = 0; i < zip.length; i += TAM) partes['idx_' + (k++)] = zip.slice(i, i + TAM);
  partes['idx_meta'] = JSON.stringify({ partes: k, filas: idx.filas.length, creado: idx.creado });
  const exp = Math.min(21600, MINUTOS_INDICE * 60 * 3);
  const keys = Object.keys(partes).filter(x => x !== 'idx_meta');
  try {
    for (let i = 0; i < keys.length; i += 900) {
      const lote = {}; keys.slice(i, i + 900).forEach(x => lote[x] = partes[x]);
      cache.putAll(lote, exp);
    }
    cache.put('idx_meta', partes['idx_meta'], exp);   // la meta se guarda al final: solo si todo entró
  } catch (err) {
    console.error('No se pudo guardar el índice en caché: ' + err);
    PropertiesService.getScriptProperties().setProperty('idx_error', String(err).slice(0, 200));
  }
}
function leerIndice_() {
  const cache = CacheService.getScriptCache();
  const meta = cache.get('idx_meta');
  if (meta) {
    const m = JSON.parse(meta);
    const keys = []; for (let i = 0; i < m.partes; i++) keys.push('idx_' + i);
    const got = cache.getAll(keys);
    if (keys.every(x => got[x] != null)) {
      const zip = keys.map(x => got[x]).join('');
      const texto = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(zip), 'application/x-gzip')).getDataAsString();
      return { texto: '\n' + texto + '\n', creado: m.creado };
    }
  }
  const idx = construirIndice_();      // primera vez o caché vencida: más lento
  guardarIndice_(idx);
  return { texto: '\n' + idx.filas.map(f => f.join('\t')).join('\n') + '\n', creado: idx.creado };
}

// Recorre las filas del índice donde aparece "aguja" (búsqueda nativa, sin partir todo el texto)
function filasCon_(texto, aguja, max, fn) {
  const vistas = {};
  let pos = texto.indexOf(aguja), n = 0;
  while (pos >= 0 && n < max) {
    const ini = texto.lastIndexOf('\n', pos) + 1;
    if (!vistas[ini]) {
      vistas[ini] = 1; n++;
      const fin = texto.indexOf('\n', pos);
      fn(texto.slice(ini, fin).split('\t'));
      pos = texto.indexOf(aguja, fin);
    } else pos = texto.indexOf(aguja, pos + 1);
  }
}

// ====== Búsqueda ======
function buscar_(field, q, qd) {
  const idx = leerIndice_(), T = idx.texto;
  let scored = [];
  const MAXF = 4000;
  if (field === 'prom' || field === 'dni') {
    const k = field === 'prom' ? 1 : 2;
    filasCon_(T, '\t' + qd + '\t', 50, f => { if (f[k] === qd) scored.push({ r: +f[0], s: 1, f }); });           // exacto primero
    filasCon_(T, qd, MAXF, f => { if (f[k] && f[k] !== qd && f[k].indexOf(qd) >= 0) scored.push({ r: +f[0], s: 0.9, f }); });
  } else if (field === 'cel') {
    filasCon_(T, qd, MAXF, f => { if (f[3] && f[3].indexOf(qd) >= 0) scored.push({ r: +f[0], s: 1, f }); });
    if (!scored.length && qd.length >= 7) {                                                        // aproximado: mismo inicio
      filasCon_(T, qd.slice(0, 4), 20000, f => { if (!f[3]) return; let best = 0; f[3].split('|').forEach(t => { const s = numScore_(qd, t); if (s > best) best = s; }); if (best >= 0.8) scored.push({ r: +f[0], s: best, f }); });
    }
  } else {
    const qn = norm_(q), palabras = qn.split(' ').filter(w => w.length >= 3);
    const vistos = {};
    palabras.slice(0, 3).forEach(w => {
      filasCon_(T, w.slice(0, 3), 30000, f => {
        if (vistos[f[0]] || !f[4]) return; vistos[f[0]] = 1;
        const s = textScore_(qn, f[4]); if (s >= 0.7) scored.push({ r: +f[0], s, f });
      });
    });
  }

  const sh = hoja_();
  const c = columnas_(sh);

  // Persona agregada después del último índice: búsqueda exacta directa en la hoja
  if (!scored.length && ((field === 'prom' && qd.length >= 5) || (field === 'dni' && qd.length >= 8) || (field === 'cel' && qd.length === 9))) {
    const cols = field === 'prom' ? [c.col.id] : field === 'dni' ? [c.col.dni] : c.tel;
    const patron = qd.split('').join('\\D?');
    cols.filter(Boolean).forEach(k => {
      const n = Math.max(1, sh.getLastRow() - 1);
      sh.getRange(2, k, n, 1).createTextFinder(patron).useRegularExpression(true).findAll().slice(0, 20)
        .forEach(rg => scored.push({ r: rg.getRow(), s: 1 }));
    });
  }

  scored.sort((a, b) => b.s - a.s);
  const vistos = {}; scored = scored.filter(o => vistos[o.r] ? false : (vistos[o.r] = true)).slice(0, MAX_RESULTADOS);

  return scored.map(o => {
    let d;
    if (o.f && o.f.length >= 9) {
      d = { id: o.f[1], nombre: o.f[5], dni: o.f[2], tels: o.f[3].split('|'), asesor: o.f[6], status: o.f[7], subcanal: o.f[8] };
    } else {   // fila nueva encontrada directo en la hoja
      const row = sh.getRange(o.r, 1, 1, c.lastCol).getDisplayValues()[0];
      const g = k => k ? String(row[k - 1]).trim() : '';
      d = { id: g(c.col.id).replace(/\D/g, ''), nombre: g(c.col.nombre), dni: g(c.col.dni).replace(/\D/g, ''),
            tels: c.tel.map(k => g(k).replace(/\D/g, '')), asesor: g(c.col.asesor), status: g(c.col.status), subcanal: g(c.col.subcanal) };
    }
    // d.tels va alineado con c.tel (mismas columnas de teléfono)
    const propias = c.tel.map((k, i) => RE_FAMILIAR.test(c.heads[k - 1]) ? '' : (d.tels[i] || '').slice(-9)).filter(Boolean);
    let via = '', viaFamiliar = false;
    if (field === 'cel') {
      let i = d.tels.findIndex(t => t && t.indexOf(qd) >= 0);
      if (i < 0) i = d.tels.findIndex(t => t && numScore_(qd, t) >= 0.8);
      if (i >= 0 && c.tel[i]) { via = c.txt[c.tel[i] - 1]; viaFamiliar = RE_FAMILIAR.test(c.heads[c.tel[i] - 1]); }
    }
    const tel = (field === 'cel' && !viaFamiliar && propias.find(t => t.indexOf(qd) >= 0)) || propias.find(t => /^9\d{8}$/.test(t)) || propias[0] || '';
    return {
      id: d.id, nombre: d.nombre, celular: tel, dni: d.dni,
      // asesor solo con STATUS DE GESTIÓN = VALORACION POSITIVA VIVA o PROMESA DE PAGO VIVA
      asesor: STATUS_CON_ASESOR.indexOf(norm_(d.status)) >= 0 ? d.asesor : '',
      status: d.status, subcanal: d.subcanal,
      via: via, viaFamiliar: viaFamiliar,
      s: Math.round(o.s * 100) / 100
    };
  });
}

// Solo encabezados y tamaños, nunca datos de personas
function diagnostico_() {
  const t0 = Date.now();
  const sh = hoja_();
  const c = columnas_(sh, true);
  const nom = k => c.col[k] ? c.txt[c.col[k] - 1] : '(no encontrada)';
  const meta = CacheService.getScriptCache().get('idx_meta');
  const m = meta ? JSON.parse(meta) : null;
  return {
    pestaña: sh.getName(), filas: sh.getLastRow() - 1, columnas: c.lastCol,
    encabezados: c.txt.filter(Boolean),
    detectadas: { id: nom('id'), nombre: nom('nombre'), documento: nom('dni'), asesor: nom('asesor'), status: nom('status'), subcanal: nom('subcanal'), telefonos: c.tel.map(k => c.txt[k - 1]) },
    indice: m ? { filas: m.filas, partes: m.partes, minutos: Math.round((Date.now() - m.creado) / 60000) } : 'sin índice (ejecuta "instalar")',
    errorIndice: PropertiesService.getScriptProperties().getProperty('idx_error') || '',
    triggers: ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()),
    ms: Date.now() - t0
  };
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

/** Prueba rápida desde el editor: muestra columnas detectadas (sin datos de personas). */
function probar() {
  console.log(JSON.stringify(diagnostico_(), null, 2));
}
