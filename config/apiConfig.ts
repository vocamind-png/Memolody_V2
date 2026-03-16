

export const API_CONFIG = {
  BASE_URL: 'https://api.tianstudio.com/v1',
  STORAGE_URL: 'https://storage.googleapis.com/tian-music-assets',
  AI_MODELS: {
    SOLFEGE_DIFFUSION: 'gemini-2.5-flash-native-audio-preview-12-2025',
    COMMAND_PROCESSOR: 'gemini-3-pro-preview',
    TTS_ENGINE: 'gemini-2.5-flash-preview-tts'
  },
  ENDPOINTS: {
    SEARCH_TRACKS: '/tracks/search',
    GET_MUSICXML: '/assets/xml',
    GENERATE_SOLFEGE: '/ai/generate-solfege-vocals',
    TRANSCRIBE_AUDIO: '/ai/transcribe'
  }
};