# TRANSFIERO · Guía de desarrollo y publicación

## Estructura

```
transfiero/
├── manifest.json        Manifiesto MV3 (sin permisos)
├── popup.html / .js     Menú del icono: abrir TRANSFIERO e instrucciones
├── app.html / .js       Interfaz principal (pestaña): QR, verificación, envío y recepción
├── help.html            Instrucciones de uso (botón "Instrucciones")
├── style.css
├── shared/              Lógica compartida: WebRTC, señalización y protocolo de transferencia
├── lib/qrcode.min.js    Generador de QR incluido localmente (no se carga código remoto)
├── icons/               Icono en SVG y PNG (16, 32, 48, 128)
├── phone/               Página para el móvil (se aloja en tu web, no va en la extensión)
├── server/              Servidor de señalización (Node.js + ws)
├── PRIVACIDAD.md        Política de privacidad (obligatoria en la Chrome Web Store)
└── LEEME.md             Este archivo
```

## 1. Configurar las direcciones

Edita `shared/config.js`:

```js
export const RELAY_URL = "wss://relay.tudominio.com";
export const PHONE_URL = "https://transfiero.tudominio.com/phone/";
```

## 2. Desplegar el servidor de señalización

```bash
cd server
npm install
npm start            # escucha en el puerto 8080
```

Ponlo detrás de HTTPS/WSS (un proxy como Caddy o Nginx, o una plataforma con TLS como Render, Fly.io o Railway). Solo necesita Node.js 18 o superior. Las salas caducan a los 5 minutos y no se guarda ningún dato.

## 3. Alojar la página del móvil

Sube a tu web las carpetas `phone/` y `shared/` manteniendo la estructura, de modo que exista `https://tu-dominio/phone/`. Para pruebas puedes usar GitHub Pages o Cloudflare Pages.

## 4. Probar en local

1. En `chrome://extensions`, activa el **Modo de desarrollador** y pulsa **Cargar descomprimida** en la carpeta de la extensión.
2. Pulsa el icono de TRANSFIERO y luego **Abrir TRANSFIERO**.
3. Escanea el QR con el móvil, compara el código de 6 cifras y confirma en ambos dispositivos.

## 5. Publicar en Chrome Web Store

- **Cuenta de desarrollador:** pago único de 5 USD en el panel de desarrolladores de Chrome Web Store.
- **Paquete:** comprime el contenido de la carpeta de la extensión (con `manifest.json` en la raíz). Excluye `server/`, `phone/`, `LEEME.md` y `PRIVACIDAD.md`. El archivo `transfiero-extension.zip` ya viene preparado.
- **Política de privacidad:** publica `PRIVACIDAD.md` en una URL pública (por ejemplo, una página de tu web) e introdúcela en la ficha.
- **Propósito único:** describe la extensión como "transferir archivos entre PC y móvil". No hay permisos que justificar.
- **Imágenes:** icono de 128 px (incluido), al menos una captura de 1280×800 o 640×400, y opcionalmente un tile promocional de 440×280.
- **Revisión:** el revisor probará la extensión. Mantén el servidor de señalización y la página del móvil activos y describe en la ficha cómo usarla.
- **Código remoto:** no hay código remoto ni `eval`. Todas las librerías están incluidas en el paquete.
- **Marcas:** la ficha menciona "Android" e "iOS" de forma descriptiva; evita usar logotipos de terceros.

## Limitaciones conocidas

- Sin servidor TURN, algunas redes restrictivas (empresas, algunas redes móviles con NAT estricto) no conectarán. Para cubrirlas puedes añadir un TURN propio o de un proveedor, en `shared/peer.js`.
- Los archivos se reciben en memoria antes de guardarse; para archivos de varios GB conviene una red estable y un PC con memoria suficiente.
- Chrome en iOS no es el navegador de referencia: la página del móvil funciona en Safari (iOS) y Chrome (Android).
- La pantalla del móvil debe permanecer encendida durante la transferencia.
