import re

with open("components/Home/HomePage.tsx", "r") as f:
    content = f.read()

# Replace React imports
content = content.replace("import React, { useMemo, useState, useEffect, useCallback, useRef, memo } from 'react';", "import React, { useMemo, useState, useEffect, useCallback, useRef, memo, lazy, Suspense } from 'react';")

# Remove Tone static import
content = content.replace("import * as Tone from 'tone';", "")

# Lazy load CameraCapture
content = content.replace("import CameraCapture from './CameraCapture';", "const CameraCapture = lazy(() => import('./CameraCapture'));")

# Wrap CameraCapture in Suspense
content = content.replace("""      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onCapture={handleCameraCapture}
        />
      )}""", """      {showCamera && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center text-zinc-400">Loading Camera...</div>}>
          <CameraCapture
            onClose={() => setShowCamera(false)}
            onCapture={handleCameraCapture}
          />
        </Suspense>
      )}""")

# Dynamic import Tone
content = content.replace("await Tone.start();\n        console.log('🔊 Audio context resumed');", "const Tone = await import('tone');\n        await Tone.start();\n        console.log('🔊 Audio context resumed');")

content = content.replace("await Tone.start();\n        const synth = new Tone.PolySynth(Tone.Synth", "const Tone = await import('tone');\n        await Tone.start();\n        const synth = new Tone.PolySynth(Tone.Synth")

with open("components/Home/HomePage.tsx", "w") as f:
    f.write(content)

print("HomePage optimized!")
