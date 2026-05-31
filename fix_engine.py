import re

with open('lib/MusicEngine.ts', 'r') as f:
    content = f.read()

# 1. Add import
if "import { PitchShifter } from 'soundtouchjs';" not in content:
    content = content.replace("import * as Tone from 'tone';", "import * as Tone from 'tone';\nimport { PitchShifter } from 'soundtouchjs';")

# 2. Add class properties
if "public vocalPitchShifters" not in content:
    props = """
  // Vocal pitch shifting states
  public vocalPitchShifters: Map<string, PitchShifter[]> = new Map();
  public vocalPitchStems: Map<string, PitchShifter[]> = new Map();
  public vocalPitchShiftSemitones: Map<string, number> = new Map();
"""
    content = content.replace("public vocalAudioElements", props.strip() + "\n  public vocalAudioElements")

# 3. Add to addVocalLayer (main mix)
if "new PitchShifter" not in content:
    main_mix_replace = """
            if (myGeneration === this._vocalGenerations.get(trackId)) {
              mainPlayer = player;
              if (renderBpm) (mainPlayer as any).renderBpm = renderBpm;
              // Initialize PitchShifter
              if (!this.vocalPitchShifters.has(trackId)) this.vocalPitchShifters.set(trackId, []);
              const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);
              const dummy = Tone.getContext().rawContext.createBufferSource();
              dummy.buffer = Tone.getContext().rawContext.createBuffer(1, 1, Tone.getContext().rawContext.sampleRate);
              dummy.loop = true;
              dummy.connect(shifter.node);
              dummy.start();
              (shifter as any)._dummySource = dummy;
              this.vocalPitchShifters.get(trackId)!.push(shifter);
            } else {
"""
    content = re.sub(
        r"if \(myGeneration === this\._vocalGenerations\.get\(trackId\)\) \{\s*mainPlayer = player;\s*if \(renderBpm\) \(mainPlayer as any\)\.renderBpm = renderBpm;\s*\} else \{",
        main_mix_replace.strip(),
        content
    )

    stems_replace = """
              if (myGeneration === this._vocalGenerations.get(trackId)) {
                loadedStems[index] = player;
                if (renderBpm) (player as any).renderBpm = renderBpm;
                // Initialize Stem PitchShifter
                if (!this.vocalPitchStems.has(trackId)) this.vocalPitchStems.set(trackId, []);
                const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);
                const dummy2 = Tone.getContext().rawContext.createBufferSource();
                dummy2.buffer = Tone.getContext().rawContext.createBuffer(1, 1, Tone.getContext().rawContext.sampleRate);
                dummy2.loop = true;
                dummy2.connect(shifter.node);
                dummy2.start();
                (shifter as any)._dummySource = dummy2;
                this.vocalPitchStems.get(trackId)![index] = shifter;
              } else {
"""
    content = re.sub(
        r"if \(myGeneration === this\._vocalGenerations\.get\(trackId\)\) \{\s*loadedStems\[index\] = player;\s*if \(renderBpm\) \(player as any\)\.renderBpm = renderBpm;\s*\} else \{",
        stems_replace.strip(),
        content
    )

# 4. Add to clearVocalLayers
if "vocalPitchShifters.delete" not in content:
    clear_replace = """
    this.trackActiveStem.set(trackId, null);

    const shifters = this.vocalPitchShifters.get(trackId);
    if (shifters) {
      shifters.forEach(shifter => { try { shifter.disconnect(); } catch (e) {} });
    }
    const stemShifters = this.vocalPitchStems.get(trackId);
    if (stemShifters) {
      stemShifters.forEach(shifter => { try { shifter?.disconnect(); } catch (e) {} });
    }
    
    // Clear arrays
    this.vocalPitchShifters.delete(trackId);
    this.vocalPitchStems.delete(trackId);
"""
    content = content.replace("this.trackActiveStem.set(trackId, null);", clear_replace)

