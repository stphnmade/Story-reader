const ACRONYM_MAP: { [key: string]: string } = {
  // Relationship / Judgment Acronyms
  'AITAH': 'Am I the A-hole',
  'AITA': 'Am I the A-hole',
  'WIBTA': 'Would I be the A-Hole',
  'NTA': 'Not the A-hole',
  'YTA': 'You’re the A-hole',
  'ESH': 'Everyone Sucks Here',
  'NAH': 'No A-holes Here',
  'INFO': 'Need More Information',
  'TIFU': "Today I F'ed Up",
  'FTFY': 'Fixed That For You',
  'AH': 'A- Hole',

  // Text & Chat Slang
  'LOL': 'Laugh Out Loud',
  'LMAO': "Laughing My A** Off",
  'LMFAO': "Laughing My F***ing A** Off",
  'ROFL': 'Rolling On the Floor Laughing',
  'OMG': 'Oh My God',
  'OMFG': "Oh My F***ing God",
  'WTF': "What The F***",
  'WTH': 'What The Heck',
  'IDC': 'I Don’t Care',
  'IDK': 'I Don’t Know',
  'IMO': 'In My Opinion',
  'IMHO': 'In My Humble Opinion',
  'TBH': 'To Be Honest',
  'TBF': 'To Be Fair',
  'SMH': 'Shaking My Head',
  'FR': 'For Real',
  'FRFR': 'For Real For Real',
  'NGL': 'Not Gonna Lie',
  'RN': 'Right Now',
  'BRB': 'Be Right Back',
  'TTYL': 'Talk To You Later',
  'BTW': 'By The Way',
  'FYI': 'For Your Information',
  'FTW': 'For The Win',
  'GG': 'Good Game',
  'AFK': 'Away From Keyboard',
  'ICYMI': 'In Case You Missed It',
  'TL;DR': 'Too Long; Didn’t Read',
  'TLDR': 'Too Long; Didn’t Read',
  'JK': 'Just Kidding',
  'IDCWT': 'I Don’t Care What They Think',
  'IDCWF': 'I Don’t Care Who Finds Out',
  'IDGAF': "I Don’t Give A F***",
  'IDGAFF': "I Don’t Give A Flying F***",
  'STFU': "Shut The F*** Up",
  'GTFO': "Get The F*** Out",
  'YOLO': 'You Only Live Once',
  'FOMO': 'Fear Of Missing Out',
  'SUS': 'Suspicious',
  'CAP': 'Lie',
  'BET': 'Okay',
  'COPE': 'Deal With It',
  'IYKYK': 'If You Know, You Know',
  'NSFW': 'Not Safe For Work',
  'NSFL': 'Not Safe For Life',
  'OP': 'Original Poster',
  
  // Dating / Confession Threads
  'FML': "F*** My Life",
  'DTR': 'Define The Relationship',
  'FWB': 'Friends With Benefits',
  'SO': 'Significant Other',
  'BF': 'Boyfriend',
  'GF': 'Girlfriend',
  'LDR': 'Long-Distance Relationship',
  'S/O': 'Shout-Out',
  'TMI': 'Too Much Information',
  'BFF': 'Best Friends Forever',
  'BAE': 'Before Anyone Else',

  // Reddit-Specific & Internet Culture
  'AMA': 'Ask Me Anything',
  'ELI5': 'Explain Like I’m 5',
  'CMV': 'Change My View',
  'PSA': 'Public Service Announcement',
  'YSK': 'You Should Know',
  'DAE': 'Does Anyone Else',
  'LPT': 'Life Pro Tip',
};

// Create a case-insensitive map for lookup
const UPPERCASE_ACRONYM_MAP: { [key: string]: string } = {};
for (const key in ACRONYM_MAP) {
    UPPERCASE_ACRONYM_MAP[key.toUpperCase()] = ACRONYM_MAP[key];
}

// Acronyms that are also common words and should only be expanded if they are in ALL CAPS.
const MUST_BE_ALL_CAPS = new Set(['SO', 'OP', 'FR', 'NAH', 'SUS', 'CAP', 'BET', 'COPE', 'AH']);


function escapeRegExp(string: string): string {
    // $& means the whole matched string
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sort by length descending to match longer acronyms first (e.g., "FRFR" before "FR")
const acronymKeys = Object.keys(ACRONYM_MAP).sort((a, b) => b.length - a.length);

const acronymRegex = new RegExp(`\\b(${acronymKeys.map(escapeRegExp).join('|')})\\b`, 'gi');

export const expandAcronyms = (text: string): string => {
    if (!text) return '';
    
    return text.replace(acronymRegex, (match) => {
        const upperMatch = match.toUpperCase();
        
        // If the acronym is in our case-sensitive list, only replace it if the original match was already in all caps.
        if (MUST_BE_ALL_CAPS.has(upperMatch) && match !== upperMatch) {
            return match; // Not all caps, so return original word.
        }

        // Otherwise, use the case-insensitive map for robust matching.
        return UPPERCASE_ACRONYM_MAP[upperMatch] || match;
    });
};