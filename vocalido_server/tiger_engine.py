"""tiger_engine.py -- TIGER DiffSinger v106 English SVS Engine (ONNX)"""
import os, re
import numpy as np

TIGER_DIR  = os.path.join(os.path.dirname(__file__),"checkpoints","tiger_v106")
DUR_DIR    = os.path.join(TIGER_DIR,"dsdur","files")
PITCH_DIR  = os.path.join(TIGER_DIR,"dspitch","files")
ACOU_DIR   = os.path.join(TIGER_DIR,"dsacoustic")
VOC_DIR    = os.path.join(TIGER_DIR,"dsvocoder")
HOP_SIZE=512; SAMPLE_RATE=44100; FRAME_HZ=SAMPLE_RATE/HOP_SIZE
DEFAULT_SPK="tiger_fresh"

ARPABET_TO_TIGER={
    "AA":"aa","AE":"ae","AH":"ah","AO":"ao","AW":"aw","AY":"ay",
    "EH":"eh","ER":"er","EY":"ey","IH":"ih","IY":"iy","OW":"ow","OY":"oy","UH":"uh","UW":"uw",
    "B":"b","CH":"ch","D":"d","DH":"dh","DX":"dx","F":"f","G":"g","HH":"hh","JH":"jh",
    "K":"k","L":"l","M":"m","N":"n","NG":"ng","P":"p","R":"r","S":"s","SH":"sh","T":"t",
    "TH":"th","V":"v","W":"w","Y":"y","Z":"z","ZH":"zh","Q":"q","TR":"tr","DR":"dr",
}
def _norm(ph): return ARPABET_TO_TIGER.get(re.sub(r"\d$","",ph).upper(),"ah")
def _hz(midi): return 440.0*(2.0**((midi-69)/12.0))

