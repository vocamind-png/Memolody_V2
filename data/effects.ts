import { EffectCategory } from '../types';

export const EFFECT_LIBRARY: EffectCategory[] = [
  {
    name: 'Amps and Pedals',
    plugins: [
      { id: 'amp_classic', name: 'Classic Amp', category: 'Amps and Pedals', description: 'Vintage tube amplifier simulation.', parameters: [] },
      { id: 'pedal_overdrive', name: 'Overdrive Pedal', category: 'Amps and Pedals', description: 'Warm, classic overdrive.', parameters: [] },
    ],
  },
  {
    name: 'Delay',
    plugins: [
      { id: 'delay_tape', name: 'Tape Echo', category: 'Delay', description: 'Vintage tape delay simulation.', parameters: [] },
      { id: 'delay_digital', name: 'Digital Delay', category: 'Delay', description: 'Clean, precise digital repeats.', parameters: [] },
      { id: 'delay_pingpong', name: 'Ping-Pong Delay', category: 'Delay', description: 'Stereo panning delay.', parameters: [] },
    ],
  },
  {
    name: 'Distortion',
    plugins: [
      { id: 'dist_fuzz', name: 'Fuzz', category: 'Distortion', description: 'Aggressive, saturated distortion.', parameters: [] },
      { id: 'dist_bitcrusher', name: 'Bitcrusher', category: 'Distortion', description: 'Lo-fi digital distortion.', parameters: [] },
    ],
  },
  {
    name: 'Dynamics',
    plugins: [
      { id: 'dyn_compressor', name: 'Compressor', category: 'Dynamics', description: 'Reduces dynamic range.', parameters: [] },
      { id: 'dyn_limiter', name: 'Limiter', category: 'Dynamics', description: 'Hard peak limiting.', parameters: [] },
      { id: 'dyn_gate', name: 'Noise Gate', category: 'Dynamics', description: 'Reduces low-level noise.', parameters: [] },
    ],
  },
  {
    name: 'EQ',
    plugins: [
      { id: 'eq_parametric', name: 'Parametric EQ', category: 'EQ', description: 'Surgical equalization tool.', parameters: [] },
      { id: 'eq_graphic', name: 'Graphic EQ', category: 'EQ', description: 'Visual frequency band EQ.', parameters: [] },
    ],
  },
  {
    name: 'Filter',
    plugins: [
      { id: 'filter_lowpass', name: 'Low-Pass Filter', category: 'Filter', description: 'Cuts high frequencies.', parameters: [] },
      { id: 'filter_highpass', name: 'High-Pass Filter', category: 'Filter', description: 'Cuts low frequencies.', parameters: [] },
      { id: 'filter_wah', name: 'Auto-Wah', category: 'Filter', description: 'Envelope-controlled filter.', parameters: [] },
    ],
  },
  {
    name: 'Imaging',
    plugins: [
      { id: 'img_stereo', name: 'Stereo Imager', category: 'Imaging', description: 'Adjusts stereo width.', parameters: [] },
    ],
  },
  {
    name: 'Metering',
    plugins: [
      { id: 'meter_vu', name: 'VU Meter', category: 'Metering', description: 'Volume Unit metering.', parameters: [] },
    ],
  },
  {
    name: 'Modulation',
    plugins: [
      { id: 'mod_chorus', name: 'Chorus', category: 'Modulation', description: 'Creates a thick, shimmering sound.', parameters: [] },
      { id: 'mod_flanger', name: 'Flanger', category: 'Modulation', description: 'Creates a jet-like sweeping effect.', parameters: [] },
      { id: 'mod_phaser', name: 'Phaser', category: 'Modulation', description: 'Creates swirling phase-shift effects.', parameters: [] },
    ],
  },
  {
    name: 'Multi Effects',
    plugins: [
      { id: 'multi_channelstrip', name: 'Channel Strip', category: 'Multi Effects', description: 'All-in-one channel processing.', parameters: [] },
    ],
  },
  {
    name: 'Pitch',
    plugins: [
      { id: 'pitch_shifter', name: 'Pitch Shifter', category: 'Pitch', description: 'Transposes pitch in real-time.', parameters: [] },
    ],
  },
  {
    name: 'Reverb',
    plugins: [
      { id: 'reverb_hall', name: 'Hall Reverb', category: 'Reverb', description: 'Simulates a large concert hall.', parameters: [] },
      { id: 'reverb_plate', name: 'Plate Reverb', category: 'Reverb', description: 'Simulates a vintage plate reverb.', parameters: [] },
      { id: 'reverb_room', name: 'Room Reverb', category: 'Reverb', description: 'Simulates a small room.', parameters: [] },
    ],
  },
  {
    name: 'Specialized',
    plugins: [
      { id: 'spec_vocoder', name: 'Vocoder', category: 'Specialized', description: 'Synthesizes voice with a carrier signal.', parameters: [] },
    ],
  },
  {
    name: 'Utility',
    plugins: [
      { id: 'util_tuner', name: 'Tuner', category: 'Utility', description: 'Instrument tuner.', parameters: [] },
    ],
  },
];
