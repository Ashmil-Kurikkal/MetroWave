/*
 * MetroWave Renderer Process
 *
 * This file contains the primary frontend logic for the application.
 * It handles UI rendering, user interactions, state management, media playback,
 * and communication with the main process via the preload script.
 */

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // --- 1. Core UI Elements & App State ---
    // =========================================================================

    const mainView = document.getElementById('main-view');
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const notificationContainer = document.getElementById('notification-container');
    const audioPlayer = document.getElementById('audioPlayer');
    const playerBar = document.getElementById('player-bar');
    const loadingOverlay = document.getElementById('loading-overlay');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const volumeSlider = document.getElementById('volume');
    const progressBar = document.getElementById('progress');
    const currentTimeDisplay = document.getElementById('current-time');
    const durationDisplay = document.getElementById('duration');
    const likeBtn = document.getElementById('like-btn');
    const downloadBtn = document.getElementById('download-btn');
    const videoPlayerContainer = document.getElementById('video-player-container');
    const videoCloseBtn = document.getElementById('video-close-btn');
    const localVideoPlayer = document.getElementById('local-video-player');
    const navBackBtn = document.getElementById('nav-back');
    const navForwardBtn = document.getElementById('nav-forward');
    
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    // App State
    let historyStack = [];
    let historyIndex = -1;
    let isNavigatingHistory = false;
    let isSongLoading = false;
    let likedSongs = [];
    let userCountry = 'US';
    let imageObserver; 
    let isVideoLoading = false;
    let wasAudioPlayingBeforeVideo = false;
    let isClosingVideoPlayer = false;
    let contextMenuSong = null;
    let latestPlayRequestToken = 0; // NEW: For handling rapid clicks

    // =========================================================================
    // --- 2. Helper & Utility Functions ---
    // =========================================================================

    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function showNotification(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toast.style.animation = `fadeInOut ${duration / 1000}s ease-in-out forwards`;
        notificationContainer.appendChild(toast);
        setTimeout(() => { toast.remove(); }, duration);
    }

    function formatTime(s) {
        if (isNaN(s)) return '0:00';
        const minutes = Math.floor(s / 60);
        const seconds = Math.floor(s % 60);
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    // =========================================================================
    // --- 3. Data Management & Preferences (LocalStorage) ---
    // =========================================================================

    function loadPreferences() {
        userCountry = localStorage.getItem('userCountryPref') || 'US';
        likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '[]');
        
        const savedTheme = localStorage.getItem('userThemePref') || 'default';
        applyTheme(savedTheme);

        const animationsEnabled = localStorage.getItem('userAnimationsPref') === 'true';
        applyAnimationSetting(animationsEnabled);
    }

    function saveCountryPreference(countryCode) {
        userCountry = countryCode;
        localStorage.setItem('userCountryPref', countryCode);
    }

    function saveLikedSongs() {
        localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
    }

    function applyTheme(themeName) {
        document.body.dataset.theme = themeName;
        localStorage.setItem('userThemePref', themeName);
        if (themeName !== 'dynamic') {
             document.body.style.cssText = ''; // Clear dynamic styles
        }
    }
    
    function applyAnimationSetting(isEnabled) {
        document.body.classList.toggle('animations-enabled', isEnabled);
        localStorage.setItem('userAnimationsPref', isEnabled);
    }

    function addSongToFavorites(song) {
        if (!song || !song.id) return;
        const isAlreadyLiked = likedSongs.some(s => s.id === song.id);
        if (!isAlreadyLiked) {
            likedSongs.unshift(song);
            saveLikedSongs();
            showNotification('Added to Favorites', 'success');
            updateLikeButtonState();
            const homeHeader = mainView.querySelector('.view-header h1');
            if (homeHeader && homeHeader.textContent === 'Home') {
                loadHomeContent();
            }
        } else {
            showNotification('Already in Favorites');
        }
    }
    
    function toggleLikeSong() {
        const currentSong = queueManager.getCurrentItem();
        if (!currentSong) return;
        const songIndex = likedSongs.findIndex(song => song.id === currentSong.id);
        if (songIndex > -1) {
            likedSongs.splice(songIndex, 1);
            showNotification('Removed from Favorites');
        } else {
            likedSongs.unshift(currentSong);
            showNotification('Added to Favorites', 'success');
        }
        saveLikedSongs();
        updateLikeButtonState();
        const homeHeader = mainView.querySelector('.view-header h1');
        if (homeHeader && homeHeader.textContent === 'Home') {
            loadHomeContent();
        }
    }
    
    function updateLikeButtonState() {
        const currentSong = queueManager.getCurrentItem();
        const isLiked = currentSong && likedSongs.some(song => song.id === currentSong.id);
        likeBtn.classList.toggle('liked', isLiked);
    }

    function getPlaylists() { return JSON.parse(localStorage.getItem('userPlaylists') || '[]'); }
    function savePlaylists(playlists) { localStorage.setItem('userPlaylists', JSON.stringify(playlists)); }

    function createPlaylist(name) {
        const trimmedName = name.trim();
        if (!trimmedName) return showNotification("Playlist name cannot be empty.", 'error');
        const playlists = getPlaylists();
        playlists.unshift({ id: `pl-${Date.now()}`, name: trimmedName, songs: [] });
        savePlaylists(playlists);
        showNotification(`Playlist "${escapeHTML(trimmedName)}" created!`, 'success');
        loadView('playlists');
    }

    function addSongToPlaylist(playlistId, song) {
        if (!song || !song.id) return showNotification("Invalid song data.", 'error');
        const playlists = getPlaylists();
        const playlist = playlists.find(p => p.id === playlistId);
        if (!playlist) return showNotification("Could not find the playlist.", 'error');
        if (playlist.songs.some(s => s.id === song.id)) return showNotification(`Song is already in "${escapeHTML(playlist.name)}"`);
        playlist.songs.push(song);
        savePlaylists(playlists);
        showNotification(`Added to "${escapeHTML(playlist.name)}"`, 'success');
    }

    function deletePlaylist(playlistId) {
        if (confirm("Are you sure you want to delete this playlist? This cannot be undone.")) {
            let playlists = getPlaylists();
            playlists = playlists.filter(p => p.id !== playlistId);
            savePlaylists(playlists);
            showNotification("Playlist deleted.", 'success');
            loadView('playlists');
        }
    }

    function removeSongFromPlaylist(playlistId, songId) {
        let playlists = getPlaylists();
        const playlist = playlists.find(p => p.id === playlistId);
        if (playlist) {
            playlist.songs = playlist.songs.filter(s => s.id !== songId);
            savePlaylists(playlists);
            showNotification("Song removed from playlist.");
            loadPlaylistView(playlistId);
        }
    }

    function updateRecentlyPlayed(song) {
        let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]').filter(item => item.id !== song.id);
        recentlyPlayed.unshift(song);
        if (recentlyPlayed.length > 50) recentlyPlayed.pop();
        localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    }
    
    // =========================================================================
    // --- 4. Navigation & History Management ---
    // =========================================================================

    function updateNavButtons() {
        navBackBtn.disabled = historyIndex <= 0;
        navForwardBtn.disabled = historyIndex >= historyStack.length - 1;
    }

    function pushState(state) {
        if (isNavigatingHistory) return;
        if (historyIndex < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }
        historyStack.push(state);
        historyIndex++;
        updateNavButtons();
    }

    async function loadState(state) {
        if (!state) return;
        isNavigatingHistory = true;
        const { type, payload } = state;
        try {
            if (type === 'view') await loadView(payload.viewName, true);
            else if (type === 'search') await performSearch(payload.query, true);
            else if (type === 'browse') await loadBrowseView(payload.id, payload.type, true);
            else if (type === 'playlist') await loadPlaylistView(payload.playlistId, true);
        } catch (error) {
            console.error("Error loading state:", error);
        } finally {
            isNavigatingHistory = false;
        }
    }

    function goBack() {
        if (historyIndex > 0) {
            historyIndex--;
            loadState(historyStack[historyIndex]);
            updateNavButtons();
        }
    }

    function goForward() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            loadState(historyStack[historyIndex]);
            updateNavButtons();
        }
    }

    // =========================================================================
    // --- 5. View & Component Rendering ---
    // =========================================================================

    function setupImageObserver() {
        if (imageObserver) imageObserver.disconnect();
        imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.dataset.src;
                    if (src) {
                        img.src = src;
                        img.removeAttribute('data-src');
                    }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: "0px 0px 200px 0px" });
        mainView.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
    }

    function addSeeMoreButton(container, items, limit) {
        if (items.length > limit) {
            const button = document.createElement('button');
            button.textContent = 'See More';
            button.className = 'see-more-btn';
            
            const parentSection = container.closest('.search-category, .content-section');
            if (parentSection) {
                 parentSection.appendChild(button);
            } else {
                 container.insertAdjacentElement('afterend', button);
            }
            
            button.addEventListener('click', () => {
                container.querySelectorAll('.initially-hidden').forEach(item => {
                    item.style.display = null;
                    item.classList.remove('initially-hidden');
                });
                button.remove();
            }, { once: true });
        }
    }
    
    function displayItemsInListGrid(items, container, limit = null) {
        if (!container || !items || items.length === 0) {
            if (container) container.innerHTML = '<p>No items available.</p>';
            return;
        }

        const getItemHtml = (item, isHidden) => {
            const itemData = escapeHTML(JSON.stringify(item));
            const title = escapeHTML(item.title);
            const artists = escapeHTML((item.artists || []).join(', '));
            const thumbnail = escapeHTML(item.thumbnails?.[0]?.url || 'assets/icons/default-art.png');
            let itemClass = 'list-grid-item';
            if (['song', 'video'].includes(item.type)) itemClass += ' song-item';

            let subtitle;
             switch (item.type) {
                case 'album': subtitle = escapeHTML((item.artists || []).join(', ') || item.year); break;
                case 'playlist': subtitle = escapeHTML(item.author || 'Playlist'); break;
                case 'artist': subtitle = 'Artist'; break;
                default: subtitle = escapeHTML((item.artists || []).join(', ')); break;
            }

            return `
                <div class="${itemClass} ${isHidden ? 'initially-hidden' : ''}" data-song='${itemData}'>
                    <img data-src="${thumbnail}" class="list-grid-item-thumbnail" alt="${title}">
                    <div class="list-grid-item-info">
                        <div class="list-grid-item-title">${title}</div>
                        <div class="list-grid-item-artist">${subtitle}</div>
                    </div>
                </div>`;
        };

        container.innerHTML = items.map((item, index) => getItemHtml(item, limit && index >= limit)).join('');
        
        if (limit) addSeeMoreButton(container, items, limit);
        attachItemClickListeners(container, playSong, loadBrowseView);
        setupImageObserver();
    }

    async function displaySearchResults(results, query) {
        mainView.innerHTML = `<div class="view-header"><h1>Results for "${escapeHTML(query)}"</h1></div>`;
        
        if (results.songs && results.songs.length > 0) {
            const section = document.createElement('div');
            const listContainer = document.createElement('div');
            section.className = 'search-category';
            section.innerHTML = `<h2>Songs</h2>`;
            section.appendChild(listContainer);

            const limit = 6;
            const songsHtml = results.songs.map((song, i) => {
                const songData = escapeHTML(JSON.stringify(song));
                const isHidden = i >= limit;
                return `
                <div class="search-result-list-item song-item ${isHidden ? 'initially-hidden' : ''}" data-song='${songData}'>
                    <div class="result-number">${i + 1}</div>
                    <img data-src="${escapeHTML(song.thumbnails?.[0]?.url || 'assets/icons/default-art.png')}" class="result-thumbnail">
                    <div class="result-info">
                        <div class="result-title">${escapeHTML(song.title)}</div>
                        <div class="result-artist">${escapeHTML((song.artists || []).join(', '))}</div>
                    </div>
                    <div class="result-actions"><button class="add-queue-btn" title="Add to Queue"><i data-feather="plus"></i></button></div>
                    <div class="result-duration">${escapeHTML(formatTime(song.duration))}</div>
                </div>`;
            }).join('');
            
            listContainer.innerHTML = songsHtml;
            mainView.appendChild(section);
            addSeeMoreButton(listContainer, results.songs, limit);
            attachItemClickListeners(section, playSong);
        }
        
        if (results.collections && results.collections.length > 0) {
            const section = document.createElement('div');
            section.className = 'content-section';
            section.innerHTML = `<h2>Collections</h2><div class="list-grid-container"></div>`;
            mainView.appendChild(section);
            displayItemsInListGrid(results.collections, section.querySelector('.list-grid-container'));
        }
        feather.replace();
        setupImageObserver();
    }
    
    async function performSearch(query, fromHistory = false) {
        if (!query) return;
        if (!fromHistory) pushState({ type: 'search', payload: { query } });
        mainView.innerHTML = `<div class="view-header"><h1>Searching for "${escapeHTML(query)}"...</h1></div>`;
        searchInput.value = query;
        searchSuggestions.style.display = 'none';
        const results = await window.electronAPI.searchYoutube(query, userCountry);
        await displaySearchResults(results, query);
    }
    
    async function loadView(viewName, fromHistory = false) {
        if (!fromHistory) pushState({ type: 'view', payload: { viewName } });
        const template = document.getElementById(`template-${viewName}`);
        mainView.innerHTML = template ? template.innerHTML : `<h1>View not found.</h1>`;
        
        if (viewName === 'home') await loadHomeContent();
        else if (viewName === 'explore') await loadExploreContent();
        else if (viewName === 'playlists') loadPlaylistsHub();
        else if (viewName === 'settings') loadSettings();
        
        feather.replace();
    }

    function loadSettings() {
        const countrySelect = document.getElementById('country-select');
        const themeSelect = document.getElementById('theme-select');
        const animationsToggle = document.getElementById('animations-toggle');

        countrySelect.value = userCountry;
        countrySelect.onchange = () => {
            saveCountryPreference(countrySelect.value);
            showNotification(`Explore region set to ${countrySelect.options[countrySelect.selectedIndex].text}.`, 'success');
            loadView('explore');
        };

        themeSelect.value = localStorage.getItem('userThemePref') || 'default';
        themeSelect.onchange = () => applyTheme(themeSelect.value);

        animationsToggle.checked = localStorage.getItem('userAnimationsPref') === 'true';
        animationsToggle.onchange = () => applyAnimationSetting(animationsToggle.checked);
    }

    function loadPlaylistsHub() {
        document.getElementById('create-playlist-btn').onclick = () => {
            const modal = document.getElementById('create-playlist-modal');
            modal.style.display = 'flex';
            setTimeout(() => document.getElementById('new-playlist-name-input').focus(), 50);
        };
        
        document.getElementById('import-playlist-btn').onclick = async () => {
            const result = await window.electronAPI.importPlaylist();
            if (result.success) {
                try {
                    const imported = JSON.parse(result.data);
                    if (imported.name && Array.isArray(imported.songs)) {
                        const playlists = getPlaylists();
                        imported.id = `pl-${Date.now()}`;
                        playlists.unshift(imported);
                        savePlaylists(playlists);
                        showNotification(`Playlist "${escapeHTML(imported.name)}" imported!`, 'success');
                        loadView('playlists');
                    } else { throw new Error("Invalid playlist file format."); }
                } catch (e) { showNotification(`Import failed: ${e.message}`, 'error'); }
            } else if (result.error && result.error !== 'User canceled.') { 
                showNotification(`Import failed: ${result.error}`, 'error'); 
            }
        };

        const playlistsGrid = document.getElementById('playlists-grid');
        const playlists = getPlaylists();
        if (playlists.length > 0) {
            playlistsGrid.innerHTML = playlists.map(p => `
                <div class="playlist-item-card" data-playlist-id="${escapeHTML(p.id)}">
                    <i data-feather="music" class="icon-placeholder"></i>
                    <div class="playlist-name">${escapeHTML(p.name)}</div>
                    <div class="song-count">${p.songs.length} songs</div>
                </div>`).join('');
            playlistsGrid.querySelectorAll('.playlist-item-card').forEach(card => 
                card.addEventListener('click', () => loadPlaylistView(card.dataset.playlistId))
            );
            feather.replace();
        } else {
            playlistsGrid.innerHTML = '<p>You haven\'t created any playlists yet.</p>';
        }
    }

    async function loadHomeContent() {
        const recentlyPlayedContainer = document.getElementById('recently-played');
        const clearBtn = document.getElementById('clear-recently-played-btn');
        const likedSongsContainer = document.getElementById('liked-songs');

        const recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
        if (recentlyPlayed.length > 0) {
            displayItemsInListGrid(recentlyPlayed, recentlyPlayedContainer, 6);
            clearBtn.style.display = 'block';
            clearBtn.onclick = () => {
                localStorage.removeItem('recentlyPlayed');
                showNotification('Recently Played list cleared');
                loadHomeContent();
            };
        } else {
            recentlyPlayedContainer.innerHTML = '<p>Your recently played songs will appear here.</p>';
            clearBtn.style.display = 'none';
        }
        
        if (likedSongs.length > 0) {
            displayItemsInListGrid(likedSongs, likedSongsContainer, 6);
        } else {
            likedSongsContainer.innerHTML = '<p>Your favorite songs will appear here.</p>';
        }
    }

    async function loadExploreContent() {
        const exploreContent = document.getElementById('explore-content');
        if (!exploreContent) return;
        exploreContent.innerHTML = '<p>Loading recommendations...</p>';
        try {
            const homeSections = await window.electronAPI.getHomeSections(userCountry);
            exploreContent.innerHTML = '';
            if (homeSections && homeSections.length > 0) {
                homeSections.forEach(section => {
                    const sectionEl = document.createElement('div');
                    sectionEl.className = 'content-section';
                    sectionEl.innerHTML = `<h2>${escapeHTML(section.title)}</h2><div class="list-grid-container"></div>`;
                    exploreContent.appendChild(sectionEl);
                    displayItemsInListGrid(section.contents, sectionEl.querySelector('.list-grid-container'), 6);
                });
            } else {
                exploreContent.innerHTML = '<p>Could not load Explore content. Please try again later.</p>';
            }
        } catch (error) {
            console.error('Failed to load Explore content:', error);
            exploreContent.innerHTML = '<p>An error occurred while loading content.</p>';
        }
    }

    async function loadBrowseView(id, type, fromHistory = false) {
        if (!fromHistory) pushState({ type: 'browse', payload: { id, type } });
        mainView.innerHTML = `<div class="view-header"><h1>Loading...</h1></div>`;
        const details = await window.electronAPI.getBrowseDetails({ id, type }, userCountry);
        if (!details || !details.tracks) {
            mainView.innerHTML = `<div class="view-header"><h1>Could not load content.</h1></div>`;
            return;
        }
        
        const headerHtml = `
            <div class="browse-view-header">
                <img src="${escapeHTML(details.thumbnails?.[details.thumbnails.length - 1]?.url || 'assets/icons/default-art.png')}" class="browse-view-thumbnail">
                <div class="browse-view-info">
                     <h2 class="browse-view-type">${escapeHTML(type.toUpperCase())}</h2>
                     <h1 class="browse-view-title">${escapeHTML(details.title)}</h1>
                     <p class="browse-view-artist">${escapeHTML(details.artist)}</p>
                     <p class="browse-view-meta">${details.tracks.length} songs</p>
                </div>
            </div>`;
        const songsHtml = details.tracks.map((song, i) => {
            const songData = escapeHTML(JSON.stringify(song));
            return `
            <div class="search-result-list-item song-item" data-song='${songData}'>
                <div class="result-number">${i + 1}</div>
                <img data-src="${escapeHTML(song.thumbnails?.[0]?.url || 'assets/icons/default-art.png')}" class="result-thumbnail">
                <div class="result-info">
                    <div class="result-title">${escapeHTML(song.title)}</div>
                    <div class="result-artist">${escapeHTML((song.artists || []).join(', '))}</div>
                </div>
                <div class="result-actions"><button class="add-queue-btn" title="Add to Queue"><i data-feather="plus"></i></button></div>
                <div class="result-duration">${escapeHTML(formatTime(song.duration))}</div>
            </div>`;
        }).join('');
        mainView.innerHTML = headerHtml + `<div class="song-list-container">${songsHtml}</div>`;
        
        attachItemClickListeners(mainView, (song) => playSong(song, details));
        setupImageObserver();
        feather.replace();
    }
    
    async function loadPlaylistView(playlistId, fromHistory = false) {
        if (!fromHistory) pushState({ type: 'playlist', payload: { playlistId } });
        const playlist = getPlaylists().find(p => p.id === playlistId);
        if (!playlist) return loadView('playlists');

        const headerHtml = `
            <div class="browse-view-header">
                <div class="playlist-item-card" style="width: 200px; height: 200px; cursor: default;"><i data-feather="music" class="icon-placeholder" style="width: 80px; height: 80px;"></i></div>
                <div class="browse-view-info">
                     <h2 class="browse-view-type">Playlist</h2>
                     <h1 class="browse-view-title">${escapeHTML(playlist.name)}</h1>
                     <p class="browse-view-meta">${playlist.songs.length} songs</p>
                     <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button id="delete-playlist-btn" class="action-btn" style="background: #c0392b;">Delete</button>
                        <button id="export-playlist-btn" class="action-btn">Export</button>
                     </div>
                </div>
            </div>`;
        const songsHtml = playlist.songs.length > 0
            ? playlist.songs.map((song, i) => {
                const songData = escapeHTML(JSON.stringify(song));
                return `
                <div class="search-result-list-item song-item" data-song='${songData}'>
                    <div class="result-number">${i + 1}</div>
                    <img data-src="${escapeHTML(song.thumbnails?.[0]?.url || 'assets/icons/default-art.png')}" class="result-thumbnail">
                    <div class="result-info">
                        <div class="result-title">${escapeHTML(song.title)}</div>
                        <div class="result-artist">${escapeHTML((song.artists || []).join(', '))}</div>
                    </div>
                    <div class="result-actions">
                        <button class="add-queue-btn" title="Add to Queue"><i data-feather="plus"></i></button>
                        <button class="remove-song-btn" data-song-id="${escapeHTML(song.id)}" title="Remove"><i data-feather="x"></i></button>
                    </div>
                    <div class="result-duration">${escapeHTML(formatTime(song.duration))}</div>
                </div>`;
            }).join('')
            : '<p style="padding: 20px 0;">This playlist is empty. Add songs to it!</p>';
        mainView.innerHTML = headerHtml + `<div class="song-list-container">${songsHtml}</div>`;
        
        mainView.querySelector('#delete-playlist-btn').onclick = () => deletePlaylist(playlistId);
        mainView.querySelector('#export-playlist-btn').onclick = async () => {
            const result = await window.electronAPI.exportPlaylist(JSON.stringify(playlist, null, 2));
            if (result.success) showNotification('Playlist exported!', 'success');
            else if (result.error && result.error !== 'User canceled.') showNotification(`Export failed: ${result.error}`, 'error');
        };
        
        mainView.querySelectorAll('.remove-song-btn').forEach(button => {
            button.onclick = (e) => { e.stopPropagation(); removeSongFromPlaylist(playlistId, button.dataset.songId); };
        });

        attachItemClickListeners(mainView, (song) => playSong(song, playlist));
        setupImageObserver();
        feather.replace();
    }
    
    // =========================================================================
    // --- 6. Playback & Theme Logic ---
    // =========================================================================

    async function updateDynamicTheme(imageUrl) {
        if (!imageUrl || document.body.dataset.theme !== 'dynamic') return;
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const { data } = ctx.getImageData(0, 0, img.width, img.height);
            
            let colorCounts = {};
            let maxCount = 0;
            let dominantColor = [0,0,0];

            for (let i = 0; i < data.length; i += 4 * 5) {
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];
                if (r > 10 && g > 10 && b > 10 && Math.abs(r-g) > 5 && Math.abs(r-b) > 5 && Math.abs(g-b) > 5) {
                    const key = `${r},${g},${b}`;
                    colorCounts[key] = (colorCounts[key] || 0) + 1;
                    if (colorCounts[key] > maxCount) {
                        maxCount = colorCounts[key];
                        dominantColor = [r,g,b];
                    }
                }
            }
            const [r, g, b] = dominantColor;
            const accent = `rgb(${r}, ${g}, ${b})`;
            const bg = `rgb(${Math.round(r*0.1)}, ${Math.round(g*0.1)}, ${Math.round(b*0.1)})`;
            const bgMid = `rgb(${Math.round(r*0.2)}, ${Math.round(g*0.2)}, ${Math.round(b*0.2)})`;
            
            document.body.style.setProperty('--dynamic-accent', accent);
            document.body.style.setProperty('--dynamic-accent-dark', `rgb(${Math.round(r*0.9)}, ${Math.round(g*0.9)}, ${Math.round(b*0.9)})`);
            document.body.style.setProperty('--dynamic-bg', bg);
            document.body.style.setProperty('--dynamic-bg-mid', bgMid);
            document.body.style.setProperty('--dynamic-bg-end', bg);
        };
    }

    async function playAudioAndUpdateUI(song, token) {
        if (!song || !song.id) return;

        if (token !== latestPlayRequestToken) {
            console.log(`Cancelling stale play request for "${song.title}"`);
            return;
        }

        isSongLoading = true;
        try {
            loadingOverlay.style.display = 'block';
            playerBar.classList.add('buffering');

            const streamUrl = await window.electronAPI.getAudioStream(song.id);
            
            if (token !== latestPlayRequestToken) {
                console.log(`Cancelling stale play request for "${song.title}" after fetch.`);
                throw new Error("Stale request");
            }
            if (!streamUrl) throw new Error("Could not fetch stream URL");

            queueManager.clearPrefetchedUrl();
            audioPlayer.src = streamUrl;
            await audioPlayer.play();

            const thumbnailUrl = song.thumbnails?.[0]?.url || 'assets/icons/default-art.png';
            document.getElementById("player-thumbnail").src = thumbnailUrl;
            document.getElementById("current-song-title").textContent = song.title;
            document.getElementById("current-song-artist").textContent = (song.artists || []).join(', ');
            document.getElementById("now-playing-info").style.display = "flex";
            
            updateRecentlyPlayed(song);
            updateLikeButtonState();
            updateDynamicTheme(thumbnailUrl.replace('w60-h60', 'w544-h544'));
            queueManager.addToHistory(song.id);
            queueManager.prefetchNext();
            queueManager.fetchUpNext();
        } catch (err) {
            if (err.message !== "Stale request") {
                console.error("Error playing stream:", err);
                showNotification(err.message || "Could not play song.", 'error');
            }
        } finally {
            isSongLoading = false;
            loadingOverlay.style.display = 'none';
            playerBar.classList.remove('buffering');
        }
    }

    async function playSong(song, sourcePlaylist = null) {
        if (!song || !song.id) return;
        const currentItem = queueManager.getCurrentItem();
        if (currentItem && audioPlayer.src && song.id === currentItem.id && audioPlayer.paused) {
            return audioPlayer.play();
        }
        
        const playToken = ++latestPlayRequestToken;
        queueManager.setSongForPlayback(song, sourcePlaylist);
        await playAudioAndUpdateUI(queueManager.getCurrentItem(), playToken);
    }
    
    async function playVideo(video) {
        if (isVideoLoading) return;
        isVideoLoading = true;
        wasAudioPlayingBeforeVideo = !audioPlayer.paused;
        if (wasAudioPlayingBeforeVideo) audioPlayer.pause();
        videoPlayerContainer.style.display = 'flex';
        try {
            showNotification("Fetching video stream...");
            const videoUrl = await window.electronAPI.getVideoStream(video.id);
            if (isVideoLoading && videoUrl) {
                videoPlayerContainer.classList.add('visible');
                localVideoPlayer.src = videoUrl;
                localVideoPlayer.play();
            } else if (!videoUrl) {
                showNotification("Could not fetch video URL.", 'error');
                hideVideoPlayer(); 
            }
        } catch (error) {
            showNotification("Error playing video.", 'error');
            hideVideoPlayer();
        }
    }

    function togglePlayPause() {
        if (videoPlayerContainer.classList.contains('visible')) return;
        if (!audioPlayer.src) return;
        if (audioPlayer.paused) audioPlayer.play();
        else audioPlayer.pause();
    }
    
    function hideVideoPlayer() {
        isClosingVideoPlayer = true;
        if (isVideoLoading) {
            window.electronAPI.cancelVideoStream();
            isVideoLoading = false;
        }
        localVideoPlayer.pause();
        localVideoPlayer.src = '';
        videoPlayerContainer.classList.remove('visible');
        setTimeout(() => videoPlayerContainer.style.display = 'none', 300);
        if (wasAudioPlayingBeforeVideo) {
            audioPlayer.play();
            wasAudioPlayingBeforeVideo = false;
        }
    }

    async function downloadSong() {
        const song = queueManager.getCurrentItem();
        if (!song) return showNotification('No song is currently playing.', 'error');
        try {
            showNotification('Starting download...');
            const filename = `${song.title} - ${(song.artists || []).join(', ')}`;
            await window.electronAPI.downloadAudio(song.id, filename);
            showNotification('Download complete!', 'success');
        } catch (error) {
            if (error.message !== 'User canceled.') showNotification('Download failed.', 'error');
        }
    }

    // =========================================================================
    // --- 7. QueueManager Class ---
    // =========================================================================

    class QueueManager {
        constructor() {
            this.songQueue = [];
            this.currentSongIndex = -1;
            this.upNextSongs = [];
            this.prefetchedUrl = null;
            this.prefetchedId = null;
            this.playedHistory = [];
            this.queueListElement = document.getElementById('queue-list');
            this.upNextListElement = document.getElementById('up-next-list');
            
            document.getElementById('next-btn').onclick = () => this.next();
            document.getElementById('prev-btn').onclick = () => this.previous();
            
            if (typeof Sortable !== 'undefined') {
                Sortable.create(this.queueListElement, { animation: 150, ghostClass: 'ghost', onEnd: (evt) => this.reorderItem(evt.oldIndex, evt.newIndex) });
            }
        }

        addToHistory(songId) {
            if (!songId) return;
            this.playedHistory = this.playedHistory.filter(id => id !== songId);
            this.playedHistory.unshift(songId);
            if (this.playedHistory.length > 50) this.playedHistory.pop();
        }

        setSongForPlayback(song, sourcePlaylist) {
            if (sourcePlaylist) {
                const tracklist = sourcePlaylist.tracks || sourcePlaylist.songs || [];
                this.songQueue = [...tracklist];
                this.currentSongIndex = this.songQueue.findIndex(s => s.id === song.id);
            } else {
                const existingIndex = this.songQueue.findIndex(s => s.id === song.id);
                if (existingIndex !== -1) this.currentSongIndex = existingIndex;
                else {
                    this.songQueue.splice(this.currentSongIndex + 1, 0, song);
                    this.currentSongIndex++;
                }
            }
            this.renderQueue();
        }

        addSongToQueue(song) {
            this.songQueue.push(song);
            this.renderQueue();
            showNotification("Added to queue");
            if (this.currentSongIndex === -1 && this.songQueue.length === 1) playSong(this.songQueue[0]);
        }

        addSongToPlayNext(song) {
            this.songQueue.splice(this.currentSongIndex + 1, 0, song);
            this.renderQueue();
            showNotification("Will play next");
        }

        getCurrentItem() { return this.songQueue[this.currentSongIndex] || null; }

        playNextOrUpNext() {
            const playToken = ++latestPlayRequestToken;
            if (this.currentSongIndex < this.songQueue.length - 1) {
                this.currentSongIndex++;
                playAudioAndUpdateUI(this.songQueue[this.currentSongIndex], playToken);
            } else if (this.upNextSongs.length > 0) {
                const nextSongToPlay = this.upNextSongs.shift();
                this.renderUpNext();
                this.songQueue.push(nextSongToPlay);
                this.currentSongIndex++;
                playAudioAndUpdateUI(nextSongToPlay, playToken);
            } else {
                audioPlayer.pause();
            }
            this.renderQueue();
        }

        next() { this.playNextOrUpNext(); }

        previous() {
            if (this.songQueue.length === 0) return;
            if (audioPlayer.currentTime > 3) {
                audioPlayer.currentTime = 0;
                return;
            }
            if (this.currentSongIndex > 0) {
                 this.currentSongIndex--;
                 const playToken = ++latestPlayRequestToken;
                 playAudioAndUpdateUI(this.songQueue[this.currentSongIndex], playToken);
                 this.renderQueue();
            }
        }
        
        removeItem(index) {
            if (index < 0 || index >= this.songQueue.length) return;
            
            const isRemovingCurrent = index === this.currentSongIndex;
            
            this.songQueue.splice(index, 1);

            if (isRemovingCurrent) {
                this.currentSongIndex--; 
                this.playNextOrUpNext();
            } else if (index < this.currentSongIndex) {
                this.currentSongIndex--;
            }
            this.renderQueue();
        }

        reorderItem(oldIndex, newIndex) {
            if (oldIndex === newIndex) return;
            const currentSongId = this.getCurrentItem()?.id;
            const [movedItem] = this.songQueue.splice(oldIndex, 1);
            this.songQueue.splice(newIndex, 0, movedItem);
            if (currentSongId) this.currentSongIndex = this.songQueue.findIndex(s => s.id === currentSongId);
            this.renderQueue();
        }

        async prefetchNext() {
            this.clearPrefetchedUrl();
            const nextIndex = this.currentSongIndex + 1;
            if (nextIndex < this.songQueue.length) {
                const nextSong = this.songQueue[nextIndex];
                try {
                    this.prefetchedUrl = await window.electronAPI.getAudioStream(nextSong.id);
                    this.prefetchedId = nextSong.id;
                } catch (e) { this.clearPrefetchedUrl(); }
            }
        }

        getPrefetchedUrl(songId) { return (this.prefetchedId === songId) ? this.prefetchedUrl : null; }
        clearPrefetchedUrl() { this.prefetchedUrl = null; this.prefetchedId = null; }
        
        async fetchUpNext() {
            const currentSong = this.getCurrentItem();
            if (!currentSong) {
                this.upNextSongs = [];
                this.renderUpNext();
                return;
            }
            try {
                const upNexts = await window.electronAPI.getUpNexts(currentSong.id, userCountry);
                const currentQueueIds = this.songQueue.map(s => s.id);
                this.upNextSongs = (Array.isArray(upNexts) ? upNexts : [])
                    .filter(song => song && !this.playedHistory.includes(song.id) && !currentQueueIds.includes(song.id))
                    .map(song => ({ ...song, artists: Array.isArray(song.artists) ? song.artists : [song.artists] }));
                
                this.renderUpNext();
            } catch(e) {
                console.error("Failed to fetch Up Next songs:", e);
                this.upNextSongs = [];
                this.renderUpNext();
            }
        }

        renderQueue() {
            if (!this.queueListElement) return;
            this.queueListElement.innerHTML = this.songQueue.length === 0
                ? `<li class="queue-empty-message">Queue is empty</li>`
                : this.songQueue.map((item, i) => `
                <li class="queue-item ${i === this.currentSongIndex ? 'active' : ''}" data-index="${i}">
                    <img src="${escapeHTML(item.thumbnails?.[0]?.url || 'assets/icons/default-art.png')}" alt="${escapeHTML(item.title)}" class="queue-thumbnail">
                    <div class="queue-info">
                        <div class="queue-title">${escapeHTML(item.title)}</div>
                        <div class="queue-artist">${escapeHTML((item.artists || []).join(', '))}</div>
                    </div>
                    <button class="queue-item-remove" title="Remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </li>`).join('');
            
            this.queueListElement.querySelectorAll('.queue-item').forEach(item => {
                const index = parseInt(item.dataset.index, 10);
                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.queue-item-remove')) {
                        const playToken = ++latestPlayRequestToken;
                        this.currentSongIndex = index;
                        playAudioAndUpdateUI(this.songQueue[index], playToken);
                        this.renderQueue();
                    }
                });

                const removeBtn = item.querySelector('.queue-item-remove');
                if (removeBtn) {
                    removeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeItem(index);
                    });
                }
            });
        }

        renderUpNext() {
            const container = document.getElementById('recommendations-section');
            if (this.upNextSongs && this.upNextSongs.length > 0) {
                this.upNextListElement.innerHTML = this.upNextSongs.map((song, index) => {
                    const songData = escapeHTML(JSON.stringify(song));
                    return `
                    <li class="queue-item song-item" data-index="${index}" data-song='${songData}'>
                        <img src="${escapeHTML(song.thumbnails?.[0]?.url || 'assets/icons/default-art.png')}" alt="${escapeHTML(song.title)}" class="queue-thumbnail">
                        <div class="queue-info">
                            <div class="queue-title">${escapeHTML(song.title)}</div>
                            <div class="queue-artist">${escapeHTML((song.artists || []).join(', '))}</div>
                        </div>
                    </li>`;
                }).join('');
                
                this.upNextListElement.querySelectorAll('.queue-item').forEach(item => {
                    item.onclick = () => this.playFromUpNext(parseInt(item.dataset.index, 10));
                });
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        }

        playFromUpNext(index) {
            const songToPlay = this.upNextSongs[index];
            if (songToPlay) {
                this.songQueue.push(songToPlay);
                this.upNextSongs.splice(index, 1);
                this.currentSongIndex = this.songQueue.length - 1;
                const playToken = ++latestPlayRequestToken;
                playAudioAndUpdateUI(songToPlay, playToken);
                this.renderQueue();
                this.renderUpNext();
            }
        }
    }
    const queueManager = new QueueManager();
    
    // =========================================================================
    // --- 8. Event Listener Setup ---
    // =========================================================================

    function attachItemClickListeners(container, playHandler, browseHandler) {
        container.querySelectorAll('.song-item, .list-grid-item').forEach(itemEl => {
            const itemDataStr = itemEl.dataset.song;
            if (!itemDataStr) return;
            
            itemEl.addEventListener('click', (e) => {
                if (e.target.closest('.grid-item-actions, .result-actions')) return;
                try {
                    const itemData = JSON.parse(itemDataStr);
                    if (['song', 'video'].includes(itemData.type)) playHandler?.(itemData);
                    else if (['album', 'playlist', 'artist'].includes(itemData.type)) browseHandler?.(itemData.browseId || itemData.artistId, itemData.type);
                } catch (error) { console.error("Failed to parse item data:", error); }
            });

            itemEl.querySelectorAll('.add-queue-btn, .queue-btn-grid').forEach(button => {
                button.onclick = (e) => {
                    e.stopPropagation();
                    try { queueManager.addSongToQueue(JSON.parse(itemDataStr)); } catch (error) { console.error("Failed to parse item data for queue:", error); }
                };
            });
        });
    }

    function showContextMenu(x, y, song) {
        contextMenuSong = song;
        const menu = document.getElementById('context-menu');
        
        const playlistSubmenu = document.getElementById('context-menu-playlists');
        const playlists = getPlaylists();
        if (playlists.length > 0) {
            playlistSubmenu.innerHTML = playlists.map(p => `<li data-id="${p.id}"><a>${escapeHTML(p.name)}</a></li>`).join('');
            playlistSubmenu.querySelectorAll('li').forEach(item => {
                item.onclick = () => {
                    addSongToPlaylist(item.dataset.id, contextMenuSong);
                    menu.style.display = 'none';
                };
            });
        } else {
            playlistSubmenu.innerHTML = '<li><a>No playlists yet</a></li>';
        }
        
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';
    }

    function displaySearchSuggestions(suggestions) {
        if (suggestions.length > 0) {
            searchSuggestions.innerHTML = suggestions.map(s => `<div class="suggestion-item">${escapeHTML(s)}</div>`).join('');
            searchSuggestions.style.display = 'block';
            searchSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
                item.onclick = () => {
                    searchInput.value = item.textContent;
                    performSearch(item.textContent);
                    searchSuggestions.style.display = 'none';
                };
            });
        } else {
            searchSuggestions.style.display = 'none';
        }
    }

    function setupEventListeners() {
        minimizeBtn.onclick = () => window.electronAPI.minimizeWindow();
        maximizeBtn.onclick = () => window.electronAPI.maximizeWindow();
        closeBtn.onclick = () => window.electronAPI.closeWindow();
        window.electronAPI.onMaximizeChange((isMaximized) => {
            maximizeBtn.innerHTML = isMaximized 
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
        });

        navBackBtn.onclick = goBack;
        navForwardBtn.onclick = goForward;
        document.getElementById('nav-home').onclick = () => loadView('home');
        document.getElementById('nav-explore').onclick = () => loadView('explore');
        document.getElementById('nav-playlists').onclick = () => loadView('playlists');
        document.getElementById('nav-settings').onclick = () => loadView('settings');

        document.getElementById('context-menu-add-queue').onclick = () => { if (contextMenuSong) queueManager.addSongToQueue(contextMenuSong); };
        document.getElementById('context-menu-add-favorite').onclick = () => { if (contextMenuSong) addSongToFavorites(contextMenuSong); };

        const createPlaylistModal = document.getElementById('create-playlist-modal');
        const newPlaylistNameInput = document.getElementById('new-playlist-name-input');
        const closePlaylistModal = () => { newPlaylistNameInput.value = ''; createPlaylistModal.style.display = 'none'; };
        document.getElementById('modal-create-btn').onclick = () => { createPlaylist(newPlaylistNameInput.value); closePlaylistModal(); };
        document.getElementById('modal-cancel-btn').onclick = closePlaylistModal;
        createPlaylistModal.onclick = (e) => { if (e.target === createPlaylistModal) closePlaylistModal(); };

        document.getElementById('add-to-playlist-btn').onclick = (event) => {
            event.stopPropagation();
            const currentSong = queueManager.getCurrentItem();
            if (!currentSong) return showNotification("No song is playing.", 'error');
            const menu = document.getElementById('player-playlist-menu');
            const listEl = document.getElementById('player-playlist-menu-list');
            const playlists = getPlaylists();
            listEl.innerHTML = playlists.length > 0
                ? playlists.map(p => `<li data-playlist-id="${escapeHTML(p.id)}"><a>${escapeHTML(p.name)}</a></li>`).join('')
                : `<li><a>Create a playlist first</a></li>`;
            listEl.querySelectorAll('li[data-playlist-id]').forEach(item => {
                item.onclick = () => { addSongToPlaylist(item.dataset.playlistId, currentSong); menu.style.display = 'none'; };
            });
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        };

        searchForm.onsubmit = (e) => { e.preventDefault(); const query = searchInput.value.trim(); if (query) performSearch(query); };
        let suggestionTimeout;
        searchInput.oninput = () => {
            const query = searchInput.value.trim();
            clearTimeout(suggestionTimeout);
            if (query.length < 2) { searchSuggestions.style.display = 'none'; return; }
            suggestionTimeout = setTimeout(async () => {
                const suggestions = await window.electronAPI.getSearchSuggestions(query, userCountry);
                displaySearchSuggestions(suggestions);
            }, 300);
        };

        document.addEventListener('contextmenu', (e) => {
            const songItem = e.target.closest('.song-item, .list-grid-item');
            if (songItem && songItem.dataset.song) {
                e.preventDefault();
                try {
                    const song = JSON.parse(songItem.dataset.song);
                    showContextMenu(e.pageX, e.pageY, song);
                } catch (err) { console.error("Error showing context menu:", err); }
            }
        });

        document.addEventListener('click', (e) => {
            // Check for external links
            const link = e.target.closest('a[href^="http"]');
            if (link) {
                e.preventDefault();
                window.electronAPI.openExternalLink(link.href);
                return; // Stop further processing for this click
            }

            // Hide overlays
            if (!searchForm.contains(e.target)) searchSuggestions.style.display = 'none';
            if (!e.target.closest('#context-menu')) document.getElementById('context-menu').style.display = 'none';
            if (!e.target.closest('#add-to-playlist-btn') && !e.target.closest('#player-playlist-menu')) document.getElementById('player-playlist-menu').style.display = 'none';
        });

        playPauseBtn.onclick = togglePlayPause;
        volumeSlider.oninput = () => (audioPlayer.volume = volumeSlider.value);
        progressBar.oninput = () => { if (!isNaN(audioPlayer.duration)) audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration; };
        likeBtn.onclick = toggleLikeSong;
        downloadBtn.onclick = downloadSong;
        document.getElementById('video-btn').onclick = () => {
            const item = queueManager.getCurrentItem();
            if(item && item.id) playVideo(item); else showNotification("No song selected to play video.", "error");
        };
        videoCloseBtn.onclick = hideVideoPlayer;

        audioPlayer.ontimeupdate = () => {
            if (isNaN(audioPlayer.duration)) return;
            const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressBar.value = isNaN(progress) ? 0 : progress;
            currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
        };
        audioPlayer.onloadedmetadata = () => { durationDisplay.textContent = formatTime(audioPlayer.duration); };
        audioPlayer.onended = () => queueManager.playNextOrUpNext();
        audioPlayer.onplay = () => playPauseBtn.classList.add('playing');
        audioPlayer.onpause = () => playPauseBtn.classList.remove('playing');
        
        localVideoPlayer.onloadeddata = () => { isVideoLoading = false; };
        localVideoPlayer.onerror = () => {
            if (isClosingVideoPlayer) { isClosingVideoPlayer = false; return; }
            if (localVideoPlayer.src) { showNotification('Video stream failed.', 'error'); hideVideoPlayer(); }
        };
    }

    // =========================================================================
    // --- 9. App Initialization ---
    // =========================================================================
    
    function initialize() {
        loadPreferences();
        setupEventListeners();
        loadView('home');
        if (historyStack.length === 0) {
            pushState({ type: 'view', payload: { viewName: 'home' } });
        }
        feather.replace();
    }

    initialize();
});