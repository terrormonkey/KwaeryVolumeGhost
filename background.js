// Background service worker
// Automatically applies stored volumes when tabs navigate or load

function getRootDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch { return null; }
}

function applyStoredVolume(tabId, url) {
    const domain = getRootDomain(url);
    if (!domain) return;

    chrome.storage.local.get(['globalVolume', 'domainVolumes'], (data) => {
        const globalVol = data.globalVolume !== undefined ? data.globalVolume : 1;
        const domainVols = data.domainVolumes || {};
        const domainVol = domainVols[domain] !== undefined ? domainVols[domain] : 1;
        const effective = globalVol * domainVol;

        // Small delay to let media elements load
        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                func: (vol) => {
                    const setter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume').set;
                    document.querySelectorAll('audio, video').forEach(m => setter.call(m, vol));
                },
                args: [effective]
            }).catch(() => { });

            chrome.tabs.sendMessage(tabId, { action: 'setVolume', value: effective }, () => {
                if (chrome.runtime.lastError) { }
            });
        }, 500);
    });
}

// Apply volume when a tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        applyStoredVolume(tabId, tab.url);
    }
});

// Also re-apply a bit later for lazy-loaded media (e.g. YouTube)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        setTimeout(() => applyStoredVolume(tabId, tab.url), 2500);
    }
});
