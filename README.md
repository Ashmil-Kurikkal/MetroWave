# MetroWave 🌊
![MetroWave Screenshot](https://github.com/Ashmil-Kurikkal/MetroWave/blob/main/build/iconpng.png)
![MetroWave Screenshot](https://github.com/Ashmil-Kurikkal/MetroWave/blob/main/Screenshots/Screenshot%202025-09-20%20192133.png)
![MetroWave Screenshot](https://github.com/Ashmil-Kurikkal/MetroWave/blob/main/Screenshots/Screenshot%202025-09-20%20192250.png)
A modern, sleek desktop music streaming application powered by YouTube Music. Built with Electron, MetroWave offers a beautiful, native-like experience for listening to your favorite music without a browser.

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/Ashmil-Kurikkal/metrowave?style=for-the-badge)](https://github.com/Ashmil-Kurikkal/metrowave/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

## Features

MetroWave is packed with features to enhance your listening experience:

* 🎶 **Stream from YouTube Music**: Access a massive catalog of songs, albums, and playlists.
* 🔍 **Powerful Search**: Quickly find any song, artist, album, or playlist.
* 🌐 **Explore Content**: Discover new releases, trending charts, and community playlists.
* 📚 **Your Library**: Manage your favorite songs ("Liked Songs") and see your listening history ("Recently Played").
* 📝 **Local Playlists**: Create your own custom playlists. You can also import and export playlists as JSON files.
* 🔄 **Queue Management**: Full control over your playback queue, including drag-and-drop reordering.
* ✨ **Customizable Themes**: Choose from multiple built-in themes, including a dynamic theme that adapts to the colors of the current song's album art.
* 💡 **Smart Recommendations**: The "Up Next" feature provides endless recommendations based on your current song.
* 📥 **Audio Download**: Download any song as an MP3 file for offline listening.
* 🎬 **Integrated Video Player**: Seamlessly switch to watch the music video for the currently playing track.

---

## Installation

Getting started with MetroWave is easy.

#### **For Users**

1.  Download the installer here : [**MetroWave.Setup.1.0.0.exe**](https://github.com/Ashmil-Kurikkal/MetroWave/releases/download/v1.0.0-alpha/MetroWave.Setup.1.0.0.exe)
2.  And obviously just ignore the Windows defender waarning. 😏
3.  Run the installer and open the app, I guess that'll do!

#### **For Developers**

If you want to run the app from the source code, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/YOUR_USERNAME/metrowave.git](https://github.com/YOUR_USERNAME/metrowave.git)
    cd metrowave
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the application:**
    ```bash
    npm start
    ```

---

## A Note from the Developer

MetroWave began as a hobby project, built initially for my personal use. The design and feature set reflect that origin. Because of this, the current state of the app may not go with everyone's taste, and that's perfectly okay!

**Your opinions, feature requests, and bug reports are expected,** Please feel free to open an issue on GitHub to share your thoughts.

---

## Acknowledgments

This project would not be possible without the incredible work of the open-source community. Special thanks to:

* The **[ytmusic-api](https://github.com/zS1L3NT/ts-npm-ytmusic-api)** team for providing the core access.
* The developers behind **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** for the reliable stream extraction.
* **Mostafa Algamy** for his work on **[Metrolist](https://github.com/mostafaalagamy/Metrolist)**, a mobile version which is much, much feature-rich and has been out for so long, serving as an inspiration.

---

## Building from Source

If you want to build the installers yourself, you can use the built-in scripts.

```bash
# Build for your current operating system
npm run dist
```
The packaged application will be available in the `dist` folder.

---

## License

This project is licensed under the MIT License.
