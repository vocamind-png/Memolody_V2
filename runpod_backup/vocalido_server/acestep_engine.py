import json
import requests
import time
from typing import Optional, List

ACESTEP_URL = "http://localhost:8001"

import json
import requests
import time
from typing import Optional, List

ACESTEP_URL = "http://localhost:8001"

def submit_acestep_task(prompt: str, lyrics: str = "", duration: int = 30) -> dict:
    """
    Submits a task to the local ACE-Step API and returns the task ID.
    """
    try:
        payload = {
            "prompt": prompt,
            "lyrics": lyrics,
            "task_type": "text2music",
            "thinking": True,
            "audio_duration": float(duration)
        }
        res = requests.post(f"{ACESTEP_URL}/release_task", json=payload, timeout=10)
        res_json = res.json()
        if res_json.get("code") != 200:
            return {"error": f"ACE-Step release_task error: {res_json}"}
            
        return {"task_id": res_json["data"]["task_id"]}
    except Exception as e:
        return {"error": f"ACE-Step API Error: {str(e)}"}

def poll_acestep_task(task_id: str) -> dict:
    """
    Polls the local ACE-Step API for a given task ID.
    """
    try:
        poll_payload = {"task_id_list": json.dumps([task_id])}
        poll_res = requests.post(f"{ACESTEP_URL}/query_result", json=poll_payload, timeout=10)
        poll_json = poll_res.json()
        
        if poll_json.get("code") != 200:
            return {"error": f"ACE-Step query_result error: {poll_json}"}
            
        if not poll_json.get("data"):
            return {"status": "processing"}
            
        task_data = poll_json["data"][0]
        status = task_data.get("status")
        
        if status == 1: # Success
            result_str = task_data.get("result", "[]")
            result_obj = json.loads(result_str)
            if not result_obj:
                return {"error": "ACE-Step returned empty result."}
            
            audio_path = result_obj[0].get("file")
            
            if audio_path.startswith("http"):
                audio_url = audio_path
            else:
                audio_url = f"{ACESTEP_URL}{audio_path}"
                
            audio_res = requests.get(audio_url, timeout=30)
            if audio_res.status_code == 200:
                return {"status": "success", "audio_bytes": audio_res.content}
            else:
                return {"error": f"Failed to download ACE-Step audio: {audio_res.status_code}"}
                
        elif status == 2 or status == -1: # Failed
            return {"error": f"ACE-Step generation failed: {task_data.get('error', 'Unknown Error')}"}
            
        # status 0 = processing
        return {"status": "processing", "progress_text": task_data.get("progress_text", "")}
        
    except Exception as e:
        return {"error": f"ACE-Step Polling Error: {str(e)}"}

