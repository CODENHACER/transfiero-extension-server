// Cliente del servidor de señalización: solo transporta mensajes JSON de emparejamiento.
export function openRoom({ url, room, onMessage, onClose }) {
  const ws = new WebSocket(url);
  ws.onopen = () => ws.send(JSON.stringify({ type: "join", room }));
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (err) {
      console.error("Mensaje de señalización no válido", err);
    }
  };
  ws.onclose = (e) => onClose?.(e);
  return {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => ws.close(),
  };
}
