const siteInput = document.getElementById("siteInput");
const intervalInput = document.getElementById("intervalInput");
const allowInput = document.getElementById("allowInput");
const addSiteBtn = document.getElementById("addSite");
const siteList = document.getElementById("siteList");

// Normaliza domínio
function extractDomain(url) {
  try {
    if (!url.startsWith("http")) url = "http://" + url;
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

// Renderiza lista
function renderSites() {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    siteList.innerHTML = "";
    const sites = result.blockedSites || [];
    sites.forEach((siteObj, index) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${siteObj.domain}</span>
        <span>Bloqueio: ${siteObj.interval}m Permite: ${siteObj.allow}m</span>
      `;
      const removeBtn = document.createElement("button");
      removeBtn.className = "btn-remove-list";
      removeBtn.textContent = "Remover";
      removeBtn.onclick = () => removeSite(index);
      li.appendChild(removeBtn);
      siteList.appendChild(li);
    });
  });
}

// Adiciona site
function addSite() {
  const domain = extractDomain(siteInput.value.trim());
  const interval = parseInt(intervalInput.value);
  const allow = parseInt(allowInput.value);

  if (!domain || isNaN(interval) || isNaN(allow)) return;

  chrome.storage.sync.get(["blockedSites"], (result) => {
    const sites = result.blockedSites || [];
    if (!sites.some(s => s.domain === domain)) {
      sites.push({ domain, interval, allow, lastAccess: 0 });
      chrome.storage.sync.set({ blockedSites: sites }, renderSites);
    }
  });

  siteInput.value = "";
  intervalInput.value = "";
  allowInput.value = "";
}

// Remove site
function removeSite(index) {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const sites = result.blockedSites || [];
    sites.splice(index, 1);
    chrome.storage.sync.set({ blockedSites: sites }, renderSites);
  });
}

addSiteBtn.addEventListener("click", addSite);
renderSites();
