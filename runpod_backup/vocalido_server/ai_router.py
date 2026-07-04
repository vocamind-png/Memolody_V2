import time

# Config flags to enable/disable engines easily
ENABLE_GEMINI = True
ENABLE_MAGENTA = True
ENABLE_SYMPHONYNET = True

def generate_arrangement(payload: dict) -> dict:
    """
    Traffic controller for Multi-Engine AI Arranger.
    Payload expected:
    {
      "engine": "gemini" | "magenta" | "symphonynet",
      "leadMelody": [{...notes...}],
      "config": { "style": "Pop", "key": "C", "bpm": 120 }
    }
    """
    engine_id = payload.get("engine", "auto").lower()
    config = payload.get("config", {})
    style = config.get("style", "Pop").lower()
    
    # Auto-routing logic based on style
    if engine_id == "auto":
        classical_styles = ["classical", "orchestral", "symphonic", "cinematic"]
        if any(s in style for s in classical_styles):
            engine_id = "symphonynet" if ENABLE_SYMPHONYNET else "gemini"
            print(f"[AI Router] Auto-routed style '{style}' to {engine_id}")
        else:
            engine_id = "gemini"
            print(f"[AI Router] Auto-routed style '{style}' to {engine_id}")
    
    try:
        if engine_id == "gemini":
            if not ENABLE_GEMINI:
                return {"error": "Gemini engine is currently disabled in config."}
            from gemini_engine import generate_arrangement_with_midi
            return generate_arrangement_with_midi(payload)
            
        elif engine_id == "magenta":
            if not ENABLE_MAGENTA:
                return {"error": "Magenta engine is currently disabled in config."}
            try:
                from magenta_engine import generate_arrangement_magenta
                return generate_arrangement_magenta(payload)
            except ImportError:
                return {"error": "Google Magenta module not found. Please install magenta requirements or disable ENABLE_MAGENTA."}
                
        elif engine_id == "symphonynet":
            if not ENABLE_SYMPHONYNET:
                return {"error": "SymphonyNet engine is currently disabled in config."}
            try:
                from symphony_engine import generate_arrangement_symphony
                return generate_arrangement_symphony(payload)
            except ImportError:
                return {"error": "SymphonyNet module not found. Please clone the SymphonyNet repository or disable ENABLE_SYMPHONYNET."}
                
        elif engine_id == "choir":
            from choir_engine import generate_arrangement_choir
            return generate_arrangement_choir(payload)
            
        else:
            return {"error": f"Unknown engine ID: {engine_id}"}
            
    except Exception as e:
        print(f"[AI Router] Error routing to {engine_id}: {e}")
        return {"error": str(e)}
