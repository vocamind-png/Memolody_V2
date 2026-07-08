with open("components/Home/HomePage.tsx", "r") as f:
    content = f.read()

target = """  return (
    <div className="absolute inset-0 flex flex-col bg-[#0A0A0B] overflow-y-auto overflow-x-hidden select-none" onScroll={handleScroll}>"""

replacement = """  return (
    <>
      {isImporting && (
        <audio 
          src="/audio/minuet_in_g.ogg" 
          autoPlay 
          loop 
          style={{ display: 'none' }}
        />
      )}
    <div className="absolute inset-0 flex flex-col bg-[#0A0A0B] overflow-y-auto overflow-x-hidden select-none" onScroll={handleScroll}>"""

if target in content:
    content = content.replace(target, replacement)
    # also we need to close the fragment at the end
    content = content.replace("    </div>\n  );\n}", "    </div>\n    </>\n  );\n}")
    with open("components/Home/HomePage.tsx", "w") as f:
        f.write(content)
    print("Patched BGM.")
else:
    print("Target not found, maybe already patched or syntax changed.")
