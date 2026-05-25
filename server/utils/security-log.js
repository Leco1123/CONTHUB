const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "security-events.log");

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logSecurityEvent(event, details = {}) {
  try {
    ensureLogDir();
    const payload = {
      timestamp: new Date().toISOString(),
      event: String(event || "unknown"),
      details: details && typeof details === "object" ? details : {},
    };
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.warn("Falha ao gravar log de seguranca:", error?.message || error);
  }
}

module.exports = {
  logSecurityEvent,
  LOG_FILE,
};
