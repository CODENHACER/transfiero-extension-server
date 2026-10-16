export const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function createPeer() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

// Espera a reunir los candidatos ICE y devuelve el SDP completo (sin "trickle ICE"),
// así solo hace falta un mensaje de señalización por cada lado.
export function gatherComplete(pc, timeoutMs = 4000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve(pc.localDescription);
  return new Promise((resolve) => {
    const finish = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve(pc.localDescription);
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(finish, timeoutMs);
  });
}

// Código de verificación de 6 cifras. Ambos dispositivos lo calculan a partir de las
// huellas DTLS de los dos extremos. Si alguien intercepta la señalización, los códigos
// no coinciden y el usuario debe cancelar.
export async function verificationCode(localSdp, remoteSdp) {
  const fp = (sdp) => (sdp.match(/a=fingerprint:sha-256 ([0-9A-F:]+)/i) || [])[1] || "";
  const data = new TextEncoder().encode([fp(localSdp), fp(remoteSdp)].sort().join("|"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const n = ((hash[0] << 16) | (hash[1] << 8) | hash[2]) % 1000000;
  const digits = String(n).padStart(6, "0");
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}
