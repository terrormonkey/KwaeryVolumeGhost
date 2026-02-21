const globalSlider = document.getElementById('globalSlider');
const globalFill = document.getElementById('globalFill');
const globalValue = document.getElementById('globalValue');
const domainList = document.getElementById('domainList');
const tabManagerToggle = document.getElementById('tabManagerToggle');
const chevron = document.getElementById('chevron');

// ── Helpers ──

function updateSliderUI(slider, fill, display, value) {
  fill.style.width = `${value}%`;
  display.textContent = `${value}%`;
  slider.value = value;
}

function getRootDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    // strip "www."
    return hostname.replace(/^www\./, '');
  } catch { return null; }
}

// Injected into pages to set volume
const setVolumeScript = (vol) => {
  const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
    ytPlayer.setVolume(vol * 100);
    if (typeof ytPlayer.unMute === 'function' && vol > 0) ytPlayer.unMute();
  }

  const setter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume').set;
  document.querySelectorAll('audio, video').forEach(m => setter.call(m, vol));
};

// ── Persistence ──

function saveGlobal(val) {
  chrome.storage.local.set({ globalVolume: val });
}

function saveDomainVolume(domain, val) {
  chrome.storage.local.get('domainVolumes', (data) => {
    const vols = data.domainVolumes || {};
    vols[domain] = val;
    chrome.storage.local.set({ domainVolumes: vols });
  });
}

// ── Apply volume to tabs ──

function applyGlobalToAllTabs(globalVol) {
  // Get domain volumes so effective = global * domain
  chrome.storage.local.get('domainVolumes', (data) => {
    const domainVols = data.domainVolumes || {};

    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE || !tab.url) continue;
        const domain = getRootDomain(tab.url);
        const domainVol = (domain && domainVols[domain] !== undefined) ? domainVols[domain] : 1;
        const effective = globalVol * domainVol;

        chrome.tabs.sendMessage(tab.id, { action: 'setVolume', value: effective }, () => {
          if (chrome.runtime.lastError) { }
        });
        chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          world: "MAIN",
          func: setVolumeScript,
          args: [effective]
        }).catch(() => { });
      }
    });
  });
}

function applyDomainVolume(domain, domainVol) {
  chrome.storage.local.get('globalVolume', (data) => {
    const globalVol = data.globalVolume !== undefined ? data.globalVolume : 1;
    const effective = globalVol * domainVol;

    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        const d = getRootDomain(tab.url);
        if (d === domain) {
          chrome.tabs.sendMessage(tab.id, { action: 'setVolume', value: effective }, () => {
            if (chrome.runtime.lastError) { }
          });
          chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            world: "MAIN",
            func: setVolumeScript,
            args: [effective]
          }).catch(() => { });
        }
      }
    });
  });
}

// ── Build domain entries ──

function buildDomainList(domains, domainVolumes) {
  domainList.innerHTML = '';

  if (domains.length === 0) {
    domainList.innerHTML = '<div class="empty-state">No open sites</div>';
    return;
  }

  domains.sort().forEach(domain => {
    const vol = domainVolumes[domain] !== undefined ? Math.round(domainVolumes[domain] * 100) : 100;

    const entry = document.createElement('div');
    entry.className = 'domain-entry';

    entry.innerHTML = `
      <div class="domain-name">${domain}</div>
      <div class="domain-slider-row">
        <div class="slider-wrapper">
          <div class="slider-track-bg"></div>
          <div class="slider-track-fill" style="width:${vol}%"></div>
          <input type="range" min="0" max="100" value="${vol}" class="slider" data-domain="${domain}">
        </div>
        <span class="domain-value">${vol}%</span>
      </div>
    `;

    const slider = entry.querySelector('input[type=range]');
    const fill = entry.querySelector('.slider-track-fill');
    const display = entry.querySelector('.domain-value');

    slider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      fill.style.width = `${v}%`;
      display.textContent = `${v}%`;
      const domainVol = v / 100;
      saveDomainVolume(domain, domainVol);
      applyDomainVolume(domain, domainVol);
    });

    domainList.appendChild(entry);
  });
}

// ── Tab Manager Toggle ──

let managerOpen = true;

tabManagerToggle.addEventListener('click', () => {
  managerOpen = !managerOpen;
  if (managerOpen) {
    domainList.classList.remove('collapsed');
    chevron.classList.remove('collapsed');
  } else {
    domainList.classList.add('collapsed');
    chevron.classList.add('collapsed');
  }
});

// ── Global slider ──

globalSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  globalFill.style.width = `${val}%`;
  globalValue.textContent = `${val}%`;
  const globalVol = val / 100;
  saveGlobal(globalVol);
  applyGlobalToAllTabs(globalVol);
});

// ── Init ──

chrome.storage.local.get(['globalVolume', 'domainVolumes'], (data) => {
  const globalVol = data.globalVolume !== undefined ? data.globalVolume : 1;
  const domainVolumes = data.domainVolumes || {};

  updateSliderUI(globalSlider, globalFill, globalValue, Math.round(globalVol * 100));

  // Collect unique root domains from all tabs
  chrome.tabs.query({}, (tabs) => {
    const domains = new Set();
    for (const tab of tabs) {
      if (!tab.url) continue;
      const d = getRootDomain(tab.url);
      if (d && !d.startsWith('chrome') && !d.startsWith('edge') && d !== 'newtab' && d !== 'extensions') {
        domains.add(d);
      }
    }
    buildDomainList([...domains], domainVolumes);
  });
});
