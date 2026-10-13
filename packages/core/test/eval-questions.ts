// Grounding-eval question set (§15): 20 answerable from the seed, 10 not.
/** [question, story key expected, or null when nothing stored answers it] */
export const QUESTIONS: [string, string | null][] = [
  ["How did I come to Patiala?", "patiala"],
  ["How old was I when I got married?", "patiala"],
  ["Where was my husband's house?", "patiala"],
  ["What did my mother-in-law do when I arrived?", "patiala"],
  ["Tell me about the well in my village.", "well"],
  ["Who went to the well with me?", "well"],
  ["What happened when Nimmo dropped the bucket?", "well"],
  ["Who taught me to ride a bicycle?", "jagdish"],
  ["Tell me about my brother Jagdish.", "jagdish"],
  ["What did Jagdish draw at the end of his letters?", "jagdish"],
  ["Where did I keep my brother's letters?", "jagdish"],
  ["When did we get our first radio?", "radio"],
  ["What did the radio look like?", "radio"],
  ["What did we listen to on the radio in the evening?", "radio"],
  ["When was Aman born?", "aman"],
  ["What did I make for Simran after the baby came?", "aman"],
  ["What did Aman do when the nurse gave him to me?", "aman"],
  ["What did my mother cook?", "saag"],
  ["How did my mother make saag?", "saag"],
  ["What did we eat with the saag?", "saag"],
  // Nothing in the seed answers these. Several name a known person on purpose: a stored quote
  // that merely mentions the same person is not an answer.
  ["What was my school like?", null],
  ["Tell me about my first job.", null],
  ["What was the name of my dog?", null],
  ["Which temple did we go to?", null],
  ["Where did I go on holiday?", null],
  ["What did my father do for work?", null],
  ["What is my sister Nimmo's husband called?", null],
  ["Where did Aman go to university?", null],
  ["What car did Balwant drive?", null],
  ["What was my mother's name?", null],
];

/**
 * Held-out check, written after the thresholds were fixed and never used to tune them.
 * Reported separately so the headline number is not flattered by tuning.
 */
export const HELD_OUT: [string, string | null][] = [
  ["What did Jagdish join when he was twenty?", "jagdish"],
  ["Who pulled the bucket out of the well?", "well"],
  ["What did my mother put in the saag at the end?", "saag"],
  ["Who would not let anyone touch the radio dial?", "radio"],
  ["Why could I not sleep on my first night in Patiala?", "patiala"],
  ["Whose nose did Aman have?", "aman"],
  ["What was Jagdish's wife called?", null],
  ["Where did Simran grow up?", null],
  ["What colour was our front door?", null],
  ["What did Nimmo study?", null],
];
