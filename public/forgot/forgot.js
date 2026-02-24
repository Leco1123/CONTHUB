const form = document.getElementById("forgotForm");
const msg = document.getElementById("msg");

function showMsg(text) {
  msg.textContent = text;
  msg.classList.remove("hidden");
}
function clearMsg() {
  msg.textContent = "";
  msg.classList.add("hidden");
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg();

  const email = String(form.email?.value || "").trim();
  if (!email) return showMsg("Informe o email.");

  try {
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    // mensagem genérica por segurança
    showMsg("Se este email existir, o link de redefinição será gerado.");
  } catch {
    showMsg("Se este email existir, o link de redefinição será gerado.");
  }
});
