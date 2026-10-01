// Every word the app shows, in one place. Hebrew is checked against Sefaria (cantillation removed).
// Divine names are never spelled out: אלקים for the word, and no Tetragrammaton anywhere.

export const APP = {
  title: 'Let My Agents Go',
  tagline: 'Every file your agents change is a stone on the pyramid.',
  pharaoh: 'Pharaoh (you)',
};

// Names for workers, from the generation that left Egypt.
export const ELDERS = ['Nachshon', 'Betzalel', 'Calev', 'Chur', 'Amram', 'Pinchas', 'Elazar', 'Oholiav', 'Eldad', 'Medad', 'Netanel', 'Eliav'];
export const YOUTHS = ['Yehoshua', 'Mishael', 'Elitzafan', 'Nadav', 'Avihu', 'Carmi', 'Chetzron', 'Yamin', 'Ohad', 'Nemuel', 'Yachin', 'Zerach', 'Peretz', 'Livni', 'Shimi', 'Machli', 'Mushi', 'Gamliel', 'Avidan', 'Pagiel', 'Achira', 'Elyasaf', 'Shelumiel', 'Elishama'];
export const LEVITES = ['Gershon', 'Kehat', 'Merari', 'Itamar', 'Uziel', 'Yitzhar', 'Chevron', 'Korach'];
export const OVERSEERS = ['Nebamun', 'Rekhmire', 'Senenmut', 'Paser', 'Khaemwaset', 'Djehuty', 'Amenemhat', 'Nakht', 'Sennefer', 'Userhat', 'Ptahmose', 'Horemheb'];

// What a worker is doing, by kind of tool call. Shown on the name tag.
export const VERB = {
  quarry: 'reading files',
  straw: 'searching the web',
  build: 'editing a file',
  haul: 'running a command',
  conscript: 'adding helpers',
  quota: 'updating the to-do list',
  ask: 'asking you',
  sleep: 'sleeping',
  scroll: 'using a skill',
  survey: 'taking a screenshot',
  rest: 'resting',
  think: 'thinking',
  wait: 'needs your OK',
  walk: 'walking',
};

// the same, short enough to sit in front of a file name or command: "reading app.css", "running npm test"
export const SHORT = { quarry: 'reading', straw: 'searching', build: 'editing', haul: 'running', scroll: 'skill:', quota: 'to-do:', wait: 'needs your OK:' };

