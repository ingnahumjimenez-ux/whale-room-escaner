# Whale Room · Escáner como app en tu Android

Guía en 3 partes: crear tu cuenta de GitHub, publicar la app y luego instalarla en el teléfono.
Tiempo total: unos 15 minutos. **Recomendado hacerlo desde una computadora** (desde el celular también se puede, pero es más incómodo).

---

## Parte 1 · Crear tu cuenta de GitHub (5 min)

1. Entra a **https://github.com/signup**
2. Escribe tu correo, una contraseña y un **nombre de usuario** (por ejemplo `aminta-wr`).
   Anótalo: será parte del enlace de tu app.
3. Resuelve la verificación y escribe el código que te llega al correo.
4. Si te pregunta por un plan, elige **Free** (gratis).

---

## Parte 2 · Publicar la app (5 min)

### 2.1 Crear el repositorio
1. Arriba a la derecha toca **+** → **New repository**.
2. Nombre: `whale-room-escaner`
3. Marca **Public** (GitHub Pages gratis solo funciona con repositorios públicos).
4. Toca **Create repository**.

### 2.2 Subir los archivos
1. En la página del repositorio toca el enlace **uploading an existing file**
   (o **Add file → Upload files**).
2. Descomprime el ZIP y **arrastra los 7 archivos** (o elígelos con *choose your files*):
   - `index.html`
   - `manifest.webmanifest`
   - `sw.js`
   - `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`
   - (este `LEEME.md` es opcional)
3. Abajo toca **Commit changes**.

### 2.3 Activar GitHub Pages
1. En el repositorio entra a **Settings** → en el menú izquierdo **Pages**.
2. En **Source** elige **Deploy from a branch**.
3. En **Branch** elige **main** y la carpeta **/ (root)**. Toca **Save**.
4. Espera 1–2 minutos y recarga la página: arriba aparecerá
   **Your site is live at** `https://TU-USUARIO.github.io/whale-room-escaner/`

---

## Parte 3 · Instalar en tu Android (1 min)

1. Abre ese enlace en **Chrome** en tu teléfono.
2. Toca el menú **⋮** (arriba a la derecha) → **Instalar app** (o **Agregar a la pantalla principal → Instalar**).
3. Listo: aparece el ícono de **Whale Room** en tu pantalla. Se abre a pantalla completa, como una app.

### Pasar tu historial
El historial se guarda por separado en la app. Antes de cambiarte:
1. En el escáner que usas hoy: pestaña **⭐ Historial → Exportar historial** (se descarga un archivo `.json`).
2. En la app nueva: **⭐ Historial → Importar historial** y elige ese archivo.

---

## Cómo actualizar la app
Cuando te envíe una versión nueva (`index.html`):
1. En tu repositorio: **Add file → Upload files**, sube el nuevo `index.html` (reemplaza al anterior) → **Commit changes**.
2. En 1–2 minutos la app se actualiza sola la próxima vez que la abras con internet. No hay que reinstalar.

---

## Bueno saber
- **Escaneo con la app cerrada:** Android pausa las apps web al cerrarlas, así que no escanea en segundo plano. Para eso está el **bot de Telegram** (24/7), que usa esta misma cuenta de GitHub; su guía viene en el paquete del bot.
- **Repositorio público:** cualquiera con el enlace puede abrir el escáner, pero **tu historial y tus datos quedan solo en tu teléfono**; el código no contiene claves ni datos tuyos.
- **APK (opcional):** con la app ya publicada, entra a **https://www.pwabuilder.com**, pega tu enlace y descarga el paquete **Android**. Sirve si quieres compartir un archivo instalable.
