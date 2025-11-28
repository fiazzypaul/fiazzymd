function validateInput(input) {
  const s = String(input || '').toLowerCase();
  return ['on', 'off', 'typing', 'recording', 'online', 'composing', 'available', 'paused'].includes(s);
}

function mapInputToState(input) {
  const s = String(input || '').toLowerCase();
  if (s === 'on') return 'composing';
  if (s === 'off') return 'paused';
  if (s === 'typing' || s === 'composing') return 'composing';
  if (s === 'recording' || s === 'record') return 'recording';
  if (s === 'online' || s === 'available') return 'available';
  if (s === 'paused' || s === 'stop') return 'paused';
  return null;
}

module.exports = { validateInput, mapInputToState };