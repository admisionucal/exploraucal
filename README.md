# Registro Explora UCAL

Página para registrar la llegada de alumnos y acompañantes en eventos Explora y sacar el corte por mundo al instante.
La página vive en **GitHub Pages** y los datos en **Supabase** (plan gratuito).

```
google-apps-script/Codigo.gs → script para la hoja de la base Prometeo
index.html        → la página
app.js            → la lógica (búsqueda, registro, corte, importar y descargar Excel)
config.js         → aquí van la URL y la clave de tu proyecto Supabase
supabase/schema.sql → tablas y permisos (se pega una sola vez en Supabase)
```

---

## 1. Crear la base en Supabase (10 min)

1. Entra a <https://supabase.com>, crea una cuenta y un **New project**. Región sugerida: *South America (São Paulo)*. Guarda la contraseña de la base.
2. En el menú izquierdo abre **SQL Editor → New query**, pega todo el contenido de `supabase/schema.sql` y presiona **Run**. Debe decir *Success*.
3. **Authentication → Sign In / Providers → Email**: deja Email activado y **desactiva "Allow new users to sign up"**. Así solo entran las personas que tú agregues.
4. **Authentication → Users → Add user → Create new user**: crea a cada registrador con su correo `@ucal.edu.pe` y una contraseña (marca *Auto Confirm User*).
   - Aunque alguien cree un usuario con otro dominio, la base no le muestra ni le deja guardar nada: las políticas solo aceptan correos `@ucal.edu.pe`.
5. **Project Settings → API**: copia **Project URL** y la clave **anon public**.

## 2. Configurar la página

Abre `config.js` y reemplaza:

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```

La clave *anon* es pública por diseño; la seguridad la dan el login y las políticas del `schema.sql`.
**Nunca** pongas aquí la clave `service_role`.

## 3. Publicar en GitHub Pages

1. En GitHub crea un repositorio nuevo, por ejemplo `registro-explora`.
2. Sube `index.html`, `app.js`, `config.js` y la carpeta `supabase` (botón **Add file → Upload files**).
3. **Settings → Pages → Build and deployment**: *Source: Deploy from a branch*, rama `main`, carpeta `/ (root)` → **Save**.
4. En 1–2 minutos la página queda en `https://TU-USUARIO.github.io/registro-explora/`.
5. Vuelve a Supabase → **Authentication → URL Configuration** y pon esa dirección en **Site URL** (sirve para el botón "Enviarme un enlace de acceso").

## 4. Antes del evento (pestaña Importar)

- **Padrón de colegios** (una sola vez): sube el Excel con las columnas `CODIGO MODULAR`, `CENTRO EDUCATIVO` (obligatorias) y `DEPARTAMENTO`, `PROVINCIA`, `DISTRITO`, `DIRECCION CENTRO EDUCATIVO` (opcionales). Si lo vuelves a subir, se actualiza por código modular.
- **Inscritos del evento**: crea el evento con **+ Nuevo evento** y sube el Excel de inscritos. Solo `Nombres y Apellidos` es obligatoria; las demás columnas (Celular, DNI, ID Prometeo, Carrera, Mundo, ¿En qué grado está?, Año egreso de cole, Cod Modular, Nombre Colegio, Distrito, ¿Confirmó asistencia?, Registrador, acompañantes 1-3) se reconocen por su nombre, sin importar orden, tildes o mayúsculas. La pantalla muestra qué columnas usó y cuáles no reconoció.
  Si una persona aparece dos veces (mismo celular o DNI y nombre parecido), se combina en un solo registro.

## 5. Uso el día del evento

1. Ingresa con tu correo UCAL. El **registrador** es siempre el usuario con el que entraste.
2. **Registro**: busca al inscrito por nombre (no tiene que estar escrito igual: se muestra el % de parecido) o por celular, DNI o ID Prometeo. Haz clic en él, revisa o corrige sus datos y presiona **Registrar llegada**.
   Si no está inscrito, llena el formulario como nuevo asistente.
