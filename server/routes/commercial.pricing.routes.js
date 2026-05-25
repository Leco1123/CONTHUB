const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const ROOT_DIR = path.resolve(__dirname, "../..");
const PYTHON_SCRIPT = path.join(ROOT_DIR, "scripts", "commercial", "ficha_preco_api.py");

function runPricingAction(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PYTHON_SCRIPT)) {
      reject(new Error("Motor comercial não encontrado."));
      return;
    }

    let stdout = "";
    let stderr = "";

    const child = spawn("py", ["-3", PYTHON_SCRIPT, action], {
      cwd: ROOT_DIR,
      shell: false,
    });

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      let parsed = null;
      try {
        parsed = stdout ? JSON.parse(stdout) : null;
      } catch (_) {}

      if (code !== 0 || !parsed?.ok) {
        const error = new Error(parsed?.error || stderr || "Falha ao executar a automação comercial.");
        error.code = code;
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
        return;
      }

      resolve(parsed.data);
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Erro na automação comercial:", error);
      return res.status(500).json({
        error: error?.message || "Erro interno ao processar a automação comercial.",
      });
    }
  };
}

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    return res.json({
      ok: true,
      scriptExists: fs.existsSync(PYTHON_SCRIPT),
    });
  })
);

router.get(
  "/bootstrap",
  asyncHandler(async (_req, res) => {
    const data = await runPricingAction("bootstrap");
    return res.json(data);
  })
);

router.post(
  "/calculate",
  asyncHandler(async (req, res) => {
    const data = await runPricingAction("calculate", req.body || {});
    return res.json(data);
  })
);

router.get(
  "/proposals",
  asyncHandler(async (req, res) => {
    const data = await runPricingAction("list_proposals", {
      search: String(req.query.search || "").trim(),
    });
    return res.json(data);
  })
);

router.post(
  "/proposals",
  asyncHandler(async (req, res) => {
    const data = await runPricingAction("save_proposal", req.body || {});
    return res.json(data);
  })
);

router.delete(
  "/proposals",
  asyncHandler(async (req, res) => {
    const data = await runPricingAction("delete_proposal", req.body || req.query || {});
    return res.json(data);
  })
);

router.get(
  "/proposals/contract",
  asyncHandler(async (req, res) => {
    const data = await runPricingAction("get_contract", req.query || {});
    return res.download(data.path, data.name);
  })
);

module.exports = router;