# 5. Add setVocalTranspose & updateVocalPlaybackState overrides
if "public setVocalTranspose" not in content:
    update_func = """
  public setVocalTranspose(trackId: string, diffSemitones: number) {
    this.vocalPitchShiftSemitones.set(trackId, diffSemitones);
    console.log(`[MusicEngine] setVocalTranspose: ${trackId} diff=${diffSemitones}`);
    this.updateVocalPlaybackState();
  }

  public updateVocalPlaybackState(time?: number) {
    const transportState = Tone.Transport.state;
    const transportSeconds = Tone.Transport.seconds;
    const countIn = this.countInDuration || 0;
    const songTime = transportSeconds - countIn;
    const triggerTime = time !== undefined ? time : Tone.now();

    const currentBpm = Tone.Transport.bpm.value;

    this.trackVocalLayers.forEach((players, trackId) => {
      const shifters = this.vocalPitchShifters.get(trackId) || [];
      const diffSemitones = this.vocalPitchShiftSemitones.get(trackId) || 0;

      players.forEach((player, i) => {
        if (!player || !player.buffer || !player.buffer.loaded) return;
        const shifter = shifters[i];
        
        try { player.stop(triggerTime); } catch (e) {}
        if (shifter) shifter.disconnect();

        const renderBpm = (player as any).renderBpm || currentBpm;
        const ratio = currentBpm / renderBpm;
        const duration = player.buffer.duration;
        const offsetInAudio = Math.max(0, songTime * ratio);

        if (offsetInAudio >= duration) return;

        if (diffSemitones !== 0 && shifter) {
          shifter.tempo = ratio;
          shifter.pitchSemitones = diffSemitones;
          shifter.percentagePlayed = offsetInAudio / duration;
          if (transportState === 'started') {
            const channel = this.trackChannels.get(trackId);
            if (channel) Tone.connect(shifter.node, channel);
          }
        } else {
          if (typeof player.playbackRate === 'number') {
            player.playbackRate = ratio;
          } else if (player.playbackRate && (player.playbackRate as any).value !== undefined) {
            (player.playbackRate as any).value = ratio;
          }
          if (transportState === 'started') {
            if (songTime < 0) {
              player.start(triggerTime + (-songTime), 0);
            } else {
              player.start(triggerTime, offsetInAudio);
            }
          }
        }
      });
    });

    this.trackVocalStems.forEach((players, trackId) => {
      const shifters = this.vocalPitchStems.get(trackId) || [];
      const diffSemitones = this.vocalPitchShiftSemitones.get(trackId) || 0;

      players.forEach((player, i) => {
        if (!player) return;
        if (!player.buffer || !player.buffer.loaded) return;
        const shifter = shifters[i];
        
        try { player.stop(triggerTime); } catch (e) {}
        if (shifter) shifter.disconnect();

        const renderBpm = (player as any).renderBpm || currentBpm;
        const ratio = currentBpm / renderBpm;
        const duration = player.buffer.duration;
        const offsetInAudio = Math.max(0, songTime * ratio);

        if (offsetInAudio >= duration) return;

        if (diffSemitones !== 0 && shifter) {
          shifter.tempo = ratio;
          shifter.pitchSemitones = diffSemitones;
          shifter.percentagePlayed = offsetInAudio / duration;
          if (transportState === 'started') {
            const channel = this.trackChannels.get(trackId);
            if (channel) Tone.connect(shifter.node, channel);
          }
        } else {
          if (typeof player.playbackRate === 'number') {
            player.playbackRate = ratio;
          } else if (player.playbackRate && (player.playbackRate as any).value !== undefined) {
            (player.playbackRate as any).value = ratio;
          }
          if (transportState === 'started') {
            if (songTime < 0) {
              player.start(triggerTime + (-songTime), 0);
            } else {
              player.start(triggerTime, offsetInAudio);
            }
          }
        }
      });
    });
  }
"""
    content = re.sub(
        r"  public updateVocalPlaybackState\(time\?: number\) \{[\s\S]*?getTrackLevel\(trackId: string\)",
        update_func.strip() + "\n\n  getTrackLevel(trackId: string)",
        content
    )

with open('lib/MusicEngine.ts', 'w') as f:
    f.write(content)