3. **Mundo y carrera**: elige el mundo y luego la carrera (la lista se filtra), o escribe la carrera directamente y el mundo se completa solo.
4. **Colegio**: escribe el código modular y se completan el nombre y el distrito; o elige el distrito y busca el colegio por nombre.
5. El **corte en vivo** se actualiza solo en todas las computadoras conectadas (punto verde junto a tu nombre).
6. **Asistentes**: filtra *Llegaron / Inscritos sin llegar / Todos*, corrige, quita la llegada o elimina.
7. **Corte**: elige la hora (ej. 12:00) o *Hasta ahora* → verás la tabla por mundo y la tabla por carrera → **Copiar para WhatsApp** o **Descargar Excel** (hojas *Corte* —con ambas tablas— y *Registros*, con las columnas de la plantilla Explora + distrito y hora de llegada).

## 6. Búsqueda en la base Prometeo (Google Sheets, en vivo)

La página consulta tu hoja de Google Sheets cada vez que alguien escribe un ID, un nombre o un celular, y completa **ID Prometeo** y **Asesor**. La hoja no se importa ni se publica.

**Seguridad**
- La hoja sigue privada (no la compartas ni la publiques).
- El script solo responde a quien tiene sesión iniciada en la página con correo @ucal.edu.pe (lo verifica con Supabase en cada consulta).
- Devuelve como máximo 8 coincidencias por búsqueda, pide al menos 3 dígitos o 4 letras y permite 40 búsquedas por minuto por usuario: no se puede descargar la base completa.

**Instalación (una vez, 5 min)**
1. Abre la hoja → **Extensiones → Apps Script**.
2. Borra lo que haya y pega el contenido de `google-apps-script/Codigo.gs`.
3. Arriba del archivo completa `SUPABASE_URL` y `SUPABASE_ANON_KEY` (los mismos de `config.js`). Si la base no está en la primera pestaña, escribe su nombre en `NOMBRE_HOJA`.
4. La primera fila de la hoja debe tener los encabezados. Se reconocen: *ID PROMETEO*, *NOMBRES*, *TELEFONO 1* y *TELEFONO 2* (se busca en ambos), *NUMERO DE DOCUMENTO*, *ASESOR ULT TIP DF SN CONTC* (asesor) y *SUBCANAL 2* (opcional). El teléfono se busca en todas las columnas que contengan *Telefono* o *Celular*, incluidas las de padre, madre o familiar; al escribir el celular de un acompañante también se busca.
5. Guarda (💾). En la lista de funciones elige **probar** y presiona **Ejecutar** → **Revisar permisos** → elige tu cuenta → **Permitir**.
6. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario** (la seguridad la pone el login de la página, no Google).
7. Presiona **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
8. Pégala en `config.js`, en `PROMETEO_URL`, y sube los cambios a GitHub.

Si cambias el script después, usa **Implementar → Gestionar implementaciones → Editar (lápiz) → Versión: Nueva versión** para que la URL siga siendo la misma.

### Cómo se calcula el corte
- **Padres**: acompañantes marcados como Madre, Padre o Familiar.
- **Alumnos Egresados**: "Ya acabó el colegio".
- **Alumnos 5to**: 5to de secundaria.
- **Alumnos no vendibles**: 3ero y 4to de secundaria.
- **Total** = padres + alumnos (si hay acompañantes "Amigo/estudiante" o alumnos sin grado, aparecen en filas aparte y también suman).

## Notas
- El plan gratuito de Supabase **pausa el proyecto si pasa 7 días sin uso**. Antes de un evento entra al panel de Supabase y, si dice *Paused*, presiona **Restore** (tarda unos minutos).
- Para agregar o cambiar carreras, edita la lista `CARRERAS` al inicio de `app.js`.
- Si actualizas la página desde una versión anterior, vuelve a correr `supabase/schema.sql` completo en el SQL Editor (es seguro repetirlo: no borra datos).
- Los datos se pueden revisar y descargar también desde Supabase → **Table Editor → registros**.
