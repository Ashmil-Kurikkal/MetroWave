/**
 * @file MetroWave Main Process
 * This file handles backend logic, API communication with YouTube Music,
 * interaction with the file system, and execution of the yt-dlp binary.
 * It securely exposes functionality to the renderer process via IPC.
 */
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const { execFile } = require('child_process'); // SECURITY: Use execFile instead of exec
const fs = require('fs');
const YTMusic = require('ytmusic-api');

// --- INITIALIZATION ---
const ytmusic = new YTMusic();
let currentYtdlpVideoProcess = null;
const ytDlpBinary = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', ytDlpBinary) // Production path
    : path.join(__dirname, 'bin', ytDlpBinary);             // Development path
// =========================================================================
// --- DATA FORMATTING HELPERS ---
// =========================================================================
const getArtistNames = (item) => {
    if (!item) return [];
    if (item.artist?.name) return [item.artist.name];
    if (item.artists?.length) return item.artists.map(a => a.name).filter(Boolean);
    if (item.author?.name) return [item.author.name];
    return [];
};
const formatSong = (item) => item?.videoId && item.name ? { id: item.videoId, title: item.name, artists: getArtistNames(item), thumbnails: item.thumbnails, album: item.album?.name, duration: item.duration, type: 'song' } : null;
const formatVideo = (item) => item?.videoId && item.name ? { id: item.videoId, title: item.name, artists: getArtistNames(item), thumbnails: item.thumbnails, duration: item.duration, type: 'video' } : null;
const formatAlbum = (item) => ({ browseId: item.albumId, title: item.name, artists: getArtistNames(item), year: item.year, thumbnails: item.thumbnails, type: 'album' });
const formatPlaylist = (item) => ({ browseId: item.browseId || item.playlistId, title: item.name, author: item.author || 'Unknown', thumbnails: item.thumbnails, type: 'playlist' });
const formatArtist = (item) => ({ browseId: item.artistId, name: item.name, thumbnails: item.thumbnails, type: 'artist' });

// =========================================================================
// --- API HELPERS ---
// =========================================================================
const initializeApi = async (countryCode = 'US') => {
    await ytmusic.initialize({ GL: countryCode, HL: 'en' });
};

// =========================================================================
// --- IPC API HANDLERS ---
// =========================================================================

/**
 * Fetches sections for the Home/Explore page.
 * NOTE: This function correctly loads all available sections from the API
 * while filtering out known problematic "radio" playlists, ensuring the
 * Explore page populates with content as intended.
 */
ipcMain.handle('get-home-sections', async (event, countryCode) => {
    try {
        await initializeApi(countryCode);
        const sections = await ytmusic.getHomeSections();
        
        // This logic shows all sections but intelligently filters out the broken items.
        return sections.map(section => {
            if (!section?.contents) return null;

            // This filter specifically removes the problematic "radio" playlists.
            const filteredContents = section.contents.filter(item => {
                return !(item?.playlistId?.startsWith('RD'));
            });

            const contents = filteredContents.map(item => {
                if (!item) return null;
                switch (item.type) {
                    case 'SONG': return formatSong(item);
                    case 'VIDEO': return formatVideo(item);
                    case 'ALBUM': return formatAlbum(item);
                    case 'PLAYLIST': return formatPlaylist(item);
                    case 'ARTIST': return formatArtist(item);
                    default: return null;
                }
            }).filter(Boolean);

            if (contents.length === 0) return null;
            return { title: section.title, contents };
        }).filter(Boolean);
            
    } catch (error) {
        console.error('[API ERROR] Failed to get home sections:', error);
        return [];
    }
});

ipcMain.handle('get-search-suggestions', async (event, query, countryCode) => {
    if (!query) return [];
    try {
        await initializeApi(countryCode);
        return await ytmusic.getSearchSuggestions(query);
    } catch (error) { 
        console.error('[API ERROR] Failed to get search suggestions:', error);
        return []; 
    }
});

ipcMain.handle('search-youtube', async (event, query, countryCode) => {
    try {
        await initializeApi(countryCode);
        const [songs, albums, playlists, videos] = await Promise.all([
            ytmusic.searchSongs(query),
            ytmusic.searchAlbums(query),
            ytmusic.searchPlaylists(query),
            ytmusic.searchVideos(query)
        ]);
        return {
            songs: songs.map(formatSong).filter(Boolean),
            collections: [...albums.map(formatAlbum), ...playlists.map(formatPlaylist)].filter(Boolean),
            videos: videos.map(formatVideo).filter(Boolean)
        };
    } catch (error) {
        console.error('[API ERROR] Error during search:', error);
        return { songs: [], collections: [], videos: [] };
    }
});

/**
 * Fetches details for an album or playlist.
 * NOTE: This will gracefully fail (return null) for "radio" playlists (IDs starting with 'RD'),
 * preventing the application from crashing.
 */
ipcMain.handle('get-browse-details', async (event, { id, type }, countryCode) => {
    if (!id || !type) return null;
    try {
        await initializeApi(countryCode);
        let response;
        if (type === 'album') {
            response = await ytmusic.getAlbum(id);
        } else if (type === 'playlist') {
            response = await ytmusic.getPlaylist(id);
        } else {
            return null;
        }
        return {
            title: response.name,
            thumbnails: response.thumbnails,
            artist: response.artist?.name || response.author || 'Various Artists',
            tracks: (response.tracks || response.songs || []).map(formatSong).filter(Boolean)
        };
    } catch (error) {
        console.error(`[API ERROR] Failed to get browse details for ${type} with ID ${id}:`, error);
        return null;
    }
});

