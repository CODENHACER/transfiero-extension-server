// Protocolo de transferencia sobre RTCDataChannel.
// Cada archivo: mensaje JSON {t:"meta"} + fragmentos binarios + mensaje JSON {t:"end"}.
export const CHUNK_SIZE = 16 * 1024;     // 16 KB: compatible con Safari (iOS) y Chrome
const HIGH_WATER = 1024 * 1024;          // pausa si hay más de 1 MB pendiente de enviar
const LOW_WATER = 256 * 1024;            // reanuda al bajar de 256 KB

function waitForDrain(dc) {
  return new Promise((resolve) => dc.addEventListener("bufferedamountlow", resolve, { once: true }));
}

export async function sendFiles(dc, files, onProgress) {
  dc.bufferedAmountLowThreshold = LOW_WATER;
  for (const file of files) {
    const id = crypto.randomUUID();
    dc.send(JSON.stringify({ t: "meta", id, name: file.name, size: file.size, type: file.type }));
    let offset = 0;
    while (offset < file.size) {
      if (dc.bufferedAmount > HIGH_WATER) await waitForDrain(dc);
      const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      dc.send(buffer);
      offset += buffer.byteLength;
      onProgress?.({ name: file.name, sent: offset, total: file.size });
    }
    dc.send(JSON.stringify({ t: "end", id }));
  }
}

function safeName(name) {
  return String(name || "archivo").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 200) || "archivo";
}

export function attachReceiver(dc, { onFile, onProgress }) {
  dc.binaryType = "arraybuffer";
  let current = null;
  dc.onmessage = (e) => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);
      if (msg.t === "meta") {
        current = { meta: msg, parts: [], received: 0 };
      } else if (msg.t === "end" && current) {
        const blob = new Blob(current.parts, { type: current.meta.type || "application/octet-stream" });
        onFile({ name: safeName(current.meta.name), blob });
        current = null;
      }
      return;
    }
    if (!current) return;
    current.parts.push(e.data);
    current.received += e.data.byteLength;
    onProgress?.({ name: current.meta.name, sent: current.received, total: current.meta.size });
  };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
