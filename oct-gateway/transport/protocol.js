function safeParseMessage(data) {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function serializeMessage(payload) {
  return JSON.stringify(payload);
}

module.exports = {
  safeParseMessage,
  serializeMessage,
};
