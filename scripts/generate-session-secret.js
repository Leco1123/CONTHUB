const crypto = require("crypto");

const bytes = crypto.randomBytes(48);
const secret = bytes.toString("base64url");

process.stdout.write(`${secret}\n`);
