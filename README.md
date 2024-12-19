# yt-dlp Interactive Wrapper

A TypeScript-based interactive wrapper around [yt-dlp][yt-dlp] that makes downloading multi-lang videos more convenient.  

Built primarily for personal use, but shared in case others find it useful.

## Usage

```bash
$ ./yt-dlp-prompt.ts [URL]
```

## Features

- Interactive command-line interface using [@clack/prompts][clack-prompts]
- Lets you select video quality from available streams
- Supports downloading multiple audio streams alongside the video
- Customizable output filename based on available metadata (title, alt_title, fulltitle)
- Automatically sanitizes filenames to prevent system compatibility issues
- Embeds subtitles, thumbnails, and video metadata automatically
- Attempts to fix MP4 metadata tags using AtomicParsley
- Supports MKV metadata tagging using mkvpropedit

## Prerequisites

- [yt-dlp][yt-dlp]
- Node/npm
- [AtomicParsley][atomicparsley] (for MP4 metadata tagging)
- [MKVToolNix][mkvtoolnix] - mkvpropedit (for MKV metadata tagging. Only needed, when selecting multiple audio streams)

The script will verify these dependencies and provide installation hints if any are missing.

## Disclaimer

This is a personal tool that I'm sharing as-is. While you're welcome to use and modify it, please note that:

- I won't be providing support or fixing issues
- You'll need to handle any bugs or modifications yourself
- Use at your own risk

> Note: Because I was too lazy to write it and wanted to play with LLM, this README.md was generated with Claude.ai

[atomicparsley]: https://github.com/wez/atomicparsley "Reading, parsing and setting metadata into MPEG-4 files"
[yt-dlp]: https://github.com/yt-dlp/yt-dlp "A feature-rich command-line audio/video downloader"
[mkvtoolnix]: https://mkvtoolnix.download/ "MKVToolNix - Matroska tools for Linux/Unix and Windows"
[clack-prompts]: https://github.com/bombshell-dev/clack/tree/main/packages/prompts#readme "A simple, flexible, and powerful prompt library for Node.js"
