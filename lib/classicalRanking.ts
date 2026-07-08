export interface ClassicalRank {
  composer: string;
  keywords: string[];
  rank: number;
}

export const CLASSICAL_RANKING: ClassicalRank[] = [
  // Top 1 - 10
  { composer: 'beethoven', keywords: ['symphony no. 5', '5th symphony', 'symphony 5'], rank: 1 },
  { composer: 'vivaldi', keywords: ['spring', 'primavera', 'four seasons', '4 seasons'], rank: 2 },
  { composer: 'beethoven', keywords: ['symphony no. 9', '9th symphony', 'symphony 9', 'choral', 'ode to joy'], rank: 3 },
  { composer: 'mozart', keywords: ['eine kleine nachtmusik', 'serenade no. 13', 'k. 525'], rank: 4 },
  { composer: 'bach', keywords: ['toccata and fugue in d minor', 'bwv 565'], rank: 5 },
  { composer: 'pachelbel', keywords: ['canon', 'canon in d'], rank: 6 },
  { composer: 'beethoven', keywords: ['für elise', 'fur elise', 'bagatelle no. 25'], rank: 7 },
  { composer: 'beethoven', keywords: ['moonlight', 'sonata no. 14', 'op. 27 no. 2'], rank: 8 },
  { composer: 'tchaikovsky', keywords: ['swan lake', 'op. 20'], rank: 9 },
  { composer: 'bizet', keywords: ['carmen', 'toreador', 'toréador', 'habanera'], rank: 10 },

  // Top 11 - 30
  { composer: 'ravel', keywords: ['boléro', 'bolero'], rank: 11 },
  { composer: 'grieg', keywords: ['peer gynt', 'morning mood', 'morning'], rank: 12 },
  { composer: 'grieg', keywords: ['peer gynt', 'mountain king', 'hall of the mountain king'], rank: 13 },
  { composer: 'debussy', keywords: ['clair de lune', 'suite bergamasque'], rank: 14 },
  { composer: 'handel', keywords: ['messiah', 'hallelujah'], rank: 15 },
  { composer: 'mozart', keywords: ['symphony no. 40', '40th symphony', 'k. 550'], rank: 16 },
  { composer: 'strauss', keywords: ['blue danube', 'an der schönen blauen donau'], rank: 17 },
  { composer: 'chopin', keywords: ['nocturne in e-flat', 'op. 9 no. 2', 'nocturne op 9'], rank: 18 },
  { composer: 'mozart', keywords: ['requiem', 'lacrimosa', 'd minor', 'k. 626'], rank: 19 },
  { composer: 'bach', keywords: ['air on the g string', 'orchestral suite no. 3', 'bwv 1068'], rank: 20 },
  { composer: 'rossini', keywords: ['william tell', 'guillaume tell'], rank: 21 },
  { composer: 'barber', keywords: ['adagio for strings'], rank: 22 },
  { composer: 'rimsky-korsakov', keywords: ['flight of the bumblebee', 'bumblebee'], rank: 23 },
  { composer: 'tchaikovsky', keywords: ['nutcracker', 'sugar plum fairy'], rank: 24 },
  { composer: 'tchaikovsky', keywords: ['1812 overture', 'op. 49'], rank: 25 },
  { composer: 'holst', keywords: ['the planets', 'jupiter'], rank: 26 },
  { composer: 'rachmaninoff', keywords: ['piano concerto no. 2', 'rach 2', 'op. 18'], rank: 27 },
  { composer: 'satie', keywords: ['gymnopédie', 'gymnopedie no. 1'], rank: 28 },
  { composer: 'elgar', keywords: ['pomp and circumstance', 'march no. 1'], rank: 29 },
  { composer: 'orff', keywords: ['carmina burana', 'o fortuna'], rank: 30 },

  // Top 31 - 50
  { composer: 'brahms', keywords: ['hungarian dance no. 5', 'hungarian dance 5'], rank: 31 },
  { composer: 'dvorak', keywords: ['new world', 'symphony no. 9', 'from the new world', 'dvořák'], rank: 32 },
  { composer: 'bach', keywords: ['brandenburg', 'concerto no. 3', 'bwv 1048'], rank: 33 },
  { composer: 'mozart', keywords: ['rondo alla turca', 'turkish march', 'sonata no. 11', 'k. 331'], rank: 34 },
  { composer: 'wagner', keywords: ['valkyries', 'ride of the valkyries', 'walküre'], rank: 35 },
  { composer: 'saint-saens', keywords: ['the swan', 'carnival of the animals', 'saint-saëns', 'le cygne'], rank: 36 },
  { composer: 'massenet', keywords: ['thaïs', 'thais', 'meditation', 'méditation'], rank: 37 },
  { composer: 'schubert', keywords: ['ave maria'], rank: 38 },
  { composer: 'strauss', keywords: ['radetzky march', 'op. 228'], rank: 39 },
  { composer: 'puccini', keywords: ['turandot', 'nessun dorma'], rank: 40 },
  { composer: 'bach', keywords: ['cello suite no. 1', 'bwv 1007', 'prelude'], rank: 41 },
  { composer: 'liszt', keywords: ['hungarian rhapsody no. 2', 'rhapsody 2'], rank: 42 },
  { composer: 'boccherini', keywords: ['minuet', 'string quintet in e'], rank: 43 },
  { composer: 'chopin', keywords: ['minute waltz', 'waltz in d-flat', 'op. 64 no. 1'], rank: 44 },
  { composer: 'strauss', keywords: ['also sprach zarathustra', 'zarathustra'], rank: 45 },
  { composer: 'mendelssohn', keywords: ['wedding march', 'midsummer night'], rank: 46 },
  { composer: 'tchaikovsky', keywords: ['violin concerto in d'], rank: 47 },
  { composer: 'schubert', keywords: ['the trout', 'die forelle', 'piano quintet'], rank: 48 },
  { composer: 'gershwin', keywords: ['rhapsody in blue'], rank: 49 },
  { composer: 'stravinsky', keywords: ['rite of spring'], rank: 50 },

  // Top 51 - 120 (Bach & Baroque)
  { composer: 'bach', keywords: ['goldberg', 'bwv 988'], rank: 51 },
  { composer: 'bach', keywords: ['well-tempered clavier', 'bwv 846'], rank: 52 },
  { composer: 'bach', keywords: ['st. matthew passion', 'matthew passion', 'bwv 244'], rank: 53 },
  { composer: 'bach', keywords: ['mass in b minor', 'bwv 232'], rank: 54 },
  { composer: 'bach', keywords: ['violin concerto in a minor', 'bwv 1041', 'violin concerto in e', 'bwv 1042'], rank: 55 },
  { composer: 'bach', keywords: ['concerto for two violins', 'double concerto', 'bwv 1043'], rank: 56 },
  { composer: 'handel', keywords: ['water music'], rank: 57 },
  { composer: 'handel', keywords: ['royal fireworks', 'fireworks'], rank: 58 },
  { composer: 'handel', keywords: ['xerxes', 'largo', 'ombra mai fu'], rank: 59 },
  { composer: 'vivaldi', keywords: ['gloria in d', 'rv 589'], rank: 60 },
  { composer: 'vivaldi', keywords: ['mandolin concerto', 'rv 425'], rank: 61 },
  { composer: 'purcell', keywords: ['dido', 'lament'], rank: 62 },
  { composer: 'albinoni', keywords: ['adagio in g minor', 'giazotto'], rank: 63 },
  { composer: 'pachelbel', keywords: ['hexachordum'], rank: 64 },

  // Top 121 - 200 (Mozart & Classical)
  { composer: 'mozart', keywords: ['jupiter', 'symphony no. 41', 'k. 551'], rank: 121 },
  { composer: 'mozart', keywords: ['prague', 'symphony no. 38', 'symphony no. 39'], rank: 122 },
  { composer: 'mozart', keywords: ['clarinet concerto', 'k. 622'], rank: 123 },
  { composer: 'mozart', keywords: ['piano concerto no. 21', 'elvira madigan', 'k. 467'], rank: 124 },
  { composer: 'mozart', keywords: ['piano concerto no. 20', 'k. 466'], rank: 125 },
  { composer: 'mozart', keywords: ['marriage of figaro', 'figaro'], rank: 126 },
  { composer: 'mozart', keywords: ['don giovanni'], rank: 127 },
  { composer: 'mozart', keywords: ['magic flute', 'queen of the night'], rank: 128 },
  { composer: 'mozart', keywords: ['violin concerto no. 3', 'violin concerto no. 5', 'turkish'], rank: 129 },
  { composer: 'haydn', keywords: ['surprise', 'symphony no. 94'], rank: 130 },
  { composer: 'haydn', keywords: ['the clock', 'london', 'symphony no. 101', 'symphony no. 104'], rank: 131 },
  { composer: 'haydn', keywords: ['trumpet concerto'], rank: 132 },
  { composer: 'haydn', keywords: ['emperor', 'string quartet op. 76'], rank: 133 },
  { composer: 'gluck', keywords: ['orfeo ed euridice', 'blessed spirits'], rank: 134 },

  // Top 201 - 250 (Beethoven)
  { composer: 'beethoven', keywords: ['eroica', 'symphony no. 3'], rank: 201 },
  { composer: 'beethoven', keywords: ['pastoral', 'symphony no. 6'], rank: 202 },
  { composer: 'beethoven', keywords: ['symphony no. 7'], rank: 203 },
  { composer: 'beethoven', keywords: ['emperor', 'piano concerto no. 5'], rank: 204 },
  { composer: 'beethoven', keywords: ['piano concerto no. 4'], rank: 205 },
  { composer: 'beethoven', keywords: ['violin concerto in d'], rank: 206 },
  { composer: 'beethoven', keywords: ['appassionata', 'pathétique', 'pathetique', 'sonata no. 23', 'sonata no. 8'], rank: 207 },
  { composer: 'beethoven', keywords: ['egmont', 'coriolan'], rank: 208 },
  { composer: 'beethoven', keywords: ['string quartet no. 14', 'op. 131'], rank: 209 },

  // Top 251 - 330 (Early Romantic)
  { composer: 'chopin', keywords: ['fantaisie-impromptu', 'fantaisie impromptu', 'op. 66'], rank: 251 },
  { composer: 'chopin', keywords: ['tristesse', 'etude op. 10 no. 3', 'étude op. 10'], rank: 252 },
  { composer: 'chopin', keywords: ['revolutionary', 'etude op. 10 no. 12', 'étude op. 10'], rank: 253 },
  { composer: 'chopin', keywords: ['polonaise', 'heroic', 'op. 53'], rank: 254 },
  { composer: 'chopin', keywords: ['ballade no. 1', 'op. 23'], rank: 255 },
  { composer: 'schubert', keywords: ['unfinished', 'symphony no. 8'], rank: 256 },
  { composer: 'schubert', keywords: ['death and the maiden'], rank: 257 },
  { composer: 'schubert', keywords: ['winterreise'], rank: 258 },
  { composer: 'mendelssohn', keywords: ['violin concerto in e minor', 'op. 64'], rank: 259 },
  { composer: 'mendelssohn', keywords: ['italian', 'scottish', 'symphony no. 4', 'symphony no. 3'], rank: 260 },
  { composer: 'mendelssohn', keywords: ['hebrides', 'fingal'], rank: 261 },
  { composer: 'schumann', keywords: ['piano concerto in a minor', 'op. 54'], rank: 262 },
  { composer: 'schumann', keywords: ['träumerei', 'traumerei', 'kinderszenen'], rank: 263 },
  { composer: 'schumann', keywords: ['dichterliebe'], rank: 264 },
  { composer: 'liszt', keywords: ['les préludes', 'les preludes'], rank: 265 },
  { composer: 'liszt', keywords: ['liebestraum'], rank: 266 },
  { composer: 'liszt', keywords: ['la campanella'], rank: 267 },

  // Top 331 - 420 (Late Romantic)
  { composer: 'brahms', keywords: ['symphony no. 1'], rank: 331 },
  { composer: 'brahms', keywords: ['symphony no. 3'], rank: 332 },
  { composer: 'brahms', keywords: ['symphony no. 4'], rank: 333 },
  { composer: 'brahms', keywords: ['violin concerto', 'piano concerto no. 2'], rank: 334 },
  { composer: 'brahms', keywords: ['german requiem', 'deutsches requiem'], rank: 335 },
  { composer: 'tchaikovsky', keywords: ['pathétique', 'pathetique', 'symphony no. 6'], rank: 336 },
  { composer: 'tchaikovsky', keywords: ['symphony no. 5', 'symphony no. 4'], rank: 337 },
  { composer: 'tchaikovsky', keywords: ['piano concerto no. 1'], rank: 338 },
  { composer: 'tchaikovsky', keywords: ['romeo and juliet'], rank: 339 },
  { composer: 'tchaikovsky', keywords: ['sleeping beauty', 'serenade for strings'], rank: 340 },
  { composer: 'dvorak', keywords: ['cello concerto in b minor', 'dvořák'], rank: 341 },
  { composer: 'dvorak', keywords: ['slavonic dances', 'dvořák'], rank: 342 },
  { composer: 'grieg', keywords: ['piano concerto in a minor', 'op. 16'], rank: 343 },
  { composer: 'bizet', keywords: ['l\'arlésienne', 'arlesienne', 'farandole'], rank: 344 },
  { composer: 'saint-saens', keywords: ['organ symphony', 'symphony no. 3', 'saint-saëns'], rank: 345 },
  { composer: 'saint-saens', keywords: ['danse macabre', 'saint-saëns'], rank: 346 },
  { composer: 'saint-saens', keywords: ['introduction and rondo capriccioso', 'saint-saëns'], rank: 347 },
  { composer: 'bruch', keywords: ['violin concerto no. 1'], rank: 348 },
  { composer: 'rimsky-korsakov', keywords: ['scheherazade'], rank: 349 },
  { composer: 'mussorgsky', keywords: ['pictures at an exhibition', 'great gate of kiev'], rank: 350 },
  { composer: 'mussorgsky', keywords: ['night on bald mountain', 'bare mountain'], rank: 351 },
  { composer: 'verdi', keywords: ['requiem', 'dies irae'], rank: 352 },
  { composer: 'verdi', keywords: ['aida', 'triumphal march'], rank: 353 },
  { composer: 'verdi', keywords: ['la traviata', 'brindisi'], rank: 354 },
  { composer: 'wagner', keywords: ['tannhäuser', 'lohengrin', 'bridal chorus'], rank: 355 },
  { composer: 'wagner', keywords: ['tristan und isolde', 'liebestod'], rank: 356 },

  // Top 421 - 500 (Impressionist & 20th Century)
  { composer: 'debussy', keywords: ['prélude à l\'après-midi', 'prelude a l\'apres-midi', 'faun'], rank: 421 },
  { composer: 'debussy', keywords: ['la mer'], rank: 422 },
  { composer: 'debussy', keywords: ['arabesque', 'children\'s corner'], rank: 423 },
  { composer: 'ravel', keywords: ['pavane'], rank: 424 },
  { composer: 'ravel', keywords: ['daphnis et chloé', 'daphnis et chloe'], rank: 425 },
  { composer: 'ravel', keywords: ['string quartet in f'], rank: 426 },
  { composer: 'mahler', keywords: ['adagietto', 'symphony no. 5'], rank: 427 },
  { composer: 'mahler', keywords: ['resurrection', 'symphony no. 2', 'titan', 'symphony no. 1', 'symphony no. 9'], rank: 428 },
  { composer: 'rachmaninoff', keywords: ['piano concerto no. 3', 'rach 3'], rank: 429 },
  { composer: 'rachmaninoff', keywords: ['rhapsody on a theme of paganini', 'paganini rhapsody'], rank: 430 },
  { composer: 'rachmaninoff', keywords: ['symphony no. 2', 'prelude in c-sharp minor'], rank: 431 },
  { composer: 'sibelius', keywords: ['finlandia'], rank: 432 },
  { composer: 'sibelius', keywords: ['violin concerto in d minor', 'symphony no. 5'], rank: 433 },
  { composer: 'elgar', keywords: ['enigma variations', 'nimrod'], rank: 434 },
  { composer: 'elgar', keywords: ['cello concerto in e minor'], rank: 435 },
  { composer: 'holst', keywords: ['the planets', 'mars'], rank: 436 },
  { composer: 'strauss', keywords: ['rosenkavalier', 'heldenleben'], rank: 437 },
  { composer: 'prokofiev', keywords: ['romeo and juliet', 'dance of the knights'], rank: 438 },
  { composer: 'prokofiev', keywords: ['peter and the wolf'], rank: 439 },
  { composer: 'prokofiev', keywords: ['symphony no. 1', 'classical symphony'], rank: 440 },
  { composer: 'shostakovich', keywords: ['symphony no. 5', 'symphony no. 7', 'leningrad'], rank: 441 },
  { composer: 'shostakovich', keywords: ['jazz suite no. 2', 'waltz no. 2'], rank: 442 },
  { composer: 'stravinsky', keywords: ['firebird', 'petrushka'], rank: 443 },
  { composer: 'bartok', keywords: ['concerto for orchestra', 'music for strings', 'celesta'], rank: 444 },
  { composer: 'copland', keywords: ['appalachian spring', 'fanfare for the common man'], rank: 445 },
  { composer: 'gershwin', keywords: ['american in paris', 'piano concerto in f'], rank: 446 },
  { composer: 'williams', keywords: ['tallis', 'fantasia on a theme', 'lark ascending', 'vaughan williams'], rank: 447 },
  { composer: 'khachaturian', keywords: ['gayane', 'sabre dance'], rank: 448 }
];

export function getClassicalRank(composer: string, title: string): number {
  if (!composer || !title) return 999;
  
  const c = composer.toLowerCase();
  const t = title.toLowerCase();
  
  for (const entry of CLASSICAL_RANKING) {
    if (c.includes(entry.composer)) {
      if (entry.keywords.some(kw => t.includes(kw))) {
        return entry.rank;
      }
    }
  }
  
  return 999;
}
