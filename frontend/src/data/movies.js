import familyPoster from '../assets/family-adventure-poster.png'
import mysteryPoster from '../assets/mystery-poster.png'
import scifiPoster from '../assets/scifi-thriller-poster.png'
import romancePoster from '../assets/romance-poster.png'
import horrorPoster from '../assets/horror-poster.png'

export const movies = [
  {
    id: 'the-willow-express',
    title: 'The Willow Express',
    genre: 'Family',
    duration: 105,
    ageRating: '7',
    poster: familyPoster,
    cities: ['Oulu', 'Tampere'],
    description:
      'When a young fox and a curious rabbit board a magical train, they embark on an unforgettable journey through enchanted forests and mountain valleys to save their woodland home.',
  },
  {
    id: 'the-last-light',
    title: 'The Last Light',
    genre: 'Mystery',
    duration: 112,
    ageRating: '12',
    poster: mysteryPoster,
    cities: ['Oulu', 'Tampere'],
    description:
      'After receiving a mysterious letter, a young investigator travels to an isolated coastal lighthouse. As its light begins to fail, she uncovers secrets surrounding a disappearance that has haunted the island for decades.',
  },
  {
    id: 'beyond-orion',
    title: 'Beyond Orion',
    genre: 'Sci-Fi',
    duration: 124,
    ageRating: '12',
    poster: scifiPoster,
    cities: ['Oulu', 'Tampere'],
    description:
      'When a research crew detects an impossible signal beyond the Orion constellation, an astronaut ventures onto an unexplored world and discovers a message that could change humanity’s future.',
  },
  {
    id: 'when-we-meet-again',
    title: 'When We Meet Again',
    genre: 'Romance',
    duration: 108,
    ageRating: '7',
    poster: romancePoster,
    cities: ['Oulu', 'Tampere'],
    description:
      'Years after a chance encounter, two strangers meet again in a city neither planned to return to. Over one unforgettable weekend, they discover whether the right person can arrive at the right time.',
  },
  {
    id: 'the-hollow-door',
    title: 'The Hollow Door',
    genre: 'Horror',
    duration: 106,
    ageRating: '16',
    poster: horrorPoster,
    cities: ['Oulu', 'Tampere'],
    description:
      'After inheriting an abandoned house, a young woman discovers a locked door that opens every night at 3:13. When a familiar voice calls from the other side, she uncovers a secret that should have stayed buried.',
  },
]