class TigerEngine:
    def __init__(self):
        self._ready=False;self._sess={};self._phonemes=[];self._ph2id={}
        self._embs={};self._g2p=None;self._try_load()

    def _try_load(self):
        try:
            import onnxruntime as ort
            prov=["CPUExecutionProvider"]
            def ld(p,n):
                s=ort.InferenceSession(p,providers=prov); print(f"[T] {n}"); return s
            self._sess["ling"]=ld(os.path.join(DUR_DIR,"linguistic.onnx"),"linguistic")
            self._sess["dur"]=ld(os.path.join(DUR_DIR,"dur.onnx"),"dur")
            self._sess["pitch"]=ld(os.path.join(PITCH_DIR,"pitch.onnx"),"pitch")
            self._sess["acou"]=ld(os.path.join(ACOU_DIR,"acoustic.onnx"),"acoustic")
            self._sess["voc"]=ld(os.path.join(VOC_DIR,"tgm_hifigan.onnx"),"vocoder")
            with open(os.path.join(DUR_DIR,"phonemes.txt")) as f:
                self._phonemes=[l.strip() for l in f if l.strip()]
            self._ph2id={p:i for i,p in enumerate(self._phonemes)}
            for fn in os.listdir(ACOU_DIR):
                if fn.endswith(".emb"):
                    self._embs[fn[:-4]]=np.fromfile(os.path.join(ACOU_DIR,fn),dtype=np.float32)[:256]
            from g2p_en import G2p; self._g2p=G2p()
            self._ready=True; print("[TIGER] READY -- English singing!")
        except Exception as e:
            import traceback;traceback.print_exc();print(f"[TIGER] FAIL:{e}")

    @property
    def is_ready(self): return self._ready
    def _ph(self,t):
        phs=[]
        for w in t.strip().split():
            r=self._g2p(w); m=[_norm(p) for p in r if p.strip() and p!=" "]
            v=[p for p in m if p in self._ph2id]; phs.extend(v if v else ["ah"])
        return phs if phs else ["ah"]
    def _emb(self,spk):
        e=self._embs.get(spk,self._embs.get(DEFAULT_SPK,next(iter(self._embs.values()))))
        return e.copy()

    def synthesize(self,notes,speaker=DEFAULT_SPK,steps=20,depth=0.5,gender=0.0,velocity=0.5):
        if not self._ready: raise RuntimeError("TIGER not ready")
        SP_ID=self._ph2id.get("SP",2); spk256=self._emb(speaker)
        SP_FR=max(2,round(0.05*FRAME_HZ))

        # Build ALL tokens + ALL notes (including SP gaps as REST notes)
        all_tok=[]; all_ph_midi=[]
        word_div=[]; word_dur_fr=[]
        note_midi=[]; note_rest=[]; note_dur_fr=[]

        for i,note in enumerate(notes):
            midi=int(note.get("midi",60)); dur_s=float(note.get("duration",0.5))
            lyric=note.get("lyric","a").strip(); dur_fr=max(2,round(dur_s*FRAME_HZ))
            is_rest=lyric in ("","-","~","rest","_")
            phs=["SP"] if is_rest else self._ph(lyric)
            ids=[self._ph2id.get(p,SP_ID) for p in phs]
            all_tok.extend(ids); all_ph_midi.extend([midi]*len(ids))
            word_div.append(len(ids)); word_dur_fr.append(dur_fr)
            note_midi.append(float(midi)); note_rest.append(is_rest); note_dur_fr.append(dur_fr)

            if i<len(notes)-1:
                # SP gap -- treated as a REST note
                all_tok.append(SP_ID); all_ph_midi.append(0)
                word_div.append(1); word_dur_fr.append(SP_FR)
                note_midi.append(0.0); note_rest.append(True); note_dur_fr.append(SP_FR)

        n_tok=len(all_tok); n_notes=len(note_midi)
        tok_t=np.array([all_tok],dtype=np.int64)
        ph_midi_t=np.array([all_ph_midi],dtype=np.int64)
        wd_t=np.array([word_div],dtype=np.int64)
        wdur_t=np.array([word_dur_fr],dtype=np.int64)
        nm_t=np.array([note_midi],dtype=np.float32)
        nr_t=np.array([note_rest],dtype=bool)
        nd_t=np.array([note_dur_fr],dtype=np.int64)

        # Linguistic
        enc,masks=self._sess["ling"].run(None,{"tokens":tok_t,"word_div":wd_t,"word_dur":wdur_t})
        # Duration
        sk_tok=np.tile(spk256[None,None,:],(1,n_tok,1))
        (dpred,)=self._sess["dur"].run(None,{"encoder_out":enc,"x_masks":masks,
            "ph_midi":ph_midi_t,"spk_embed":sk_tok})
        # Build ph_dur from user timings
        upd=[]
        for wdur,wdiv in zip(word_dur_fr,word_div):
            per=max(1,wdur//wdiv); rem=wdur-per*wdiv
            for k in range(wdiv): upd.append(per+(1 if k==wdiv-1 and rem>0 else 0))
        ph_dur=np.array(upd,dtype=np.int64)
        n_frames=int(ph_dur.sum()); pdt=ph_dur[None,:]
        print(f"[T] n_tok={n_tok} n_notes={n_notes} n_frames={n_frames}")

        # F0 guide — exact Hz from MIDI notes, frame-by-frame
        tok_hz=[]; ti=0; ni=0
        for wdiv_v,wdur_v in zip(word_div,word_dur_fr):
            nr=note_rest[ni] if ni<len(note_rest) else True
            nm=note_midi[ni] if ni<len(note_midi) else 0
            hz_val=0.0 if nr else _hz(nm); ni+=1
            for k in range(wdiv_v): tok_hz.extend([hz_val]*int(ph_dur[ti+k]))
            ti+=wdiv_v
        f0a=np.array(tok_hz[:n_frames],dtype=np.float32)
        if len(f0a)<n_frames: f0a=np.pad(f0a,(0,n_frames-len(f0a)))
        f0i=f0a[None,:]  # Shape: (1, n_frames) — exact MIDI pitch in Hz

        # Run pitch model
        sk_fr=np.tile(spk256[None,None,:],(1,n_frames,1))
        ex=np.ones((1,n_frames),dtype=np.float32)
        rt=np.ones((1,n_frames),dtype=bool)  # True = generate pitch (correct mode)
        st=np.array(steps,dtype=np.int64)
        (pp,)=self._sess["pitch"].run(None,{"encoder_out":enc,"ph_dur":pdt,
            "note_midi":nm_t,"note_rest":nr_t,"note_dur":nd_t,
            "pitch":f0i,"expr":ex,"retake":rt,"spk_embed":sk_fr,"steps":st})

        # Acoustic model (use pp which now closely follows our MIDI F0 guide)
        no=pp.shape[1]; sk_o=np.tile(spk256[None,None,:],(1,no,1))
        ga=np.full((1,no),gender,dtype=np.float32); va=np.full((1,no),velocity,dtype=np.float32)
        dp=np.array(depth,dtype=np.float32)
        (mel,)=self._sess["acou"].run(None,{"tokens":tok_t,"durations":pdt,"f0":pp,
            "gender":ga,"velocity":va,"spk_embed":sk_o,"depth":dp,"steps":st})
        # Vocoder
        (wav,)=self._sess["voc"].run(None,{"mel":mel,"f0":pp})
        audio=wav[0].astype(np.float32)
        print(f"[TIGER] ✅ Done — {len(audio)/SAMPLE_RATE:.2f}s"); return audio

_engine=None
def _get():
    global _engine
    if _engine is None: _engine=TigerEngine()
    return _engine

def is_available(): return _get().is_ready
def synthesize(notes,speaker=DEFAULT_SPK,steps=20,depth=0.5):
    return _get().synthesize(notes,speaker=speaker,steps=steps,depth=depth)

if __name__=="__main__":
    import soundfile as sf
    eng=TigerEngine()
    if not eng.is_ready: exit(1)
    notes=[{"midi":60,"duration":0.6,"lyric":"Hello"},{"midi":62,"duration":0.6,"lyric":"world"},
           {"midi":64,"duration":0.5,"lyric":"I"},{"midi":65,"duration":0.6,"lyric":"love"},
           {"midi":67,"duration":0.5,"lyric":"to"},{"midi":69,"duration":0.9,"lyric":"sing"}]
    audio=eng.synthesize(notes,steps=15)
    sf.write("/tmp/tiger_test.wav",audio,SAMPLE_RATE)
    print(f"Saved /tmp/tiger_test.wav ({len(audio)/SAMPLE_RATE:.2f}s)")
