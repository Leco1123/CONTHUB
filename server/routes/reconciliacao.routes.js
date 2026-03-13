const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const ROOT_DIR = path.resolve(__dirname, "../..");
const UPLOADS_DIR = path.join(ROOT_DIR, "generated", "uploads");
const RECON_DIR = path.join(ROOT_DIR, "generated", "reconciliacoes");
const PYTHON_SCRIPT = path.join(
  ROOT_DIR,
  "scripts",
  "reconciliador",
  "reconciliador_api.py"
);

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(RECON_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = path
      .basename(file.originalname || "arquivo", ext)
      .replace(/[^a-zA-Z0-9-_]/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
});

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    pythonScript: PYTHON_SCRIPT,
    pythonExists: fs.existsSync(PYTHON_SCRIPT),
    uploadsDir: UPLOADS_DIR,
    reconDir: RECON_DIR,
  });
});

router.post(
  "/processar",
  upload.fields([
    { name: "arquivo_contabil", maxCount: 1 },
    { name: "arquivo_cliente", maxCount: 1 },
  ]),
  (req, res) => {
    const arquivoContabil = req.files?.arquivo_contabil?.[0];
    const arquivoCliente = req.files?.arquivo_cliente?.[0];
    const nomeEmpresa = String(req.body?.nome_empresa || "API").trim();

    if (!arquivoContabil) {
      return res.status(400).json({ error: "Arquivo contábil não enviado." });
    }

    if (!arquivoCliente) {
      return res.status(400).json({ error: "Arquivo do cliente não enviado." });
    }

    const outputName = `reconciliacao_${Date.now()}.xlsx`;
    const outputPath = path.join(RECON_DIR, outputName);

    let stdout = "";
    let stderr = "";

    const py = spawn(
      "python",
      [
        PYTHON_SCRIPT,
        arquivoContabil.path,
        arquivoCliente.path,
        outputPath,
        nomeEmpresa,
      ],
      {
        cwd: ROOT_DIR,
        shell: false,
      }
    );

    py.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    py.on("error", (err) => {
      return res.status(500).json({
        error: "Erro ao iniciar Python",
        detail: err.message,
      });
    });

    py.on("close", (code) => {
      try {
        if (arquivoContabil?.path && fs.existsSync(arquivoContabil.path)) {
          fs.unlinkSync(arquivoContabil.path);
        }
      } catch {}

      try {
        if (arquivoCliente?.path && fs.existsSync(arquivoCliente.path)) {
          fs.unlinkSync(arquivoCliente.path);
        }
      } catch {}

      if (code !== 0) {
        return res.status(500).json({
          error: "Falha ao processar reconciliação.",
          code,
          stdout,
          stderr,
        });
      }

      if (!fs.existsSync(outputPath)) {
        return res.status(500).json({
          error: "O arquivo final não foi gerado.",
          stdout,
          stderr,
        });
      }

      return res.download(outputPath, outputName);
    });
  }
);

module.exports = router;