ipcMain.handle('get-up-nexts', async (event, videoId, countryCode) => {
    if (!videoId) return [];
    try {
        await initializeApi(countryCode);
        const upNexts = await ytmusic.getUpNexts(videoId);
        return Array.isArray(upNexts) ? upNexts.map(song => ({
            id: song.videoId, title: song.title, artists: song.artists,
            thumbnails: [{ url: song.thumbnail }], duration: song.duration, type: 'song'
        })).filter(Boolean) : [];
    } catch (error) {
        console.error(`[API ERROR] Failed to get up nexts for ${videoId}:`, error);
        return [];
    }
});

// =========================================================================
// --- YT-DLP & FILE SYSTEM HANDLERS (SECURED) ---
// =========================================================================

/**
 * SECURITY: Uses execFile to safely get an audio stream URL, preventing command injection.
 */
ipcMain.handle('get-audio-stream', (event, videoId) => new Promise(resolve => {
    if (!videoId) return resolve(null);
    const args = ['-f', 'bestaudio', '-g', `https://www.youtube.com/watch?v=${videoId}`];
    execFile(ytDlpPath, args, (err, stdout) => {
        if (err) { console.error(`[YTDLP ERROR] Audio stream for ${videoId}:`, err); return resolve(null); }
        resolve(stdout.trim());
    });
}));

/**
 * SECURITY: Uses execFile to safely get a video stream URL.
 */
ipcMain.handle('get-video-stream', (event, videoId) => new Promise(resolve => {
    if (!videoId) return resolve(null);
    const args = ['-f', 'best', '-g', `https://www.youtube.com/watch?v=${videoId}`];
    currentYtdlpVideoProcess = execFile(ytDlpPath, args, (err, stdout) => {
        if (err) { console.error(`[YTDLP ERROR] Video stream for ${videoId}:`, err); return resolve(null); }
        resolve(stdout.trim());
    });
}));

ipcMain.on('cancel-video-stream', () => {
    if (currentYtdlpVideoProcess) {
        currentYtdlpVideoProcess.kill();
        currentYtdlpVideoProcess = null;
    }
});

/**
 * SECURITY: Uses execFile to safely download an audio file.
 */
ipcMain.handle('download-audio', (event, videoId, filename) => new Promise(async (resolve, reject) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Audio As',
        defaultPath: filename.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim() + '.mp3',
        filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }]
    });
    if (canceled || !filePath) return reject(new Error("User canceled."));

    const args = [
        '-f', 'bestaudio', '--extract-audio', '--audio-format', 'mp3',
        '--audio-quality', '192K', '-o', filePath,
        `https://www.youtube.com/watch?v=${videoId}`
    ];
    execFile(ytDlpPath, args, (err) => {
        if (err) { console.error(`[YTDLP DOWNLOAD ERROR] for ${videoId}:`, err); reject(new Error("Download failed")); }
        else resolve(filePath);
    });
}));

ipcMain.handle('export-playlist', async (event, playlistJSON) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Export Playlist',
        defaultPath: `playlist-${JSON.parse(playlistJSON).name.replace(/[^a-z0-9]/gi, '_')}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { success: false, error: 'User canceled.' };
    try {
        fs.writeFileSync(filePath, playlistJSON);
        return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('import-playlist', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Import Playlist', properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (canceled || !filePaths?.length) return { success: false, error: 'User canceled.' };
    try {
        return { success: true, data: fs.readFileSync(filePaths[0], 'utf-8') };
    } catch (error) { return { success: false, error: error.message }; }
});

// =========================================================================
// --- WINDOW CONTROLS ---
// =========================================================================
ipcMain.on('minimize-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window.minimize();
});

ipcMain.on('maximize-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window.isMaximized()) {
        window.unmaximize();
    } else {
        window.maximize();
    }
});

ipcMain.on('close-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window.close();
});

// =========================================================================
// --- EXTERNAL LINKS LIKE CONNECT WITH ME HANDLER ---
// =========================================================================

ipcMain.on('open-external-link', (event, url) => {
    // Security check to ensure only http/https protocols are opened
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
    }
});

// =========================================================================
// --- ELECTRON WINDOW AND APP LIFECYCLE ---
// =========================================================================
function createWindow() {
    const win = new BrowserWindow({
        width: 1280, height: 720, minWidth: 940, minHeight: 600,
        backgroundColor: '#121212',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assets/icons/icon.png'),
        frame: false, // Create a frameless window
        titleBarStyle: 'hidden'
    });
    win.setMenuBarVisibility(false);

    // Send maximize/unmaximize events to the renderer
    win.on('maximize', () => win.webContents.send('is-maximized-changed', true));
    win.on('unmaximize', () => win.webContents.send('is-maximized-changed', false));
    
    win.loadFile('index.html');
}

app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; media-src https://*.googlevideo.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; object-src 'none'; frame-ancestors 'none';"
                ]
            }
        });
    });
    createWindow();
});

app.on('activate', () => { 
    if (BrowserWindow.getAllWindows().length === 0) createWindow(); 
});

app.on('window-all-closed', () => { 
    if (process.platform !== 'darwin') app.quit(); 
});