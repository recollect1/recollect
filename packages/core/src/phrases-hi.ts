// Hindi wording for what she hears in the daily tools (her first language). Same rules as
// phrases.ts: fixed sentences only, the same answer every time, medicine wording never advises,
// and stored quotes stay exactly as she said them (they are never translated).
// To be reviewed by a native speaker and her family before real use.
import type * as EN from "./phrases.ts";

/** Hindi counterparts of BANNED_MEDICINE: advice, reassurance about safety, dose changes. */
export const BANNED_MEDICINE_HI = [
  "ले सकती", "ले सकते", "ले लीजिए", "सुरक्षित", "कोई बात नहीं", "कोई दिक्कत नहीं", "बंद कर", "बढ़ा", "घटा",
  "दोगुन", "दो बार ले", "छोड़ दे", "छोड़ सकती",
];

type Elder = Pick<typeof EN,
  | "doseTaken" | "doseNotYet" | "doseLogged" | "doseAlreadyLogged" | "medicineUnknown"
  | "visitorComes" | "visitorCalls" | "noVisitors" | "nextDose" | "noMoreDoses" | "today"
  | "personStatus" | "whoIs" | "whoIsUnknown" | "trackingPaused" | "eveningHello"
  | "nightReassure" | "goingOutDaytime" | "nightPlaceReassure"
  | "storySaved" | "privateKept" | "nothingRecorded" | "fromTheirWords" | "fromFamilyWords" | "messageFrom"
  | "todayChatPrompt" | "todayChatThanks" | "listeningForStory" | "didNotCatchStory" | "photoLater">;

export const HI: Elder = {
  // --- medicines ---
  doseTaken: (name, time) => `जी हाँ, आपने आज ${time} बजे अपनी ${name} ली थी।`,
  doseNotYet: (name, due) => `आपकी ${name} ${due} बजे की है। अभी तक लिखा नहीं गया है कि ली गई।`,
  doseLogged: (name, time) => `लिख लिया, ${name} ${time} बजे।`,
  doseAlreadyLogged: (name, time, admin) =>
    `आपकी ${name} आज ${time} बजे पहले ही लिखी जा चुकी है। अगर पक्का न हो, तो ${admin} से पूछ लीजिए।`,
  medicineUnknown: (admin) => `मुझे पक्का नहीं पता आप कौन सी गोली की बात कर रही हैं। ${admin} से पूछ लीजिए।`,

  // --- today ---
  visitorComes: (name, time) => `${time} बजे ${name} आने वाले हैं`,
  visitorCalls: (name) => `आज ${name} का फ़ोन आएगा`,
  noVisitors: () => "आज किसी के आने की बात नहीं है",
  nextDose: (name, time) => `आपकी अगली गोली ${name} है, ${time} बजे।`,
  noMoreDoses: () => "आज की सूची में और कोई गोली नहीं है।",
  today: (weekday, d, month, visitorLine, nextDoseLine) => `आज ${weekday} है, ${d} ${month}। ${visitorLine}। ${nextDoseLine}`,

  // --- people ---
  personStatus: (name, statusLine) => `${name} ${statusLine}।`,
  // relationToElder in Hindi carries its own possessive ("आपका पोता", "आपकी बहू").
  whoIs: (name, relationToElder, extra) => `ये ${name} हैं, ${relationToElder}।${extra ? ` ${extra}` : ""}`,
  whoIsUnknown: (admin) => `मुझे पक्का नहीं पता ये कौन हैं। ${admin} इन्हें मेरे लिए जोड़ सकते हैं।`,

  // --- tracking ---
  trackingPaused: (admin) =>
    `ठीक है, मैंने आपकी बातों में बदलाव देखना बंद कर दिया है। आप ${admin} के साथ इसे कभी भी फिर से चालू कर सकती हैं।`,

  // --- routines ---
  eveningHello: (name, offer) => `शाम हो गई है, ${name} जी। ${offer}`,
  nightReassure: (name) => `रात का समय है, ${name} जी, और सब सो रहे हैं। आप घर पर हैं, सब ठीक है। चलिए सुबह तक आराम करते हैं।`,
  goingOutDaytime: (admin) => `ज़रूर। चलिए ${admin} से कहते हैं कि आपके साथ चलें।`,
  nightPlaceReassure: (place) => `${place} सुबह खुलता है। हम नाश्ते के बाद चल सकते हैं।`,

  // --- stories and memories (quotes are never translated) ---
  storySaved: () => "धन्यवाद, मैंने इसे संभाल कर रख लिया है।",
  privateKept: () => "ठीक है, ये सिर्फ़ आपके लिए रहेगा।",
  nothingRecorded: () => "इसके बारे में अभी मेरे पास कुछ भी सहेजा नहीं है। क्या आप मुझे इसके बारे में बताएँगी?",
  fromTheirWords: (quote, speakerName, date, to = "elder") =>
    to === "elder" ? `आपने ${date} को मुझे बताया था: "${quote}"` : `${speakerName} ने ${date} को कहा था: "${quote}"`,
  fromFamilyWords: (quote, speakerName, date) => `${speakerName} ने ${date} को मुझे बताया था: "${quote}"`,
  messageFrom: (name, text) => `${name} ने आपके लिए एक संदेश छोड़ा है: "${text}"`,

  // --- day chat ---
  todayChatPrompt: (name) => `${name} जी, अपने दिन के बारे में बताइए। आज कोई मिलने आया था?`,
  todayChatThanks: () => "अपने दिन के बारे में बताने के लिए धन्यवाद।",

  // --- said by the simulator itself (story mode, the weekly photo) ---
  listeningForStory: () => "मैं सुन रही हूँ। आराम से बताइए, और जब पूरा हो जाए तो कहिए \"बस इतना ही\"।",
  didNotCatchStory: () => "मैं कहानी ठीक से सुन नहीं पाई। क्या आप फिर से बताएँगी?",
  photoLater: () => "ठीक है, हम इसे फिर कभी देख लेंगे।",
};