// Scripture moments. he = Hebrew, en = English, src = citation, rashi = Rashi (or Talmud) line.
export const MOMENTS = {
  moses: {
    he: 'וַיִּפֶן כֹּה וָכֹה וַיַּרְא כִּי אֵין אִישׁ וַיַּךְ אֶת־הַמִּצְרִי וַיִּטְמְנֵהוּ בַּחוֹל',
    en: 'He looked this way and that, saw no one, struck the Egyptian, and hid him in the sand.',
    src: 'Shemot 2:12',
    rashi: 'מִכָּאן אָנוּ לְמֵדִים שֶׁהֲרָגוֹ בַּשֵּׁם הַמְפֹרָשׁ',
    rashiEn: 'From here we learn he killed him by saying the Divine Name.',
    rashiSrc: 'Rashi, Shemot 2:14',
    gloss: (c) => `Moses strikes Overseer ${c.tm} and hides him in the sand. ${c.crew} works without a whip until Pharaoh sends another.`,
  },
  midian: {
    he: 'וַיִּבְרַח מֹשֶׁה מִפְּנֵי פַרְעֹה וַיֵּשֶׁב בְּאֶרֶץ־מִדְיָן',
    en: 'Moses fled from Pharaoh and settled in the land of Midian.',
    src: 'Shemot 2:15',
    gloss: () => 'Moses is back in 60 seconds.',
  },
  snake: {
    he: 'וַיַּשְׁלִיכוּ אִישׁ מַטֵּהוּ וַיִּהְיוּ לְתַנִּינִם',
    en: 'Each one threw down his staff, and they turned into serpents.',
    src: 'Shemot 7:12',
    rashi: 'בְּלַהֲטֵיהֶם — בְּלַחֲשֵׁיהוֹן',
    rashiEn: 'With their whispered spells.',
    rashiSrc: 'Rashi, Shemot 7:11',
    gloss: (c) => `${c.w} wrote ${c.file || 'a file'}. The magicians turned a stick into a python.`,
  },
  swallow: {
    he: 'וַיִּבְלַע מַטֵּה־אַהֲרֹן אֶת־מַטֹּתָם',
    en: "Aaron's staff swallowed their staffs.",
    src: 'Shemot 7:12',
    rashi: 'מֵאַחַר שֶׁחָזַר וְנַעֲשָׂה מַטֶּה, בָּלַע אֶת כֻּלָּן',
    rashiEn: 'After it turned back into a staff, it swallowed them all.',
    rashiSrc: 'Rashi, Shemot 7:12',
    gloss: (c) => `${c.w} fixed it. The command that failed now passes.`,
  },
  blood: {
    he: 'וַיַּעֲשׂוּ־כֵן חַרְטֻמֵּי מִצְרַיִם בְּלָטֵיהֶם',
    en: "Egypt's magicians did the same with their secret arts.",
    src: 'Shemot 7:22',
    rashi: 'לַחַשׁ שֶׁאוֹמְרִין אוֹתוֹ בַּלָּט וּבַחֲשַׁאי',
    rashiEn: 'Spells they whisper in secret.',
    rashiSrc: 'Rashi, Shemot 7:22',
    gloss: (c) => `${c.w}'s command failed${c.exit ? ` (exit ${c.exit})` : ''}.`,
  },
  frogs: {
    he: 'וַתַּעַל הַצְּפַרְדֵּעַ וַתְּכַס אֶת־אֶרֶץ מִצְרָיִם',
    en: 'The frog came up and covered the land of Egypt.',
    src: 'Shemot 8:2',
    rashi: 'צְפַרְדֵּעַ אַחַת הָיְתָה וְהָיוּ מַכִּין אוֹתָהּ וְהִיא מַתֶּזֶת נְחִילִים נְחִילִים',
    rashiEn: 'It was one frog. Every time they hit it, it split into swarms.',
    rashiSrc: 'Rashi, Shemot 8:2',
    gloss: (c) => `${c.w} split one job into ${c.n} helpers.`,
  },
  lice: {
    he: 'וַיֹּאמְרוּ הַחַרְטֻמִּם אֶל־פַּרְעֹה אֶצְבַּע אֱלֹקִים הִוא',
    en: 'The magicians told Pharaoh: this is the finger of G-d.',
    src: 'Shemot 8:15',
    rashi: 'שֶׁאֵין הַשֵּׁד שׁוֹלֵט עַל בְּרִיָּה פְּחוּתָה מִכַּשְּׂעוֹרָה',
    rashiEn: 'Their magic had no power over anything smaller than a barley grain.',
    rashiSrc: 'Rashi, Shemot 8:14',
    gloss: (c) => `Tests failed for ${c.w}. The magicians could not make lice either.`,
  },
  hail: {
    he: 'וַיְהִי בָרָד וְאֵשׁ מִתְלַקַּחַת בְּתוֹךְ הַבָּרָד',
    en: 'There was hail, with fire flashing inside the hail.',
    src: 'Shemot 9:24',
    rashi: 'הָאֵשׁ וְהַבָּרָד מְעֹרָבִין... וְלַעֲשׂוֹת רְצוֹן קוֹנָם עָשׂוּ שָׁלוֹם בֵּינֵיהֶם',
    rashiEn: 'Fire and ice made peace to do the will of their Maker.',
    rashiSrc: 'Rashi, Shemot 9:24',
    gloss: (c) => `The Claude API sent back an error${c.text ? `: ${c.text}` : ''}. It retries on its own.`,
  },
  darkness: {
    he: 'וּלְכׇל־בְּנֵי יִשְׂרָאֵל הָיָה אוֹר בְּמוֹשְׁבֹתָם',
    en: 'But all the Israelites had light where they lived.',
    src: 'Shemot 10:23',
    gloss: (c) => `${c.w}'s conversation filled its memory, so Claude summarized it and kept working.`,
  },
  locusts: {
    he: 'וַיְכַס אֶת־עֵין כׇּל־הָאָרֶץ',
    en: 'They covered the face of the whole land.',
    src: 'Shemot 10:15',
    gloss: (c) => `${c.n} agents are working at the same time.`,
  },
  heart: {
    he: 'וַיֶּחֱזַק לֵב־פַּרְעֹה',
    en: "Pharaoh's heart was hardened.",
    src: 'Shemot 7:22',
    gloss: (c) => `You turned down ${c.w}'s request.`,
  },
  newKing: {
    he: 'וַיָּקׇם מֶלֶךְ־חָדָשׁ עַל־מִצְרָיִם אֲשֶׁר לֹא־יָדַע אֶת־יוֹסֵף',
    en: 'A new king arose over Egypt who did not know Joseph.',
    src: 'Shemot 1:8',
    rashi: 'עָשָׂה עַצְמוֹ כְּאִלּוּ לֹא יְדָעוֹ',
    rashiEn: 'He acted as if he had never known him.',
    rashiSrc: 'Rashi, Shemot 1:8',
    gloss: (c) => `${c.w} switched to ${c.model}.`,
  },
  sixAtOnce: {
    he: 'וּבְנֵי יִשְׂרָאֵל פָּרוּ וַיִּשְׁרְצוּ וַיִּרְבּוּ',
    en: 'The Israelites were fruitful, they swarmed, they multiplied.',
    src: 'Shemot 1:7',
    rashi: 'שֶׁהָיוּ יוֹלְדוֹת שִׁשָּׁה בְּכָרֵס אֶחָד',
    rashiEn: 'They gave birth to six at once.',
    rashiSrc: 'Rashi, Shemot 1:7',
    gloss: (c) => `${c.w} started ${c.n} helpers in one message.`,
  },
  midwives: {
    he: 'שֵׁם הָאַחַת שִׁפְרָה וְשֵׁם הַשֵּׁנִית פּוּעָה',
    en: 'One was named Shifrah, and the other Puah.',
    src: 'Shemot 1:15',
    rashi: 'שִׁפְרָה — יוֹכֶבֶד... פּוּעָה — זוֹ מִרְיָם',
    rashiEn: 'Shifrah was Yocheved. Puah was Miriam.',
    rashiSrc: 'Rashi, Shemot 1:15',
    gloss: (c) => `New session${c.title ? `: ${c.title}` : ''}. ${c.w} joins the site.`,
  },
  pithom: {
    he: 'פִּיתוֹם... שֶׁרִאשׁוֹן רִאשׁוֹן פִּי תְהוֹם בּוֹלְעוֹ',
    en: 'Why was it called Pithom? Because the mouth of the deep swallowed each thing they built.',
    src: 'Sotah 11a',
    gloss: (c) => `${c.w}'s change to ${c.file || 'a file'} didn't land. ${c.err || ''}`.trim(),
  },
  softMouth: {
    he: 'בְּפָרֶךְ — בְּפֶה רַךְ',
    en: '"With rigor" can be read "with a soft mouth."',
    src: 'Sotah 11b',
    rashiEn: 'On the first day Pharaoh picked up a basket himself, and everyone joined him. That evening he counted the bricks and made the count the daily quota.',
    rashiSrc: 'Midrash Tanchuma',
    gloss: () => 'Day one, Pharaoh works too.',
  },
  officers: {
    he: 'וַיֻּכּוּ שֹׁטְרֵי בְּנֵי יִשְׂרָאֵל',
    en: 'The Israelite officers were beaten.',
    src: 'Shemot 5:14',
    rashi: 'לְפִיכָךְ זָכוּ אוֹתָם שׁוֹטְרִים לִהְיוֹת סַנְהֶדְרִין',
    rashiEn: 'They took the beating for the people, so they later sat on the Sanhedrin.',
    rashiSrc: 'Rashi, Shemot 5:14',
    gloss: (c) => `${c.helper}'s job failed. ${c.w} sent it, so ${c.w} takes the lash.`,
  },
  quarrel: {
    he: 'וְהִנֵּה שְׁנֵי־אֲנָשִׁים עִבְרִים נִצִּים',
    en: 'And there were two Hebrew men, fighting.',
    src: 'Shemot 2:13',
    rashi: 'דָּתָן וַאֲבִירָם',
    rashiEn: 'Datan and Aviram.',
    rashiSrc: 'Rashi, Shemot 2:13',
    gloss: (c) => `${c.a} and ${c.b} both changed ${c.file || 'the same file'} within a minute.`,
  },
  joseph: {
    he: 'וַיִּקַּח מֹשֶׁה אֶת־עַצְמוֹת יוֹסֵף עִמּוֹ',
    en: "Moses took Joseph's bones with him.",
    src: 'Shemot 13:19',
    rashi: 'סֶרַח בַּת אָשֵׁר נִשְׁתַּיְּירָה מֵאוֹתוֹ הַדּוֹר',
    rashiEn: 'Serach, daughter of Asher, was still alive from that generation. She knew where Joseph lay.',
    rashiSrc: 'Sotah 13a',
    gloss: (c) => (c.cmd ? `${c.w} is reading the git history: ${c.cmd}` : `${c.w} is reading the git history.`),
  },
  matzah: {
    he: 'כִּי לֹא חָמֵץ כִּי־גֹרְשׁוּ מִמִּצְרַיִם וְלֹא יָכְלוּ לְהִתְמַהְמֵהַּ',
    en: 'It had not risen. They were driven out and could not wait.',
    src: 'Shemot 12:39',
    gloss: (c) => `${c.w} finished in ${c.s} seconds.`,
  },
  afarayim: {
    he: 'תֶּבֶן אַתָּה מַכְנִיס לַעֲפָרַיִם',
    en: 'Yochana and Mamre to Moses: "You bring straw to Afarayim?"',
    src: 'Menachot 85a',
    gloss: (c) => `${c.w} is starting another Claude.`,
  },
  batya: {
    he: 'וַתִּשְׁלַח אֶת־אֲמָתָהּ וַתִּקָּחֶהָ',
    en: 'She stretched out her arm and took it.',
    src: 'Shemot 2:5',
    rashi: 'וְנִשְׁתַּרְבְּבָה אַמָּתָהּ אַמּוֹת הַרְבֵּה',
    rashiEn: 'Her arm stretched many cubits long.',
    rashiSrc: 'Rashi, Shemot 2:5',
  },
  nile: {
    he: 'הִנֵּה יֹצֵא הַמַּיְמָה',
    en: 'He goes out to the water.',
    src: 'Shemot 7:15',
    rashi: 'וּמַשְׁכִּים וְיוֹצֵא לַנִּילוּס וְעוֹשֶׂה שָׁם צְרָכָיו',
    rashiEn: 'Pharaoh claimed to be a god with no bodily needs, so he snuck down to the Nile at dawn.',
    rashiSrc: 'Rashi, Shemot 7:15',
  },
  capstone: {
    he: 'וַיִּבֶן עָרֵי מִסְכְּנוֹת לְפַרְעֹה אֶת־פִּתֹם וְאֶת־רַעַמְסֵס',
    en: 'They built store cities for Pharaoh: Pithom and Raamses.',
    src: 'Shemot 1:11',
    rashiEn: 'The verse says store cities. Not pyramids.',
    rashiSrc: '',
    gloss: (c) => `${c.project} finished a pyramid: ${c.n} stones.`,
  },
  taxes: {
    he: 'וַיָּשִׂימוּ עָלָיו שָׂרֵי מִסִּים',
    en: 'They set taskmasters over them.',
    src: 'Shemot 1:11',
    rashi: 'שָׂרִים שֶׁגּוֹבִין מֵהֶם הַמַּס',
    rashiEn: 'Officers who collect the tax from them.',
    rashiSrc: 'Rashi, Shemot 1:11',
    gloss: (c) => `Each crew has an overseer. The tax is paid in tokens: ${c.tax} since you opened this page.`,
  },
};

export const LEVITE_NOTE = 'Levite: a read-only helper. The tribe of Levi was never put to work (Rashi, Shemot 5:4).';

// Short lines in the chronicle (bottom-left log).
export const LOG = {
  whip: (tm, w) => `${tm} whips ${w}`,
  stone: (w, file) => `${w} set a stone${file ? `: ${file}` : ''}`,
  prompt: (text) => `Pharaoh decrees: “${text}”`,
  joined: (w, what) => `${w} joins${what ? `: ${what}` : ''}`,
  rest: (w) => `${w} rests`,
  fail: (w, what) => `${w}'s ${what} failed`,
  moses: (tm) => `Moses buried Overseer ${tm} in the sand`,
  newTm: (tm, crew) => `Pharaoh sends Overseer ${tm} to ${crew}`,
  capstone: (p) => `A pyramid is finished for ${p}`,
};
