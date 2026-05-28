with open('vocalido_server/ds_engine.py', 'r') as f:
    content = f.read()

new_content = content.replace("        if not ph_seq:\n        if not ph_seq:\n            return None", "        if not ph_seq:\n            return None")

with open('vocalido_server/ds_engine.py', 'w') as f:
    f.write(new_content)
