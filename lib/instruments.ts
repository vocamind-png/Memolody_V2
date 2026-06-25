export interface InstrumentGroup {
  name: string;
  instruments: { id: string; name: string }[];
}

export const GM_INSTRUMENTS: InstrumentGroup[] = [
  {
    name: 'Advanced Rendering',
    instruments: [
      { id: 'Instrumento AI', name: '✨ Instrumento AI (Stem Render)' },
      { id: 'VST / Audio Unit', name: '🔌 VST / Audio Unit Plugin' }
    ]
  },
  {
    name: 'Piano',
    instruments: [
      { id: 'acoustic_grand_piano', name: '1. Acoustic Grand Piano' },
      { id: 'bright_acoustic_piano', name: '2. Bright Acoustic Piano' },
      { id: 'electric_grand_piano', name: '3. Electric Grand Piano' },
      { id: 'honkytonk_piano', name: '4. Honky-tonk Piano' },
      { id: 'electric_piano_1', name: '5. Electric Piano 1' },
      { id: 'electric_piano_2', name: '6. Electric Piano 2' },
      { id: 'harpsichord', name: '7. Harpsichord' },
      { id: 'clavinet', name: '8. Clavinet' }
    ]
  },
  {
    name: 'Chromatic Percussion',
    instruments: [
      { id: 'celesta', name: '9. Celesta' },
      { id: 'glockenspiel', name: '10. Glockenspiel' },
      { id: 'music_box', name: '11. Music Box' },
      { id: 'vibraphone', name: '12. Vibraphone' },
      { id: 'marimba', name: '13. Marimba' },
      { id: 'xylophone', name: '14. Xylophone' },
      { id: 'tubular_bells', name: '15. Tubular Bells' },
      { id: 'dulcimer', name: '16. Dulcimer' }
    ]
  },
  {
    name: 'Organ',
    instruments: [
      { id: 'drawbar_organ', name: '17. Drawbar Organ' },
      { id: 'percussive_organ', name: '18. Percussive Organ' },
      { id: 'rock_organ', name: '19. Rock Organ' },
      { id: 'church_organ', name: '20. Church Organ' },
      { id: 'reed_organ', name: '21. Reed Organ' },
      { id: 'accordion', name: '22. Accordion' },
      { id: 'harmonica', name: '23. Harmonica' },
      { id: 'tango_accordion', name: '24. Tango Accordion' }
    ]
  },
  {
    name: 'Guitar',
    instruments: [
      { id: 'acoustic_guitar_nylon', name: '25. Acoustic Guitar (nylon)' },
      { id: 'acoustic_guitar_steel', name: '26. Acoustic Guitar (steel)' },
      { id: 'electric_guitar_jazz', name: '27. Electric Guitar (jazz)' },
      { id: 'electric_guitar_clean', name: '28. Electric Guitar (clean)' },
      { id: 'electric_guitar_muted', name: '29. Electric Guitar (muted)' },
      { id: 'overdriven_guitar', name: '30. Overdriven Guitar' },
      { id: 'distortion_guitar', name: '31. Distortion Guitar' },
      { id: 'guitar_harmonics', name: '32. Guitar harmonics' }
    ]
  },
  {
    name: 'Bass',
    instruments: [
      { id: 'acoustic_bass', name: '33. Acoustic Bass' },
      { id: 'electric_bass_finger', name: '34. Electric Bass (finger)' },
      { id: 'electric_bass_pick', name: '35. Electric Bass (pick)' },
      { id: 'fretless_bass', name: '36. Fretless Bass' },
      { id: 'slap_bass_1', name: '37. Slap Bass 1' },
      { id: 'slap_bass_2', name: '38. Slap Bass 2' },
      { id: 'synth_bass_1', name: '39. Synth Bass 1' },
      { id: 'synth_bass_2', name: '40. Synth Bass 2' }
    ]
  },
  {
    name: 'Strings',
    instruments: [
      { id: 'violin', name: '41. Violin' },
      { id: 'viola', name: '42. Viola' },
      { id: 'cello', name: '43. Cello' },
      { id: 'contrabass', name: '44. Contrabass' },
      { id: 'tremolo_strings', name: '45. Tremolo Strings' },
      { id: 'pizzicato_strings', name: '46. Pizzicato Strings' },
      { id: 'orchestral_harp', name: '47. Orchestral Harp' },
      { id: 'timpani', name: '48. Timpani' }
    ]
  },
  {
    name: 'Ensemble',
    instruments: [
      { id: 'string_ensemble_1', name: '49. String Ensemble 1' },
      { id: 'string_ensemble_2', name: '50. String Ensemble 2' },
      { id: 'synth_strings_1', name: '51. Synth Strings 1' },
      { id: 'synth_strings_2', name: '52. Synth Strings 2' },
      { id: 'choir_aahs', name: '53. Choir Aahs' },
      { id: 'voice_oohs', name: '54. Voice Oohs' },
      { id: 'synth_choir', name: '55. Synth Voice' },
      { id: 'orchestra_hit', name: '56. Orchestra Hit' }
    ]
  },
  {
    name: 'Brass',
    instruments: [
      { id: 'trumpet', name: '57. Trumpet' },
      { id: 'trombone', name: '58. Trombone' },
      { id: 'tuba', name: '59. Tuba' },
      { id: 'muted_trumpet', name: '60. Muted Trumpet' },
      { id: 'french_horn', name: '61. French Horn' },
      { id: 'brass_section', name: '62. Brass Section' },
      { id: 'synth_brass_1', name: '63. Synth Brass 1' },
      { id: 'synth_brass_2', name: '64. Synth Brass 2' }
    ]
  },
  {
    name: 'Reed',
    instruments: [
      { id: 'soprano_sax', name: '65. Soprano Sax' },
      { id: 'alto_sax', name: '66. Alto Sax' },
      { id: 'tenor_sax', name: '67. Tenor Sax' },
      { id: 'baritone_sax', name: '68. Baritone Sax' },
      { id: 'oboe', name: '69. Oboe' },
      { id: 'english_horn', name: '70. English Horn' },
      { id: 'bassoon', name: '71. Bassoon' },
      { id: 'clarinet', name: '72. Clarinet' }
    ]
  },
  {
    name: 'Pipe',
    instruments: [
      { id: 'piccolo', name: '73. Piccolo' },
      { id: 'flute', name: '74. Flute' },
      { id: 'recorder', name: '75. Recorder' },
      { id: 'pan_flute', name: '76. Pan Flute' },
      { id: 'blown_bottle', name: '77. Blown Bottle' },
      { id: 'shakuhachi', name: '78. Shakuhachi' },
      { id: 'whistle', name: '79. Whistle' },
      { id: 'ocarina', name: '80. Ocarina' }
    ]
  },
  {
    name: 'Synth Lead',
    instruments: [
      { id: 'lead_1_square', name: '81. Lead 1 (square)' },
      { id: 'lead_2_sawtooth', name: '82. Lead 2 (sawtooth)' },
      { id: 'lead_3_calliope', name: '83. Lead 3 (calliope)' },
      { id: 'lead_4_chiff', name: '84. Lead 4 (chiff)' },
      { id: 'lead_5_charang', name: '85. Lead 5 (charang)' },
      { id: 'lead_6_voice', name: '86. Lead 6 (voice)' },
      { id: 'lead_7_fifths', name: '87. Lead 7 (fifths)' },
      { id: 'lead_8_bass__lead', name: '88. Lead 8 (bass + lead)' }
    ]
  },
  {
    name: 'Synth Pad',
    instruments: [
      { id: 'pad_1_new_age', name: '89. Pad 1 (new age)' },
      { id: 'pad_2_warm', name: '90. Pad 2 (warm)' },
      { id: 'pad_3_polysynth', name: '91. Pad 3 (polysynth)' },
      { id: 'pad_4_choir', name: '92. Pad 4 (choir)' },
      { id: 'pad_5_bowed', name: '93. Pad 5 (bowed)' },
      { id: 'pad_6_metallic', name: '94. Pad 6 (metallic)' },
      { id: 'pad_7_halo', name: '95. Pad 7 (halo)' },
      { id: 'pad_8_sweep', name: '96. Pad 8 (sweep)' }
    ]
  },
  {
    name: 'Synth Effects',
    instruments: [
      { id: 'fx_1_rain', name: '97. FX 1 (rain)' },
      { id: 'fx_2_soundtrack', name: '98. FX 2 (soundtrack)' },
      { id: 'fx_3_crystal', name: '99. FX 3 (crystal)' },
      { id: 'fx_4_atmosphere', name: '100. FX 4 (atmosphere)' },
      { id: 'fx_5_brightness', name: '101. FX 5 (brightness)' },
      { id: 'fx_6_goblins', name: '102. FX 6 (goblins)' },
      { id: 'fx_7_echoes', name: '103. FX 7 (echoes)' },
      { id: 'fx_8_scifi', name: '104. FX 8 (sci-fi)' }
    ]
  },
  {
    name: 'Ethnic',
    instruments: [
      { id: 'sitar', name: '105. Sitar' },
      { id: 'banjo', name: '106. Banjo' },
      { id: 'shamisen', name: '107. Shamisen' },
      { id: 'koto', name: '108. Koto' },
      { id: 'kalimba', name: '109. Kalimba' },
      { id: 'bag_pipe', name: '110. Bag pipe' },
      { id: 'fiddle', name: '111. Fiddle' },
      { id: 'shanai', name: '112. Shanai' }
    ]
  },
  {
    name: 'Percussive',
    instruments: [
      { id: 'tinkle_bell', name: '113. Tinkle Bell' },
      { id: 'agogo', name: '114. Agogo' },
      { id: 'steel_drums', name: '115. Steel Drums' },
      { id: 'woodblock', name: '116. Woodblock' },
      { id: 'taiko_drum', name: '117. Taiko Drum' },
      { id: 'melodic_tom', name: '118. Melodic Tom' },
      { id: 'synth_drum', name: '119. Synth Drum' },
      { id: 'reverse_cymbal', name: '120. Reverse Cymbal' }
    ]
  },
  {
    name: 'Sound Effects',
    instruments: [
      { id: 'guitar_fret_noise', name: '121. Guitar Fret Noise' },
      { id: 'breath_noise', name: '122. Breath Noise' },
      { id: 'seashore', name: '123. Seashore' },
      { id: 'bird_tweet', name: '124. Bird Tweet' },
      { id: 'telephone_ring', name: '125. Telephone Ring' },
      { id: 'helicopter', name: '126. Helicopter' },
      { id: 'applause', name: '127. Applause' },
      { id: 'gunshot', name: '128. Gunshot' }
    ]
  }
];
