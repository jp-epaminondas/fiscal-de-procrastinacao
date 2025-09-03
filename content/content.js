let intervalTimer = null, allowTimer = null;
let isBlocked = false;
let overlayElem = null, allowElem = null;

// Formata segundos para MM:SS
function formatTime(sec) {
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// Garante que o DOM está pronto
function onDOMReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
}

// Garante que o body existe antes de executar callback
function waitForBody(callback) {
  if (document.body) {
    callback();
  } else {
    const observer = new MutationObserver((mutations, obs) => {
      if (document.body) {
        obs.disconnect();
        callback();
      }
    });
    observer.observe(document.documentElement, {childList: true});
  }
}

// Cria overlay bloqueio
function createOverlay(remaining) {
  if (!overlayElem) {
    overlayElem = document.createElement('div');
    overlayElem.id = 'fiscal-overlay';
    overlayElem.innerHTML = `
      <h1 class="text-fiscal-overlay mtt-10">Site bloqueado!</h1>
      <p id="overlay-timer">${formatTime(remaining)}</p>
    `;

    // Função que efetivamente anexa o overlay quando o body existir
    const attachOverlay = () => {
      if (!document.body.contains(overlayElem)) {
        document.body.appendChild(overlayElem);
        document.body.style.overflow = 'hidden';
      }
    };

    if (document.body) {
      attachOverlay();
    } else {
      // Se não existir body ainda, observa até criar
      const observer = new MutationObserver((mutations, obs) => {
        if (document.body) {
          attachOverlay();
          obs.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }

    const obs2 = new MutationObserver(() => {
      if (isBlocked && document.body && !document.body.contains(overlayElem)) {
        document.body.appendChild(overlayElem);
        document.documentElement.style.overflow = "hidden"; 
        document.body.style.overflow = "hidden";           
        document.body.style.position = "fixed";            
        document.body.style.width = "100%";                
        document.documentElement.style.scrollbarWidth = "none";
      }
    });
    if (document.body) obs2.observe(document.body, { childList: true });
  }

  if (overlayElem) {
    const timerElem = overlayElem.querySelector('#overlay-timer');
    if (timerElem) timerElem.innerText = formatTime(remaining);
  }
}


// Remove overlay
function removeOverlay() {
  if (overlayElem) overlayElem.remove();
  overlayElem = null;
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.width = "";
  document.documentElement.style.scrollbarWidth = "";
}

// Cria timer liberado
function createAllowTimer(remaining) {
  try {
    if (!allowElem || !document.body.contains(allowElem)) {
      allowElem = document.createElement('div');
      allowElem.id = 'allow-timer';

      if (document.body) {
        document.body.appendChild(allowElem);
      } else {
        const observer = new MutationObserver((mutations, obs) => {
          if (document.body) {
            document.body.appendChild(allowElem);
            obs.disconnect();
          }
        });
        observer.observe(document.documentElement, { childList: true });
      }
    }
    if (allowElem) {
      allowElem.innerText = `Tempo restante: ${formatTime(remaining)}`;
    }
  } catch (e) {
    console.warn("Falha ao criar allow timer:", e);
  }
}


// Remove timer liberado
function removeAllowTimer() {
  if (allowElem) allowElem.remove();
  allowElem = null;
}

// Salva site no storage corretamente
function saveSite(site, callback) {
  chrome.storage.sync.get(['blockedSites'], (res)=>{
    const sites = res.blockedSites || [];
    const idx = sites.findIndex(s => s.domain === site.domain);
    if (idx > -1) sites[idx] = site;
    else sites.push(site);
    chrome.storage.sync.set({blockedSites: sites}, callback);
  });
}

// Inicia bloqueio
function startBlock(site) {
  clearInterval(intervalTimer);
  clearInterval(allowTimer);
  removeAllowTimer();
  isBlocked = true;

  const now = Date.now();
  const startBlockTime = site.lastAccess || now;
  const endTime = startBlockTime + site.interval*60*1000;
  let remaining = Math.max(0, Math.ceil((endTime - now)/1000));

  createOverlay(remaining);

  intervalTimer = setInterval(() => {
    remaining = Math.ceil((endTime - Date.now())/1000);
    if (remaining <= 0) {
      clearInterval(intervalTimer);
      isBlocked = false;
      removeOverlay();
      site.lastAccess = Date.now();
      saveSite(site, () => startAllow(site));
    } else {
      createOverlay(remaining);
    }
  }, 1000);
}

// Inicia liberação
function startAllow(site) {
  clearInterval(intervalTimer);
  clearInterval(allowTimer);
  removeOverlay();
  removeAllowTimer();

  const now = Date.now();

  if (!site.allowEnd || site.allowEnd < now) {
    site.allowEnd = now + site.allow*60*1000;
    saveSite(site);
  }

  let remaining = Math.max(0, Math.ceil((site.allowEnd - now)/1000));
  createAllowTimer(remaining);

  allowTimer = setInterval(() => {
    remaining = Math.ceil((site.allowEnd - Date.now())/1000);
    if (remaining <= 0) {
      clearInterval(allowTimer);
      removeAllowTimer();
      site.lastAccess = Date.now();
      site.allowEnd = null;
      saveSite(site, () => startBlock(site));
    } else {
      createAllowTimer(remaining);
    }
  }, 1000);
}

// Inicializa checagem
function init() {
  chrome.storage.sync.get(["blockedSites"], (res)=>{
    const sites = res.blockedSites || [];
    const host = window.location.hostname.replace(/^www\./,'');
    const site = sites.find(s=>host.includes(s.domain));
    if (!site) return;

    const now = Date.now();
    const intervalEnd = (site.lastAccess || 0) + site.interval*60*1000;

    if (site.allowEnd && now < site.allowEnd) {
      startAllow(site);
    } else if (now < intervalEnd) {
      startBlock(site);
    } else {
      site.lastAccess = now;
      site.allowEnd = null;
      saveSite(site, ()=>startBlock(site));
    }
  });
}

onDOMReady(() => {
  init();

  // Observa mudanças no storage para aplicar/desaplicar bloqueio instantaneamente
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    const host = window.location.hostname.replace(/^www\./, '');
    if (changes.blockedSites) {
      const newSites = changes.blockedSites.newValue || [];
      const oldSites = changes.blockedSites.oldValue || [];

      const site = newSites.find(s => host.includes(s.domain));
      if (site) {
        const now = Date.now();
        const intervalEnd = (site.lastAccess || 0) + site.interval * 60 * 1000;

        if (site.allowEnd && now < site.allowEnd) {
          startAllow(site);
        } else if (now < intervalEnd) {
          startBlock(site);
        } else {
          site.lastAccess = now;
          site.allowEnd = null;
          saveSite(site, () => startBlock(site));
        }
        return;
      }

      const wasRemoved =
        oldSites.some(s => host.includes(s.domain)) &&
        !newSites.some(s => host.includes(s.domain));

      if (wasRemoved) {
        clearInterval(intervalTimer);
        clearInterval(allowTimer);
        removeOverlay();
        removeAllowTimer();
        isBlocked = false;
      }
    }
  });
});
