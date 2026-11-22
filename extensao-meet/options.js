const base = document.getElementById("base");
const tile = document.getElementById("tile");
const msg = document.getElementById("msg");

function show(text, ok) {
  msg.textContent = text;
  msg.className = ok ? "ok" : "err";
}

chrome.storage.sync.get({ baseUrl: "", tile: true }).then((s) => {
  base.value = s.baseUrl;
  tile.checked = s.tile;
});

document.getElementById("save").addEventListener("click", async () => {
  let origin;
  try {
    const u = new URL(base.value.trim());
    if (u.protocol !== "https:") throw new Error("https");
    origin = u.origin;
  } catch {
    show("Informe o endereço completo, começando com https://", false);
    return;
  }
  // Pede permissão só para o endereço do sistema da clínica.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    show("Sem a permissão para acessar o sistema, a extensão não consegue abrir o painel.", false);
    return;
  }
  await chrome.storage.sync.set({ baseUrl: origin, tile: tile.checked });
  show("Salvo. Abra o Meet de uma consulta para testar.", true);
});
