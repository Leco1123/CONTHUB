// server/routes/public.customers.routes.js
const express = require("express");
const db = require("../db");

const router = express.Router();

// Honeypot anti-bot: campo "website" deve vir vazio (no form a gente esconde)
function isSpam(body) {
  return body && typeof body.website === "string" && body.website.trim().length > 0;
}

router.post("/register", async (req, res) => {
  try {
    if (isSpam(req.body)) {
      // responde sucesso pra bot não insistir
      return res.status(200).json({ ok: true });
    }

    const { name, email, phone, document } = req.body || {};

    const cleanName = String(name || "").trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanDoc = document ? String(document).trim() : null;

    if (!cleanName) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Email inválido." });
    }

    const created = await db.customer.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        document: cleanDoc,
        // createdById fica null no auto-cadastro
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        document: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ ok: true, customer: created });
  } catch (err) {
    // erro de unique (document)
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Já existe um cadastro com esses dados." });
    }
    console.error("Erro no cadastro de cliente:", err);
    return res.status(500).json({ error: "Erro interno ao cadastrar." });
  }
});

module.exports = router;