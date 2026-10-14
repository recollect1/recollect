// Seed household, CLAUDE.md §5. Every person, place and story here is FICTIONAL (§1.7).
import type {
  Consent, Device, Entity, Household, Medicine, Person, Photo, Profile, Schedule, Visit,
} from "../types.ts";

export const HOUSEHOLD: Household = {
  id: "hh-kaur", name: "Kaur household", tz: "Asia/Kolkata", elderId: "p-gurdev", adminId: "p-simran",
};

const avatar = (initial: string, colour: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${colour}"/>` +
    `<text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">${initial}</text></svg>`);

export const PEOPLE: Person[] = [
  { id: "p-gurdev", name: "Gurdev", role: "elder", aliases: ["gurdev kaur", "grandma", "dadi", "biji"],
    relation: "self", photoUrl: avatar("G", "#8a5a44") },
  { id: "p-aman", name: "Aman", role: "family", aliases: ["grandson", "simran's son", "simran's boy"],
    relation: "grandson", relationToElder: "grandson, Simran's son",
    statusLine: "is in London and calls you on Sundays", photoUrl: avatar("A", "#3d6b8e") },
  { id: "p-simran", name: "Simran", role: "family", aliases: ["daughter-in-law", "bahu"],
    relation: "daughter-in-law", relationToElder: "daughter-in-law",
    statusLine: "is at work and comes home at six", photoUrl: avatar("S", "#7a4d8c") },
  { id: "p-harpreet", name: "Harpreet", role: "helper", aliases: ["helper", "the helper"],
    relation: "home helper", relationToElder: "helper at home",
    statusLine: "comes at ten in the morning, Monday to Saturday", photoUrl: avatar("H", "#4d8c6a") },
];

export const VISITS: Visit[] = [
  { id: "v-harpreet", personId: "p-harpreet", daysOfWeek: [1, 2, 3, 4, 5, 6], time: "10:00", kind: "visit" },
  { id: "v-aman", personId: "p-aman", daysOfWeek: [0], time: "18:00", kind: "call" },
];

// Generic names and a family-written purpose only; Recollect never gives dosing advice.
export const MEDICINES: Medicine[] = [
  { id: "m-bp", name: "BP tablet", purpose: "for blood pressure",
    aliases: ["bp", "bp medicine", "blood pressure tablet", "blood pressure medicine", "pressure tablet"] },
  { id: "m-sugar", name: "sugar tablet", purpose: "for sugar",
    aliases: ["sugar", "sugar medicine", "diabetes tablet"] },
  { id: "m-calcium", name: "calcium tablet", purpose: "for bones", aliases: ["calcium"] },
];
export const SCHEDULES: Schedule[] = [
  { id: "s-bp-am", medicineId: "m-bp", time: "08:00", qty: 1 },
  { id: "s-bp-pm", medicineId: "m-bp", time: "20:00", qty: 1 },
  { id: "s-sugar", medicineId: "m-sugar", time: "08:00", qty: 1 },
  { id: "s-calcium", medicineId: "m-calcium", time: "14:00", qty: 1 },
];

