let currentVolume = 1.0;

function executeInMainWorld(func, args) {
    const script = document.createElement('script');
    script.textContent = `(${func.toString()})(...${JSON.stringify(args)});`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
}

function setVolume(val) {
    currentVolume = val;
    executeInMainWorld((v) => {
        // YouTube specific UI Sync
        const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
            ytPlayer.setVolume(v * 100);
            if (typeof ytPlayer.unMute === 'function' && v > 0) ytPlayer.unMute();
        }

        // Generic fallback using native setter
        const nativeVolumeSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume').set;
        document.querySelectorAll('audio, video').forEach(media => {
            nativeVolumeSetter.call(media, v);
        });
    }, [val]);
}

function getVolume() {
    const mediaElements = document.querySelectorAll('audio, video');
    if (mediaElements.length > 0) {
        const playing = Array.from(mediaElements).find(m => !m.paused);
        if (playing) return nativeVolumeGetter.call(playing);
        return nativeVolumeGetter.call(mediaElements[0]);
    }
    return currentVolume;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setVolume') {
        setVolume(request.value);
        sendResponse({ success: true });
        return true;
    } else if (request.action === 'getVolume') {
        sendResponse({ volume: getVolume() });
        return true;
    }
});

// Enforce volume on any new media elements that appear
const observer = new MutationObserver(mutations => {
    let hasNewMedia = false;
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (!node.tagName) continue;
            if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                hasNewMedia = true;
            } else if (node.querySelectorAll) {
                if (node.querySelectorAll('video, audio').length > 0) {
                    hasNewMedia = true;
                }
            }
        }
    }
    if (hasNewMedia) setVolume(currentVolume);
});

const startObserver = () => {
    if (document.body || document.documentElement) {
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } else {
        setTimeout(startObserver, 100);
    }
};

startObserver();
