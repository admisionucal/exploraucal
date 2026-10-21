# Registro Explora UCAL

Página para registrar la llegada de alumnos y acompañantes en eventos Explora y sacar el corte por mundo al instante.
La página vive en **GitHub Pages** y los datos en **Supabase** (plan gratuito).

```
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
