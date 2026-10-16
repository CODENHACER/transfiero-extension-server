import { RELAY_URL } from "../shared/config.js";
import { createPeer, gatherComplete, verificationCode } from "../shared/peer.js";
import { openRoom } from "../shared/signal.js";
import { sendFiles, attachReceiver, formatBytes } from "../shared/transfer.js";

const $ = (id) => document.getElementById(id);
const room = decodeURIComponent(location.hash.slice(1));
let pc = null;
let dc = null;
let sig = null;
let verified = false;
let attached = false;
let sendQueue = Promise.resolve();
let ended = false;

function showPanel(id) {
  document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== id));
}

function status(text, kind = "") {
  $("status").textContent = text;
  $("status").className = `pill ${kind}`;
}

function endSession(message) {
  if (ended) return;
  ended = true;
  if (sig) sig.close();
  if (dc) dc.close();
  if (pc) pc.close();
  sig = dc = pc = null;
  $("endMsg").textContent = message;
  showPanel("end");
  status("Sesión terminada", "err");
}

function enable() {
  if (!verified || attached || !dc || dc.readyState !== "open") return;
  attached = true;
  attachReceiver(dc, { onFile: addReceived, onProgress: showRecv });
  showPanel("transfer");
  status("Conectado", "ok");
  if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(() => {});
}

async function onSignal(msg) {
  try {
    if (msg.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gatherComplete(pc);
      sig.send({ type: "answer", sdp: pc.localDescription.sdp });
      $("code").textContent = await verificationCode(pc.localDescription.sdp, msg.sdp);
      showPanel("verify");
      status("Verifica el código", "warn");
    }
  } catch (err) {
    console.error(err);
    endSession("Error al establecer la conexión. Vuelve a escanear el QR.");
  }
}

function connect() {
  showPanel("wait");
  status("Conectando…", "");

  pc = createPeer();
  pc.ondatachannel = (e) => {
    dc = e.channel;
    dc.onopen = enable;
    dc.onclose = () => { if (attached && !ended) endSession("La conexión con el PC se ha cerrado."); };
    enable();
  };
  pc.onconnectionstatechange = () => {
    if (pc && pc.connectionState === "failed") {
      endSession("No se pudo conectar. Asegúrate de que el móvil y el PC estén en la misma Wi-Fi.");
    }
  };

  sig = openRoom({
    url: RELAY_URL,
    room,
    onMessage: onSignal,
    onClose: () => {
      if (!ended && !attached && !verified) {
        endSession("No se pudo conectar con el servidor, o el código ha caducado. Vuelve a escanear el QR en el PC.");
      }
    },
  });
}

function onSendProgress({ name, sent, total }) {
  const pct = total ? Math.round((sent / total) * 100) : 100;
  $("sendBar").style.width = `${pct}%`;
  $("sendLabel").textContent = `Enviando ${name} · ${pct}%`;
}

function showRecv({ name, sent, total }) {
  const pct = total ? Math.round((sent / total) * 100) : 100;
  $("recvBar").style.width = `${pct}%`;
  $("recvLabel").textContent = `Recibiendo ${name} · ${pct}%`;
}

function addReceived({ name, blob }) {
  const li = document.createElement("li");
  const info = document.createElement("span");
  info.className = "fname";
  info.textContent = `${name} · ${formatBytes(blob.size)}`;
  const a = document.createElement("a");
  a.className = "save";
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.textContent = "Guardar";
  li.append(info, a);
  $("received").prepend(li);
  $("recvLabel").textContent = `Recibido: ${name}`;
  $("recvBar").style.width = "100%";
}

$("pick").addEventListener("change", (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  if (!attached) return status("Sin conexión con el PC", "warn");
  const channel = dc;
  sendQueue = sendQueue
    .then(() => sendFiles(channel, files, onSendProgress))
    .then(() => { $("sendLabel").textContent = `Enviado: ${files.length} archivo(s).`; })
    .catch((err) => { console.error(err); $("sendLabel").textContent = "Error al enviar. Inténtalo de nuevo."; });
});

$("confirm").onclick = () => {
  verified = true;
  enable();
  if (!attached) status("Conectando el canal…", "");
};
$("cancel").onclick = () => endSession("Cancelado: los códigos no coincidían. Vuelve a escanear el QR en el PC.");

if (!/^[A-Za-z0-9_-]{20,64}$/.test(room)) {
  showPanel("bad");
  status("Enlace no válido", "err");
} else {
  connect();
}
