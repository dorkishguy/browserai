# Product Overview
you need to create a set of tools which can work in the users browser only no backend server required. all these tools should be completely available with a very simple ui on the browser of the user.

# Core Philosophy
this is to replace the things that call themselves free but are actually paid and charge you for using them. the users computer will only be used so we dont have any charge to host our tools.

## Browser-First Principles
everything should run inside the browser and nothing on any other servers because thats the only way it can be completely free

## Offline Capability
this should be able to run completely locally as well with no internet by downloading the code from github

# Tool Suite
the tools are related to ai and that stuff. there are 4 tools for now but we can scale this up later.

## Tool List & Descriptions
- tts: text to speech running fully in browser via kokoro tts
- stt: speech to text running fully in browser via whisper/vosk
- srt generation: generate srt subtitle files from audio via whisper
- chat models: chat with local llms running fully in browser

## Per-Tool Breakdown

### TTS
- model: kokoro tts via onnx runtime web
- user controls: voice selection, speed, pitch, language, output format (wav/mp3)
- ram cap: under 8gb
- output: downloadable audio file

### STT
- model: whisper.cpp via wasm or vosk via wasm
- user controls: language selection, model size (tiny/base/small), punctuation toggle
- input: mic recording or audio file upload
- ram cap: under 8gb
- output: plain text transcription, copyable and downloadable as .txt

### SRT Generation
- model: whisper via wasm
- user controls: language, model size, max chars per line, timestamp precision
- input: audio file upload (mp3/wav/ogg/m4a)
- ram cap: under 8gb
- output: downloadable .srt file

### Chat Models
- models available (pick from at least 5):
  - llama 3.2 3b (via webllm)
  - phi-3 mini (via webllm)
  - gemma 2b (via webllm)
  - mistral 7b q4 (via webllm)
  - qwen2 1.5b (via webllm)
- user controls: system prompt, temperature, max tokens, context length, model switching
- ram cap: under 8gb per model
- output: streamed text response in chat ui

### Purpose
kill paywalled tools that gatekeep basic ai functionality. everything here is free forever because it runs on the users own machine.

### Inputs & Outputs
- tts: input = text → output = audio file (wav/mp3)
- stt: input = mic or audio file → output = text transcription (.txt)
- srt generation: input = audio file → output = subtitle file (.srt)
- chat: input = text prompt → output = streamed text response

### Browser APIs Used
- Web Audio API (tts playback, stt mic recording)
- MediaRecorder API (mic capture for stt)
- File System Access API (file upload/download)
- IndexedDB (model caching so u dont redownload every time)
- WebGPU / WebGL (gpu acceleration for model inference where available)
- WASM (running ml models in browser)
- Web Workers (offload inference so ui doesnt freeze)

# App Flow / User Journey

## Landing
- user hits the site and sees a clean tool picker with 4 options
- no login, no signup, no popups
- first time: brief one liner per tool explaining wht it does
- model download warning shown upfront so user knows wht to expect size wise

## Tool Selection
- single page app, clicking a tool loads its ui panel
- previously used tools remember their last state via localstorage
- active tool highlighted in nav

## Tool Usage
- tts: paste or type text → tweak voice settings → hit generate → play or download
- stt: upload file or hit record → pick model/language → transcribe → copy or download
- srt: upload audio → pick settings → generate → download .srt
- chat: pick model → model downloads if not cached → chat normally with streaming output

## Data Handling (local only)
- all input/output stays in the browser tab
- models cached in indexeddb after first download so no re-downloading
- user generated files (transcriptions, audio, srt) only exist if user explicitly downloads them
- nothing is sent anywhere, ever

# Data & Storage

## LocalStorage / IndexedDB Usage
- localstorage: user preferences (last used tool, voice settings, model choice, ui state)
- indexeddb: cached model weights (can be several hundred mb to a few gb depending on model)
- user should be able to clear cache from a settings panel

## No Data Leaving the Browser (constraints)
- zero network requests after initial page + model load
- no analytics, no error reporting, no telemetry
- no cdn calls during inference
- works fully offline once models are cached

## Import / Export
- all tools support downloading their output
- tts: export as wav or mp3
- stt: export as .txt
- srt: export as .srt
- chat: export conversation as .txt or .json

# Browser Compatibility

## Supported Browsers
- chrome/chromium 113+ (primary, best webgpu support)
- firefox 118+ (wasm works, webgpu limited)
- edge 113+ (same as chrome)
- safari: partial (webgpu behind flag, some wasm limitations)

## Fallbacks
- if webgpu not available fall back to cpu via wasm (slower but works)
- if model too large for device ram, show clear error with suggestion to use smaller model
- if mic permission denied show file upload as fallback for stt/srt
- if indexeddb unavailable warn user models will re-download each session

# Tech Stack

## Frontend Only (no backend)
- vanilla js or vite + vanilla (no heavy framework needed for this)
- onnx runtime web (for kokoro tts)
- webllm (for chat models via webgpu)
- whisper wasm / transformers.js (for stt + srt generation)
- vosk wasm (fallback stt option)
- web workers for all inference (keep ui responsive)

## Libraries & APIs Allowed
- @mlc-ai/web-llm
- @xenova/transformers (transformers.js)
- onnxruntime-web
- vosk-browser
- no jquery, no react needed, keep it lean

# Pages & Components

## Shell / Wrapper UI
- top nav or sidebar with 4 tool icons + labels
- active tool content area takes up rest of screen
- settings icon for clearing cache / storage info
- no routing needed, just show/hide panels

## Per-Tool Component Structure
- each tool is a self contained js module with its own:
  - ui panel (inputs, controls, output area)
  - model loader with progress bar
  - worker interface for inference
  - download button for output
  - error state handling

# Edge Cases & Constraints

## What Happens Offline
- if models already cached in indexeddb everything works 100% offline
- if models not cached and offline show clear message: "download this tool's model first while online"
- no silent failures, always tell the user wht is happening

## Large File Handling
- audio files over 100mb should show a warning before processing
- chunk large audio for whisper inference so browser doesnt crash
- srt generation on long audio (1hr+) should show progress and estimated time
- chat models over 4gb should warn user about ram usage before downloading

## Browser Permission Denials
- mic denied: hide record button, show file upload only with a note
- file system access denied: fall back to standard html file input
- storage quota exceeded: prompt user to clear model cache from settings
- webgpu denied: auto fallback to wasm cpu mode silently

# Out of Scope
- no backend ever
- no user accounts or auth
- no telemetry or analytics
- no monetization or ads
- no mobile app (browser only)
- no real time collaboration
- no cloud sync

# Design
## See design.md