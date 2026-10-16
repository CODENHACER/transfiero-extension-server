import { RELAY_URL, PHONE_URL } from "./shared/config.js";
import { createPeer, gatherComplete, verificationCode } from "./shared/peer.js";
import { openRoom } from "./shared/signal.js";
import { sendFiles, attachReceiver, formatBytes } from "./shared/transfer.js";

const $ = (id) => document.getElementById(id);
let s = {};                 // sesión activa
let sendQueue = Promise.resolve();

function showPanel(id) {
  document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== id));
}

function status(text, kind = "wait") {
  $("status").textContent = text;
  $("status").className = `pill ${kind}`;
}

function showHint(text, kind = "err") {
  $("hint").textContent = text;
  $("hint").className = `hint ${kind}`;
  $("hint").hidden = false;
}

function randomRoom() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function closeSession() {
  if (s.sig) s.sig.close();
  if (s.dc) s.dc.close();
  if (s.pc) s.pc.close();
  s = {};
}

function endSession(message) {
  closeSession();
  $("endMsg").textContent = message;
  showPanel("ended");
  status("Sesión terminada", "err");
}

function newSession() {
  closeSession();
  const sess = { room: randomRoom(), verified: false, attached: false, paired: false };
  sess.pc = createPeer();
  sess.dc = sess.pc.createDataChannel("transfiero");
  sess.dc.onopen = () => enable(sess);
  sess.dc.onclose = () => {
    if (s === sess && sess.attached) endSession("La conexión con el móvil se ha cerrado.");
  };
  sess.pc.onconnectionstatechange = () => {
    if (s === sess && sess.pc.connectionState === "failed") {
      endSession("No se pudo conectar. Asegúrate de que PC y móvil estén en la misma red Wi-Fi.");
    }
  };
  s = sess;

  const link = `${PHONE_URL}#${sess.room}`;
  QRCode.toCanvas($("qr"), link, { width: 240, margin: 1 }, (err) => err && console.error(err));
  $("link").textContent = link;
  $("link").href = link;
  $("hint").hidden = true;
  $("retry").hidden = true;

  // Aviso claro si la configuración sigue con las direcciones de ejemplo
  if (RELAY_URL.includes("tudominio") || PHONE_URL.includes("tudominio")) {
    showHint("Falta configurar tus direcciones: edita shared/config.js (ahora son de ejemplo), vuelve a cargar la extensión y pulsa Reintentar.");
  }

  showPanel("pair");
  status("Esperando al móvil…", "wait");

  sess.sig = openRoom({
    url: RELAY_URL,
    room: sess.room,
    onMessage: (msg) => handleSignal(sess, msg),
    onClose: () => {
      // Se mantiene el QR visible para poder reintentar; no se cierra la sesión de golpe.
      if (s !== sess || sess.attached || sess.verified) return;
      status("Sin conexión con el servidor", "err");
      if (sess.paired) {
        showHint("Se ha perdido la conexión de emparejamiento. Pulsa Reintentar y vuelve a escanear.");
      } else {
        showHint("No se puede contactar con el servidor de emparejamiento. Comprueba shared/config.js y que el servidor esté en marcha.");
      }
      $("retry").hidden = false;
    },
  });
}

async function handleSignal(sess, msg) {
  if (s !== sess) return;
  try {
    if (msg.type === "ready") {
      // El móvil ya está en la sala: el PC crea la oferta.
      sess.paired = true;
      await sess.pc.setLocalDescription(await sess.pc.createOffer());
      await gatherComplete(sess.pc);
      sess.sig.send({ type: "offer", sdp: sess.pc.localDescription.sdp });
    } else if (msg.type === "answer") {
      await sess.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      $("code").textContent = await verificationCode(sess.pc.localDescription.sdp, msg.sdp);
      showPanel("verify");
      status("Verifica el código", "warn");
    }
  } catch (err) {
    console.error(err);
    endSession("Error al establecer la conexión. Inténtalo de nuevo.");
  }
}

// Solo se activa la transferencia cuando el código está verificado y el canal está abierto.
function enable(sess) {
  if (s !== sess || !sess.verified || sess.attached || sess.dc.readyState !== "open") return;
  sess.attached = true;
  attachReceiver(sess.dc, { onFile: addReceived, onProgress: showRecv });
  showPanel("transfer");
  status("Conectado", "ok");
}

function showSend({ name, sent, total }) {
  const pct = total ? Math.round((sent / total) * 100) : 100;
  $("sendBar").style.width = `${pct}%`;
  $("sendLabel").textContent = `Enviando ${name} · ${pct}%`;
}

function showRecv({ name, sent, total }) {
  const pct = total ? Math.round((sent / total) * 100) : 100;
  $("recvBar").style.width = `${pct}%`;
  $("recvLabel").textContent = `Recibiendo ${name} · ${pct}%`;
}

function queueSend(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (!s.attached) return status("Aún no hay conexión con el móvil", "warn");
  const sess = s;
  sendQueue = sendQueue
    .then(() => sendFiles(sess.dc, files, showSend))
    .then(() => { $("sendLabel").textContent = `Enviado: ${files.length} archivo(s).`; })
    .catch((err) => { console.error(err); $("sendLabel").textContent = "Error al enviar. Inténtalo de nuevo."; });
}

function addReceived({ name, blob }) {
  const url = URL.createObjectURL(blob);
  const li = document.createElement("li");
  const info = document.createElement("span");
  info.className = "fname";
  info.textContent = `${name} · ${formatBytes(blob.size)}`;
  const a = document.createElement("a");
  a.className = "btn small primary";
  a.href = url;
  a.download = name;
  a.textContent = "Guardar";
  li.append(info, a);
  $("received").prepend(li);
  $("recvLabel").textContent = `Recibido: ${name}`;
  a.click(); // descarga automática; el botón "Guardar" queda disponible si el navegador la bloquea
}

// Eventos de la interfaz
$("confirm").onclick = () => {
  s.verified = true;
  enable(s);
  if (!s.attached) status("Conectando el canal…", "wait");
};
$("cancel").onclick = () => endSession("Cancelado: los códigos no coincidían. Vuelve a escanear el QR.");
$("copy").onclick = async () => {
  await navigator.clipboard.writeText(s.room ? `${PHONE_URL}#${s.room}` : "");
  $("copy").textContent = "¡Copiado!";
  setTimeout(() => ($("copy").textContent = "Copiar enlace"), 1500);
};
$("retry").onclick = newSession;
$("newSession").onclick = newSession;
$("restart").onclick = newSession;

const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  queueSend(e.dataTransfer.files);
});
$("pick").addEventListener("change", (e) => {
  queueSend(e.target.files);
  e.target.value = "";
});
// Evita que soltar un archivo fuera de la zona abra el archivo en la pestaña.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

newSession();
