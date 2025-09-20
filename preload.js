/**
 * @file Preload script for the Electron application.
 *
 * This script runs in a privileged environment before the renderer process is loaded.
 * It uses the `contextBridge` to securely expose a limited, well-defined API
 * from the main process to the renderer process, without exposing Node.js globals.
 * This is a critical security feature of modern Electron apps.
 */
const { contextBridge, ipcRenderer } = require('electron');

// --- Helper for Input Validation ---

/**
 * Validates a YouTube video ID format.
 * @param {any} videoId The video ID to validate.
 * @returns {boolean} True if the video ID is a valid string.
 */
const isValidVideoId = (videoId) => {
  // A basic check to ensure the ID is a string of expected length and characters.
  return typeof videoId === 'string' && videoId.length === 11 && /^[a-zA-Z0-9_-]+$/.test(videoId);
};


// --- Expose a secure API to the Renderer Process ---

contextBridge.exposeInMainWorld('electronAPI', {

  // --- Search and Browse ---

  /**
   * Performs a search on YouTube Music.
   * @param {string} query The search query.
   * @param {string} countryCode The user's country code for localized results.
   * @returns {Promise<object>} A promise that resolves with the search results.
   */
  searchYoutube: (query, countryCode) => ipcRenderer.invoke('search-youtube', query, countryCode),

  /**
   * Fetches the main sections for the home/explore page.
   * @param {string} countryCode The user's country code.
   * @returns {Promise<Array>} A promise that resolves with an array of sections.
   */
  getHomeSections: (countryCode) => ipcRenderer.invoke('get-home-sections', countryCode),

  /**
   * Fetches the details of an album or playlist.
   * @param {object} details An object containing the item's ID and type.
   * @param {string} countryCode The user's country code.
   * @returns {Promise<object|null>} A promise that resolves with the browse details.
   */
  getBrowseDetails: (details, countryCode) => ipcRenderer.invoke('get-browse-details', details, countryCode),

  /**
   * Fetches search suggestions based on the user's query.
   * @param {string} query The partial search query.
   * @param {string} countryCode The user's country code.
   * @returns {Promise<string[]>} A promise that resolves with an array of suggestions.
   */
  getSearchSuggestions: (query, countryCode) => ipcRenderer.invoke('get-search-suggestions', query, countryCode),

  /**
   * Fetches a list of recommended songs to play next.
   * @param {string} videoId The ID of the currently playing video.
   * @param {string} countryCode The user's country code.
   * @returns {Promise<Array>} A promise that resolves with an array of song objects.
   */
  getUpNexts: (videoId, countryCode) => {
    if (isValidVideoId(videoId)) {
      return ipcRenderer.invoke('get-up-nexts', videoId, countryCode);
    }
    return Promise.resolve([]); // Return empty array for invalid ID
  },


  // --- Media & File System ---

  /**
   * Fetches the direct URL for an audio stream.
   * @param {string} videoId The ID of the video.
   * @returns {Promise<string|null>} A promise that resolves with the stream URL.
   */
  getAudioStream: (videoId) => {
    if (isValidVideoId(videoId)) {
      return ipcRenderer.invoke('get-audio-stream', videoId);
    }
    return Promise.resolve(null);
  },

  /**
   * Fetches the direct URL for a video stream.
   * @param {string} videoId The ID of the video.
   * @returns {Promise<string|null>} A promise that resolves with the stream URL.
   */
  getVideoStream: (videoId) => {
    if (isValidVideoId(videoId)) {
      return ipcRenderer.invoke('get-video-stream', videoId);
    }
    return Promise.resolve(null);
  },

  /**
   * Signals the main process to cancel any ongoing video stream fetching.
   */
  cancelVideoStream: () => ipcRenderer.send('cancel-video-stream'),

  /**
   * Initiates a download of the audio for a given video.
   * @param {string} videoId The ID of the video to download.
   * @param {string} filename The proposed default filename.
   * @returns {Promise<string>} A promise that resolves with the final file path on success.
   */
  downloadAudio: (videoId, filename) => {
    if (isValidVideoId(videoId)) {
      return ipcRenderer.invoke('download-audio', videoId, filename);
    }
    return Promise.reject(new Error('Invalid videoId for download.'));
  },

  /**
   * Opens a dialog to save a playlist to a JSON file.
   * @param {string} playlistJSON The playlist data as a JSON string.
   * @returns {Promise<object>} A promise that resolves with the result of the export operation.
   */
  exportPlaylist: (playlistJSON) => ipcRenderer.invoke('export-playlist', playlistJSON),

  /**
   * Opens a dialog to import a playlist from a JSON file.
   * @returns {Promise<object>} A promise that resolves with the imported playlist data.
   */
  importPlaylist: () => ipcRenderer.invoke('import-playlist'),

  // --- Window Controls ---
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  onMaximizeChange: (callback) => ipcRenderer.on('is-maximized-changed', (_event, isMaximized) => callback(isMaximized)),
  // --- External link handling --- 
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url)
});