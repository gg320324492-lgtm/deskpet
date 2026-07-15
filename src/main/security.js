'use strict';

const { pathToFileURL } = require('node:url');

/**
 * Keep a renderer on its packaged local document and deny popups/webviews.
 * Navigation is not a feature of either application window.
 */
function lockDownWebContents(win, htmlPath) {
    const allowedUrl = pathToFileURL(htmlPath).href;
    const isAllowed = (url) => url === allowedUrl;

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-attach-webview', (event) => event.preventDefault());
    win.webContents.on('will-navigate', (event, url) => {
        if (!isAllowed(url)) event.preventDefault();
    });
    win.webContents.on('will-redirect', (event, url) => {
        if (!isAllowed(url)) event.preventDefault();
    });
}

module.exports = { lockDownWebContents };
