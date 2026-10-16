// Servidor de señalización de TRANSFIERO.
// Solo empareja dos navegadores en una sala temporal y reenvía los mensajes de emparejamiento
// (oferta/respuesta SDP). No guarda archivos ni datos personales. Las salas caducan a los 5 minutos.
// Uso: npm install && npm start   (ponlo detrás de TLS: wss://)
const { WebSocketServer, WebSocket } = require("ws");

const PORT = process.env.PORT || 8080;
const TTL_MS = 5 * 60 * 1000;
const rooms = new Map(); // room -> { peers: WebSocket[], timer }

const wss = new WebSocketServer({ port: PORT, maxPayload: 64 * 1024 });

wss.on("connection", (ws) => {
  ws.room = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "join") return join(ws, msg.room);
    if (!ws.room) return;

    const other = rooms.get(ws.room)?.peers.find((p) => p !== ws);
    if (other && other.readyState === WebSocket.OPEN) other.send(JSON.stringify(msg));
  });

  ws.on("close", () => {
    if (ws.room) destroy(ws.room);
  });
});

function join(ws, room) {
  if (typeof room !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(room)) return ws.close(1008, "sala no válida");

  let r = rooms.get(room);
  if (!r) {
    r = { peers: [], timer: setTimeout(() => destroy(room), TTL_MS) };
    rooms.set(room, r);
  }
  if (r.peers.length >= 2) return ws.close(1013, "sala llena");

  ws.room = room;
  r.peers.push(ws);

  if (r.peers.length === 2) {
    clearTimeout(r.timer);
    r.peers.forEach((p) => p.send(JSON.stringify({ type: "ready" })));
  }
}

function destroy(room) {
  const r = rooms.get(room);
  if (!r) return;
  clearTimeout(r.timer);
  rooms.delete(room);
  r.peers.forEach((p) => p.readyState === WebSocket.OPEN && p.close(1000, "fin de sesión"));
}

console.log(`TRANSFIERO relay escuchando en el puerto ${PORT}`);
