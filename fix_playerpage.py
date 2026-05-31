import re

with open("components/Player/PlayerPage.tsx", "r") as f:
    content = f.read()

# Add lazy, Suspense to React import if missing
if "lazy," not in content:
    content = content.replace("import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';", "import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';")

# Replace static imports with lazy imports
def make_lazy(import_statement, component_name, path):
    global content
    content = content.replace(import_statement, f"const {component_name} = lazy(() => import('{path}'));")

make_lazy("import ChordPage from '../Chord/ChordPage';", "ChordPage", "../Chord/ChordPage")
make_lazy("import AudioEngineSettings from '../Settings/AudioEngineSettings';", "AudioEngineSettings", "../Settings/AudioEngineSettings")
make_lazy("import MemoPractice from './MemoPractice';", "MemoPractice", "./MemoPractice")
make_lazy("import LoopMatrixModal, { LoopPreset } from './LoopMatrixModal';", "const LoopMatrixModal = lazy(() => import('./LoopMatrixModal'));\n// import { LoopPreset } from './LoopMatrixModal';", "./LoopMatrixModal")
# Oh wait, LoopPreset is a type. Types can't be lazy loaded. We just import it as type.
content = content.replace("const LoopMatrixModal = lazy(() => import('./LoopMatrixModal'));\n// import { LoopPreset } from './LoopMatrixModal';", "import type { LoopPreset } from './LoopMatrixModal';\nconst LoopMatrixModal = lazy(() => import('./LoopMatrixModal'));")

# Wrap usages with Suspense
content = re.sub(r'(<AudioEngineSettings[^>]*/>)', r'<Suspense fallback={<div className="p-4 text-zinc-400">Loading settings...</div>}>\1</Suspense>', content)
content = re.sub(r'(<ChordPage[^>]*/>)', r'<Suspense fallback={<div className="p-4 text-zinc-400">Loading chord page...</div>}>\1</Suspense>', content)
content = re.sub(r'(<MemoPractice[^>]*/>)', r'<Suspense fallback={<div className="p-4 text-zinc-400">Loading practice...</div>}>\1</Suspense>', content)
content = re.sub(r'(<LoopMatrixModal[^>]*/>)', r'<Suspense fallback={<div className="p-4 text-zinc-400">Loading loop matrix...</div>}>\1</Suspense>', content)

with open("components/Player/PlayerPage.tsx", "w") as f:
    f.write(content)

print("PlayerPage optimized!")
