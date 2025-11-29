/**
 * Fancy Text Generator
 * Converts plain text into various Unicode font styles
 */

// Unicode font mappings for different styles
const fontStyles = {
  1: { // Mathematical Bold
    small: '𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇',
    capital: '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭',
    number: '𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵'
  },
  2: { // Mathematical Bold Italic
    small: '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯',
    capital: '𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕',
    number: '0123456789'
  },
  3: { // Mathematical Sans-Serif
    small: '𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓',
    capital: '𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹',
    number: '𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫'
  },
  4: { // Mathematical Monospace
    small: '𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣',
    capital: '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉',
    number: '𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿'
  },
  5: { // Double-struck
    small: '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫',
    capital: '𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ',
    number: '𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡'
  },
  6: { // Fraktur (Gothic)
    small: '𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷',
    capital: '𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ',
    number: '0123456789'
  },
  7: { // Script/Cursive
    small: '𝒶𝒷𝒸𝒹𝑒𝒻𝑔𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝑜𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏',
    capital: '𝒜𝐵𝒞𝒟𝐸𝐹𝒢𝐻𝐼𝒥𝒦𝐿𝑀𝒩𝒪𝒫𝒬𝑅𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵',
    number: '0123456789'
  },
  8: { // Bold Script
    small: '𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃',
    capital: '𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',
    number: '0123456789'
  },
  9: { // Small Caps
    small: 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ',
    capital: 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ',
    number: '0123456789'
  },
  10: { // Circled
    small: 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ',
    capital: 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ',
    number: '⓪①②③④⑤⑥⑦⑧⑨'
  },
  11: { // Squared
    small: '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉',
    capital: '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉',
    number: '0123456789'
  },
  12: { // Inverted Squares
    small: '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉',
    capital: '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉',
    number: '0123456789'
  },
  13: { // Parenthesized
    small: '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵',
    capital: '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵',
    number: '0⑴⑵⑶⑷⑸⑹⑺⑻⑼'
  },
  14: { // Fullwidth
    small: 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
    capital: 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ',
    number: '０１２３４５６７８９'
  },
  15: { // Upside Down
    small: 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz',
    capital: 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz',
    number: '0123456789'
  }
};

const normalChars = {
  small: 'abcdefghijklmnopqrstuvwxyz',
  capital: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  number: '0123456789'
};

/**
 * Convert text to a specific font style
 * @param {string} text - Text to convert
 * @param {number} styleNumber - Style number (1-15)
 * @returns {string} Converted text
 */
function convertToStyle(text, styleNumber) {
  if (!fontStyles[styleNumber]) {
    return text; // Return original if style not found
  }

  const style = fontStyles[styleNumber];
  let result = '';

  for (let char of text) {
    let converted = char;

    // Check lowercase
    const lowerIndex = normalChars.small.indexOf(char);
    if (lowerIndex !== -1) {
      converted = style.small[lowerIndex] || char;
    }

    // Check uppercase
    const upperIndex = normalChars.capital.indexOf(char);
    if (upperIndex !== -1) {
      converted = style.capital[upperIndex] || char;
    }

    // Check numbers
    const numIndex = normalChars.number.indexOf(char);
    if (numIndex !== -1) {
      converted = style.number[numIndex] || char;
    }

    result += converted;
  }

  return result;
}

/**
 * Generate text in all available styles
 * @param {string} text - Text to convert
 * @returns {string} Formatted message with all styles
 */
function generateAllStyles(text) {
  const styleNames = [
    'Mathematical Bold',
    'Mathematical Bold Italic',
    'Mathematical Sans-Serif',
    'Mathematical Monospace',
    'Double-struck',
    'Fraktur (Gothic)',
    'Script/Cursive',
    'Bold Script',
    'Small Caps',
    'Circled',
    'Squared',
    'Inverted Squares',
    'Parenthesized',
    'Fullwidth',
    'Upside Down'
  ];

  let result = '✨ *FANCY TEXT STYLES*\n\n';
  result += `Original: ${text}\n\n`;

  for (let i = 1; i <= 15; i++) {
    const converted = convertToStyle(text, i);
    result += `${i}. ${styleNames[i - 1]}\n`;
    result += `   ${converted}\n\n`;
  }

  result += `💡 Use ${process.env.PREFIX || '.'}fancy <number> <text> to use a specific style\n`;
  result += `📝 Or reply to a message with ${process.env.PREFIX || '.'}fancy <number>`;

  return result;
}

/**
 * Format usage instructions
 */
function getUsageMessage(prefix = '.') {
  return `💡 *FANCY TEXT USAGE*\n\n` +
         `*Examples:*\n` +
         `${prefix}fancy Hello World - Show all styles\n` +
         `${prefix}fancy 7 Hello - Convert to style 7\n` +
         `${prefix}fancy 12 - Reply to a message to convert it\n\n` +
         `*Available Styles (1-15):*\n` +
         `1. Mathematical Bold\n` +
         `2. Mathematical Bold Italic\n` +
         `3. Mathematical Sans-Serif\n` +
         `4. Mathematical Monospace\n` +
         `5. Double-struck\n` +
         `6. Fraktur (Gothic)\n` +
         `7. Script/Cursive\n` +
         `8. Bold Script\n` +
         `9. Small Caps\n` +
         `10. Circled\n` +
         `11. Squared\n` +
         `12. Inverted Squares\n` +
         `13. Parenthesized\n` +
         `14. Fullwidth\n` +
         `15. Upside Down`;
}

module.exports = {
  convertToStyle,
  generateAllStyles,
  getUsageMessage
};
