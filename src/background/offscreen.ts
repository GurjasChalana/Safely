// ──────────────────────────────────────────────────────
// Safely · background/offscreen.ts  [offscreen document]
//
// Plays audio warnings via Web Audio API. Because this is
// an extension-managed offscreen document (not a web page),
// Chrome's autoplay policy does not apply — audio plays
// immediately without needing a prior user gesture.
//
// The service worker sends PLAY_AUDIO / STOP_AUDIO messages.
// ──────────────────────────────────────────────────────

let ctx: AudioContext | undefined;
let currentSource: AudioBufferSourceNode | undefined;
let playGeneration = 0; // incremented on each new play request

function stopAudio(): void {
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = undefined;
  }
}

async function playAudio(base64: string): Promise<void> {
  // Claim this generation slot immediately — stops any decode still in progress
  // from a previous call from starting its source node.
  const generation = ++playGeneration;

  if (!ctx) {
    ctx = new AudioContext();
  }

  // Stop whatever is currently playing
  stopAudio();

  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  try {
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

    // Another play request arrived while we were decoding — abandon this one
    if (generation !== playGeneration) return;

    stopAudio(); // Stop anything that started while we were decoding
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0);
    currentSource      = source;
    source.onended     = () => { if (source === currentSource) currentSource = undefined; };
  } catch (err: any) {
    console.warn('[Safely] Offscreen audio decode failed:', err.message);
  }
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'PLAY_AUDIO') {
    playAudio(message.base64).catch(err =>
      console.warn('[Safely] Offscreen playAudio error:', err),
    );
  }
  if (message.type === 'STOP_AUDIO') {
    stopAudio();
    playGeneration++; // Invalidate any in-progress decode
  }
  return false;
});
