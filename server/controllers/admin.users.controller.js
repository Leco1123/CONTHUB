// server/controllers/admin.users.controller.js
const bcrypt = require("bcryptjs");
const Users = require("../services/admin.users.service");

async function getUsers(req, res) {
  try {
    const users = await Users.listUsers();
    return res.json(users);
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    return res.status(500).json({ message: "Erro ao listar usuários." });
  }
}

async function postUser(req, res) {
  try {
    const { name, email, password, role = "user", active = 1 } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Campos obrigatórios faltando." });
    }

    const hash = await bcrypt.hash(String(password), 10);

    const id = await Users.createUser({
      name,
      email,
      passwordHash: hash, // ✅ correto
      role,
      active,
    });

    return res.json({ ok: true, id });
  } catch (err) {
    console.error("Erro ao criar usuário:", err);

    // Se quiser, dá pra tratar email duplicado aqui no futuro
    return res.status(500).json({ message: "Erro ao criar usuário." });
  }
}

async function putUser(req, res) {
  try {
    const id = Number(req.params.id);
    const { name, email, role, active } = req.body || {};

    if (!id) {
      return res.status(400).json({ message: "ID inválido." });
    }

    await Users.updateUser(id, { name, email, role, active });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao editar usuário:", err);
    return res.status(500).json({ message: "Erro ao editar usuário." });
  }
}

async function postResetPassword(req, res) {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body || {};

    if (!id) {
      return res.status(400).json({ message: "ID inválido." });
    }

    if (!newPassword) {
      return res.status(400).json({ message: "Senha obrigatória." });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);

    await Users.resetPassword(id, hash);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao redefinir senha:", err);
    return res.status(500).json({ message: "Erro ao redefinir senha." });
  }
}

module.exports = {
  getUsers,
  postUser,
  putUser,
  postResetPassword,
};