export const ENTITIES: Entity[] = [
  { id: "e-patiala", kind: "place", name: "Patiala", aliases: [] },
  { id: "e-rampur", kind: "place", name: "Rampur", aliases: ["village", "my village"] },
  { id: "e-wedding", kind: "event", name: "wedding", aliases: ["marriage", "married"], year: 1966 },
  { id: "e-balwant", kind: "person", name: "Balwant", aliases: ["husband", "my husband"] },
  { id: "e-qila", kind: "place", name: "Qila Mubarak", aliases: ["qila", "fort"] },
  { id: "e-mother-in-law", kind: "person", name: "mother-in-law", aliases: ["my mother-in-law"] },
  { id: "e-well", kind: "thing", name: "well", aliases: ["village well"] },
  { id: "e-nimmo", kind: "person", name: "Nimmo", aliases: ["sister", "my sister"] },
  { id: "e-father", kind: "person", name: "father", aliases: ["my father", "papa", "dad"] },
  { id: "e-jagdish", kind: "person", name: "Jagdish", aliases: ["brother", "my brother"] },
  { id: "e-bicycle", kind: "thing", name: "bicycle", aliases: ["cycle", "bike"] },
  { id: "e-army", kind: "thing", name: "army", aliases: [] },
  { id: "e-letters", kind: "thing", name: "letters", aliases: ["letter"] },
  { id: "e-radio", kind: "thing", name: "radio", aliases: ["murphy radio"], year: 1968 },
  { id: "e-radio-ceylon", kind: "thing", name: "Radio Ceylon", aliases: [] },
  { id: "e-aman", kind: "person", name: "Aman", aliases: ["grandson", "my grandson"] },
  { id: "e-simran", kind: "person", name: "Simran", aliases: ["daughter-in-law"] },
  { id: "e-hospital", kind: "place", name: "hospital", aliases: [] },
  { id: "e-panjiri", kind: "thing", name: "panjiri", aliases: [] },
  { id: "e-mother", kind: "person", name: "mother", aliases: ["my mother", "mum", "maa"] },
  { id: "e-saag", kind: "thing", name: "saag", aliases: ["sarson ka saag"] },
  { id: "e-roti", kind: "thing", name: "makki ki roti", aliases: ["roti"] },
  { id: "e-chulha", kind: "thing", name: "chulha", aliases: ["stove"] },
];
/** Entity -> family Person (SAME_AS). */
export const SAME_AS: [entityId: string, personId: string][] = [
  ["e-aman", "p-aman"], ["e-simran", "p-simran"],
];

export interface SeedStory {
  key: string; title: string; toldOn: string; text: string;
  /** Exact spans in the text and the entity each refers to. */
  mentions: [span: string, entityId: string][];
}

// Her voice, 60–150 words each, told over six weeks before the demo.
export const STORIES: SeedStory[] = [
  {
    key: "patiala", title: "Arriving in Patiala after the wedding", toldOn: "2026-08-03",
    text: "I came to Patiala in 1966, two days after my wedding. I was eighteen years old. We came by bus " +
      "from my village, Rampur, and I held my trunk on my lap the whole way. My husband Balwant's house " +
      "was near the Qila Mubarak. My mother-in-law opened the door and put a little sugar in my mouth. " +
      "I had never seen so many shops in one street. That first night I could not sleep because the city " +
      "was so loud.",
    mentions: [["Patiala", "e-patiala"], ["wedding", "e-wedding"], ["Rampur", "e-rampur"],
      ["Balwant", "e-balwant"], ["Qila Mubarak", "e-qila"], ["mother-in-law", "e-mother-in-law"]],
  },
  {
    key: "well", title: "The village well", toldOn: "2026-08-10",
    text: "In Rampur there was one well for the whole village. Every morning I went there with my sister " +
      "Nimmo to fill the brass pots. The rope was rough and it cut our hands in winter. The women talked " +
      "there more than they talked at home. Once Nimmo dropped the bucket into the well and we both ran " +
      "away. My father had to pull it out with a long hook.",
    mentions: [["Rampur", "e-rampur"], ["well", "e-well"], ["Nimmo", "e-nimmo"], ["father", "e-father"]],
  },
  {
    key: "jagdish", title: "My brother Jagdish", toldOn: "2026-08-17",
    text: "My brother Jagdish was four years older than me. He taught me to ride a bicycle in the fields " +
      "behind our house. He joined the army when he was twenty and he wrote me a letter every month. " +
      "He always drew a small bird at the end of the letter. I kept all those letters in a biscuit tin. " +
      "I still have that tin in my cupboard.",
    mentions: [["Jagdish", "e-jagdish"], ["bicycle", "e-bicycle"], ["army", "e-army"],
      ["letters", "e-letters"], ["letter", "e-letters"]],
  },
  {
    key: "radio", title: "The first radio in the house", toldOn: "2026-08-24",
    text: "My father came to visit us in Patiala in 1968 and he brought a radio. It was the first radio " +
      "in our house. It was a big brown Murphy radio and it sat on a shelf in the front room. The whole " +
      "street came to listen to the cricket. Balwant would not let anyone touch the dial. In the evening " +
      "we listened to old songs on Radio Ceylon.",
    mentions: [["father", "e-father"], ["Patiala", "e-patiala"], ["radio", "e-radio"],
      ["Balwant", "e-balwant"], ["Radio Ceylon", "e-radio-ceylon"]],
  },
  {
    key: "aman", title: "The day Aman was born", toldOn: "2026-09-07",
    text: "Aman was born in the rain, in July. Simran was in the hospital for two days and I did not go " +
      "home at all. When the nurse put him in my arms he held my finger and would not let go. He had so " +
      "much hair. I told everyone he had his grandfather's nose. I made panjiri for Simran that same week.",
    mentions: [["Aman", "e-aman"], ["Simran", "e-simran"], ["hospital", "e-hospital"], ["panjiri", "e-panjiri"]],
  },
  {
    key: "saag", title: "My mother's saag", toldOn: "2026-09-14",
    text: "My mother made sarson ka saag every winter. She cooked it slowly on the chulha for the whole " +
      "afternoon. She put in a big spoon of white butter at the end. We ate it with makki ki roti, " +
      "sitting on the floor in the kitchen. I learned it by watching, because she never told me the " +
      "recipe. Nobody makes it like her. When I smell mustard leaves I think of her hands.",
    mentions: [["mother", "e-mother"], ["saag", "e-saag"], ["makki ki roti", "e-roti"], ["chulha", "e-chulha"]],
  },
];

