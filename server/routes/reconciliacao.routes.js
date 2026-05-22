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
const PYTHON_FORNECEDORES_SCRIPT = path.join(
  ROOT_DIR,
  "scripts",
  "reconciliador",
  "reconciliador_fornecedores_api.py"
);

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(RECON_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const ALLOWED_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = String(path.extname(file.originalname || "")).toLowerCase();
    const mime = String(file.mimetype || "").toLowerCase();
    const isAllowedExtension = ALLOWED_EXTENSIONS.has(ext);
    const isAllowedMime = !mime || ALLOWED_MIME_TYPES.has(mime);

    if (!isAllowedExtension || !isAllowedMime) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }

    return cb(null, true);
  },
});

function cleanupFile(file) {
  try {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch {}
}

function cleanupFiles(files = []) {
  files.forEach(cleanupFile);
}

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    pythonExists: fs.existsSync(PYTHON_SCRIPT),
    pythonFornecedoresExists: fs.existsSync(PYTHON_FORNECEDORES_SCRIPT),
  });
});

router.get("/fornecedores/health", (req, res) => {
  res.json({
    ok: true,
    pythonExists: fs.existsSync(PYTHON_FORNECEDORES_SCRIPT),
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
    const uploadedFiles = [arquivoContabil, arquivoCliente];

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
      cleanupFiles(uploadedFiles);
      console.error("Erro ao iniciar Python da reconciliação:", err);
      return res.status(500).json({
        error: "Erro interno ao iniciar o processamento.",
      });
    });

    py.on("close", (code) => {
      cleanupFiles(uploadedFiles);

      if (code !== 0) {
        console.error("Falha ao processar reconciliação:", { code, stdout, stderr });
        return res.status(500).json({
          error: "Falha ao processar reconciliação.",
        });
      }

      if (!fs.existsSync(outputPath)) {
        console.error("Reconciliação sem arquivo de saída:", { code, stdout, stderr, outputPath });
        return res.status(500).json({
          error: "O arquivo final não foi gerado.",
        });
      }

      return res.download(outputPath, outputName);
    });
  }
);

router.post(
  "/fornecedores/processar",
  upload.fields([
    { name: "arquivo_contabil", maxCount: 1 },
    { name: "arquivo_fornecedor", maxCount: 1 },
  ]),
  (req, res) => {
    const arquivoContabil = req.files?.arquivo_contabil?.[0];
    const arquivoFornecedor = req.files?.arquivo_fornecedor?.[0];
    const nomeEmpresa = String(req.body?.nome_empresa || "API").trim();
    const usarFuzzy = String(req.body?.usar_fuzzy || "true").trim().toLowerCase() !== "false";
    const limiarFuzzy = String(req.body?.limiar_fuzzy || "0.88").trim();
    const tolerancia = String(req.body?.tolerancia || "0.01").trim();

    if (!arquivoContabil) {
      return res.status(400).json({ error: "Arquivo contábil não enviado." });
    }

    if (!arquivoFornecedor) {
      return res.status(400).json({ error: "Arquivo do fornecedor não enviado." });
    }

    const outputName = `reconciliacao_fornecedores_${Date.now()}.xlsx`;
    const outputPath = path.join(RECON_DIR, outputName);
    const uploadedFiles = [arquivoContabil, arquivoFornecedor];

    let stdout = "";
    let stderr = "";

    const py = spawn(
      "python",
      [
        PYTHON_FORNECEDORES_SCRIPT,
        arquivoContabil.path,
        arquivoFornecedor.path,
        outputPath,
        nomeEmpresa,
        String(usarFuzzy),
        limiarFuzzy,
        tolerancia,
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
      cleanupFiles(uploadedFiles);
      console.error("Erro ao iniciar Python da reconciliação de fornecedores:", err);
      return res.status(500).json({
        error: "Erro interno ao iniciar o processamento.",
      });
    });

    py.on("close", (code) => {
      cleanupFiles(uploadedFiles);

      if (code !== 0) {
        console.error("Falha ao processar reconciliação de fornecedores:", { code, stdout, stderr });
        return res.status(500).json({
          error: "Falha ao processar reconciliação de fornecedores.",
        });
      }

      if (!fs.existsSync(outputPath)) {
        console.error("Reconciliação de fornecedores sem arquivo de saída:", { code, stdout, stderr, outputPath });
        return res.status(500).json({
          error: "O arquivo final não foi gerado.",
        });
      }

      return res.download(outputPath, outputName);
    });
  }
);

router.use((err, req, res, next) => {
  if (!(err instanceof multer.MulterError)) {
    return next(err);
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Arquivo excede o limite de 10 MB." });
  }

  return res.status(400).json({ error: "Tipo de arquivo não permitido. Use CSV, XLS ou XLSX." });
});

module.exports = router;
