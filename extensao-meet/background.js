// Reconhece uma sala do Google Meet e abre ao lado o painel de atendimento da consulta.
// A extensão só lê o ENDEREÇO da aba do Meet (o código da sala). Não lê vídeo, áudio nem a página.

const CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

function meetCode(url) {
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() !== "meet.google.com") return null;
    const first = (u.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
    return CODE.test(first) ? first : null;
  } catch {
    return null;
  }
}

async function settings() {
  const s = await chrome.storage.sync.get({ baseUrl: "", tile: true });
  return s;
}

// Janelas do painel por aba do Meet (memória do service worker + sessão, para não duplicar).
async function getPanels() {
  const s = await chrome.storage.session.get({ panels: {} });
  return s.panels;
}
async function setPanel(tabId, value) {
  const panels = await getPanels();
  if (value === null) delete panels[tabId];
  else panels[tabId] = value;
  await chrome.storage.session.set({ panels });
}

async function badge(tabId, text, title) {
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#b45309" });
  await chrome.action.setTitle({ tabId, title });
}

async function openPanel(tab, appointmentId, base, tile) {
  const url = `${base}/atendimento/${appointmentId}`;
  const panels = await getPanels();
  const existing = panels[tab.id];
  if (existing) {
    try {
      await chrome.windows.update(existing.windowId, { focused: true });
      const [t] = await chrome.tabs.query({ windowId: existing.windowId });
      if (t && t.url !== url) await chrome.tabs.update(t.id, { url });
      return;
    } catch {
      await setPanel(tab.id, null);
    }
  }

  const displays = await chrome.system.display.getInfo();
  const d = (displays.find((x) => x.isPrimary) || displays[0]).workArea;
  const panelWidth = Math.round(d.width * 0.4);
  const win = await chrome.windows.create({
    url,
    type: "popup",
    left: d.left + d.width - panelWidth,
    top: d.top,
    width: panelWidth,
    height: d.height,
    focused: false,
  });
  await setPanel(tab.id, { windowId: win.id });
  if (tile) {
    try {
      await chrome.windows.update(tab.windowId, { state: "normal", left: d.left, top: d.top, width: d.width - panelWidth, height: d.height });
    } catch {
      // Se não for possível ajustar a janela do Meet, o painel continua aberto.
    }
  }
}

async function resolveAndOpen(tab, manual) {
  const code = meetCode(tab.url || "");
  if (!code) return;
  const { baseUrl, tile } = await settings();
  if (!baseUrl) {
    chrome.runtime.openOptionsPage();
    return;
  }

  let res;
  try {
    res = await fetch(`${baseUrl}/api/atendimento/resolver?codigo=${encodeURIComponent(code)}`, { credentials: "include" });
  } catch {
    await badge(tab.id, "!", "Sem conexão com o sistema");
    return;
  }
  if (res.status === 401) {
    await badge(tab.id, "!", "Entre no sistema para abrir o painel");
    if (manual) chrome.tabs.create({ url: `${baseUrl}/login` });
    return;
  }
  if (res.status === 403) {
    await badge(tab.id, "!", "Este usuário não é profissional");
    return;
  }
  if (res.status === 404) {
    await badge(tab.id, "?", "Nenhuma consulta sua usa este link do Meet");
    return;
  }
  if (!res.ok) {
    await badge(tab.id, "!", "Não foi possível consultar o sistema");
    return;
  }
  const data = await res.json();
  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await openPanel(tab, data.appointmentId, baseUrl, tile);
}

// Abre sozinha uma vez por aba e sala.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  const code = meetCode(tab.url || "");
  if (!code) return;
  const key = `${tabId}:${code}`;
  const { handled } = await chrome.storage.session.get({ handled: {} });
  if (handled[key]) return;
  handled[key] = true;
  await chrome.storage.session.set({ handled });
  resolveAndOpen(tab, false);
});

// Clique no ícone: tenta de novo (ou pede o login).
chrome.action.onClicked.addListener((tab) => {
  if (meetCode(tab.url || "")) resolveAndOpen(tab, true);
  else chrome.runtime.openOptionsPage();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const panels = await getPanels();
  const p = panels[tabId];
  if (p) {
    try {
      await chrome.windows.remove(p.windowId);
    } catch {
      // A janela já foi fechada.
    }
    await setPanel(tabId, null);
  }
  const { handled } = await chrome.storage.session.get({ handled: {} });
  for (const k of Object.keys(handled)) if (k.startsWith(`${tabId}:`)) delete handled[k];
  await chrome.storage.session.set({ handled });
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") chrome.runtime.openOptionsPage();
});
