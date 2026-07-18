import re

with open('/Users/paisan/vocamind-projects/Memolody_V2/App.tsx', 'r') as f:
    content = f.read()

# Fix 1: ensure pause is called if currentView != 'home'
old_code = '''      bgmRef.current.play().then(() => {
        // If the user tapped the screen while we were waiting for the browser to allow autoplay,
        // we must immediately pause it now that it started.
        if (bgmStoppedRef.current && bgmRef.current) {
          bgmRef.current.pause();
        }
      }).catch(e => console.log('BGM autoplay blocked by browser:', e));'''

new_code = '''      bgmRef.current.play().then(() => {
        // If the user tapped the screen while we were waiting for the browser to allow autoplay,
        // we must immediately pause it now that it started.
        if ((bgmStoppedRef.current || currentView !== 'home') && bgmRef.current) {
          bgmRef.current.pause();
        }
      }).catch(e => console.log('BGM autoplay blocked by browser:', e));'''

content = content.replace(old_code, new_code)

with open('/Users/paisan/vocamind-projects/Memolody_V2/App.tsx', 'w') as f:
    f.write(content)

print("Patched App.tsx!")
