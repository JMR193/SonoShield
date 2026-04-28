# SonoShield AI Humanizer

SonoShield is a professional-grade spectral engine designed for AI-generated music. It provides advanced audio humanization, IP fingerprinting, and resistance against AI detection algorithms to ensure your digital assets remain unique and compliant with distribution platforms.

## Features

- **Spectral Humanization**: Intelligent audio processing to add natural jitter and organic textures to AI-generated stems.
- **AI Resistance Engine**: Analyzes and obscures machine-learning patterns that trigger copyright flags.
- **IP Fingerprinting**: Generates and manages your audio fingerprints to securely track ownership verification.
- **Platform Compliance**: Ready for Spotify, Apple Music, and major distributors (DistroKid, RouteNote).
- **Real-time Spectral Visualization**: Powered by WaveSurfer.js for precise audio analysis.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS 4.0
- **Animation**: Motion (formerly Framer Motion)
- **Audio Processing**: Web Audio API, WaveSurfer.js
- **Backend & Auth**: Firebase (Authentication)
- **AI Integration**: Google Gemini AI (via Secure Server Proxy)
- **Server**: Express (Node.js) with TypeScript (tsx)

## Getting Started

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Gemini AI (Private)
GEMINI_API_KEY=your_gemini_key
```

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The server runs on [http://localhost:3000](http://localhost:3000).

## Security

- **Secure AI Proxy**: Gemini API keys are handled server-side to prevent exposure in the client browser.
- **Fingerprint Integrity**: Cryptographic fingerprints ensure that metadata cannot be tampered with after registration.

## License

© 2026 SonoShield Spectral Engine. AI Resistance Verified.
