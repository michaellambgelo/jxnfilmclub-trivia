// Cross-window messaging between the display window (/) and control window (#/control).
// Same-origin BroadcastChannel: no server, no setup, instantaneous.

import { useEffect } from 'react';

const CHANNEL_NAME = 'jxnfilmclub-trivia';

let _channel = null;
function getChannel() {
  if (!_channel) _channel = new BroadcastChannel(CHANNEL_NAME);
  return _channel;
}

export function broadcast(type, payload) {
  getChannel().postMessage({ type, payload });
}

// Subscribe to broadcast messages. handler receives ({ type, payload }).
export function useBroadcast(handler) {
  useEffect(() => {
    const ch = getChannel();
    const wrapped = (e) => handler(e.data);
    ch.addEventListener('message', wrapped);
    return () => ch.removeEventListener('message', wrapped);
  }, [handler]);
}