// Simple drawings, inlined as data URIs (like the avatars) so MCP Apps cards, which have no
// network access, can show them. No real photos (§1.7).
const drawing = (svg: string) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">${svg}</svg>`);
const figure = (x: number, h: number, colour: string) =>
  `<circle cx="${x}" cy="${222 - h}" r="13" fill="#c08a64"/>` +
  `<rect x="${x - 15}" y="${236 - h}" width="30" height="${h - 14}" rx="12" fill="${colour}"/>`;
const COURTYARD = drawing(
  `<rect width="400" height="260" fill="#f3e3c3"/><rect y="200" width="400" height="60" fill="#c9a66b"/>` +
  `<rect x="30" y="60" width="340" height="140" fill="#e2b98c" stroke="#8a5a3a" stroke-width="3"/>` +
  `<rect x="170" y="110" width="60" height="90" fill="#7a4a2a"/>` +
  [60, 110, 290, 340].map((x) => `<circle cx="${x}" cy="200" r="5" fill="#f2a93b"/><path d="M${x} 186q4 6 0 9q-4-3 0-9" fill="#e8562a"/>`).join("") +
  figure(95, 120, "#7a4d8c") + figure(145, 95, "#3d6b8e") + figure(255, 110, "#8a5a44") + figure(305, 130, "#4d8c6a"));
const AMAN = drawing(
  `<rect width="400" height="260" fill="#dfe9f2"/><rect y="190" width="400" height="70" fill="#9fb5c7"/>` +
  `<rect x="250" y="70" width="18" height="120" fill="#5d6b78"/><circle cx="259" cy="62" r="16" fill="#e7c66b"/>` +
  figure(170, 150, "#3d6b8e"));

export const PHOTOS: (Photo & { depicts: string[] })[] = [
  { id: "ph-family", url: COURTYARD, caption: "The family in the courtyard, Diwali", depicts: ["e-aman", "e-simran"] },
  { id: "ph-aman", url: AMAN, caption: "Aman", depicts: ["e-aman"] },
];
export const WEEKLY_PHOTO_ID = "ph-family";

export const PROFILE: Profile = {
  id: "p-gurdev", personId: "p-gurdev", preferredName: "Gurdev ji",
  likes: ["old Hindi and Punjabi film songs", "sweet milky tea at four", "sitting in the courtyard in the sun"],
  calms: ["Shall we have some tea and talk about your mother's saag?", "Shall we put on your music?"],
  upsets: ["being corrected or told she already asked", "loud television in the evening", "being rushed"],
  routines: ["wakes at six and says her prayers", "tablets with breakfast at eight", "rests after lunch"],
  communicationTips: ["speak slowly, one thing at a time", "use her name first", "answer repeats as if new"],
  approvedFacts: [],
};

export const DEVICES: Device[] = [
  { id: "d-living-light", kind: "light", room: "living room", state: "off" },
  { id: "d-bedroom-light", kind: "light", room: "bedroom", state: "off" },
  { id: "d-speaker", kind: "speaker", room: "living room", state: "idle" },
];

export const CONSENT: Consent = {
  id: "c-gurdev", personId: "p-gurdev", trackingOn: true, fullVoiceOn: false,
  byElderAt: "2026-07-18T05:30:00.000Z", byFamilyAt: "2026-07-18T05:35:00.000Z",
};
