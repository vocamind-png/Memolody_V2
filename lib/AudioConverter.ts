// @ts-ignore
import lamejs from 'lamejs';

export class AudioConverter {
  static async webmToWav(webmBlob: Blob): Promise<Blob> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    let numOfChan = audioBuffer.numberOfChannels;
    let length = audioBuffer.length * numOfChan * 2 + 44;
    let bufferArray = new ArrayBuffer(length);
    let view = new DataView(bufferArray);
    let channels = [];
    let offset = 0;
    let pos = 0;

    function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (2 bytes)
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4); // chunk length

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset])); 
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([bufferArray], { type: "audio/wav" });
  }

  static async webmToMp3(webmBlob: Blob): Promise<Blob> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    // lamejs requires 1 channel (mono) or 2 channels (stereo). We'll assume stereo if >1
    const useStereo = channels >= 2;
    
    // We downsample or just use the native sample rate if lamejs supports it.
    const mp3encoder = new lamejs.Mp3Encoder(useStereo ? 2 : 1, sampleRate, 128); // 128kbps
    const mp3Data = [];

    const left = audioBuffer.getChannelData(0);
    const right = useStereo ? audioBuffer.getChannelData(1) : left;

    // We must scale float32 [-1, 1] to int16 [-32768, 32767]
    const sampleBlockSize = 1152; 
    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = new Int16Array(right.length);

    for (let i = 0; i < left.length; i++) {
      leftInt16[i] = left[i] < 0 ? left[i] * 32768 : left[i] * 32767;
      if (useStereo) {
        rightInt16[i] = right[i] < 0 ? right[i] * 32768 : right[i] * 32767;
      }
    }

    for (let i = 0; i < left.length; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const rightChunk = useStereo ? rightInt16.subarray(i, i + sampleBlockSize) : leftChunk;
      
      let mp3buf;
      if (useStereo) {
        mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      } else {
        mp3buf = mp3encoder.encodeBuffer(leftChunk);
      }
      
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }
}
