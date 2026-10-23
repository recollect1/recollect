"""Every spoken line in the film (video/FILM_PLAN.md v2), with its Polly voice.

NARRATOR = Kajal (en-IN neural). Re-enactment voices: GURDEV = Aditi (slowed), AMAN = Arthur (en-GB),
RECOLLECT = Joanna; RECOLLECT_HI = Kajal (hi-IN). RECOLLECT lines are the replies we expect from the
app; record.py checks each against the real reply on screen and tts.py re-voices any that differ.
"""

VOICES = {
    "narr": ("Kajal", "neural", "en-IN", "108%"),
    "gurdev": ("Aditi", "standard", "en-IN", "88%"),
    "gurdev_hi": ("Aditi", "standard", "hi-IN", "88%"),
    "aman": ("Arthur", "neural", "en-GB", None),
    "rec": ("Joanna", "neural", "en-US", None),
    "rec_hi": ("Kajal", "neural", "hi-IN", None),
}

STORY_SPOKEN = "My father came to visit us in Patiala in 1968, and he brought a radio."
STORY_REST = ("It was the first radio in our house. It was a big brown Murphy radio and it sat on a shelf in the front room. The whole street came to listen to "
              "the cricket. In the evening we listened to old songs on Radio Ceylon. That's all.")
WEDDING_ANSWER = "It rained all morning, and my mother tied my dupatta twice."

LINES: dict[str, tuple[str, str]] = {
    # 1 · problem
    "n1": ("narr", "Fifty-seven million people live with dementia. Gurdev, seventy-eight, can describe her wedding day in 1966, but not whether she took this morning's tablet."),
    # 2 · who it hurts
    "n2": ("narr", "That hurts three people: her, asking the same worried questions all day; her family, far away; and her doctor, who sees her for minutes a year. Recollect is an Alexa Plus companion for all three."),
    # 3 · morning
    "n3a": ("narr", "Her morning: calm answers from her family's schedule and today's tablet log. Never medical advice."),
    "g3a": ("gurdev", "Did I take my BP tablet?"),
    "r3a": ("rec", "Yes, you took your BP tablet at 8:10 today."),
    "g3b": ("gurdev", "Who is Aman?"),
    "r3b": ("rec", "That's Aman, your grandson, Simran's son. Aman is in London and calls you on Sundays."),
    "g3c": ("gurdev", "Where is Aman?"),
    "r3c": ("rec", "Aman is in London and calls you on Sundays."),
    "n3b": ("narr", "Same answer. Never, you already asked."),
    # 4 · Hindi
    "n4": ("narr", "She can speak Hindi, or mix both, and hear her own language back."),
    "g4": ("gurdev_hi", "अमन कहाँ है?"),
    "r4": ("rec_hi", "Aman लंदन में हैं और रविवार को आपको फ़ोन करते हैं।"),
    # 5 · story + memory graph
    "g5a": ("gurdev", "I want to tell you a story."),
    "r5a": ("rec", "I'm listening. Take your time, and say \"that's all\" when you're done."),
    "g5b": ("gurdev", STORY_SPOKEN),
    "r5b": ("rec", "Thank you, I've kept that."),
    "n5": ("narr", "Her words are kept exactly, in a FalkorDB graph. A Strands agent on Amazon Bedrock finds the people and places, and links them to what she told us before. That graph lets Recollect answer from her own words, and notice when she retells a story."),
    # 6 · her words, never invented
    "n6a": ("narr", "Her grandson can ask too."),
    "a6": ("aman", "How did Grandma come to Patiala?"),
    "r6a": ("rec", "Gurdev said on 3 August 2026: \"I came to Patiala in 1966, two days after my wedding. I was eighteen years old.\""),
    "g6": ("gurdev", "What was my school like?"),
    "r6b": ("rec", "I don't have anything saved about that yet. Would you like to tell me about it?"),
    "n6b": ("narr", "If she never said it, Recollect says so."),
    # 7 · questions from the family
    "n7a": ("narr", "Her family can leave her a question. In the afternoon, Recollect asks it."),
    "r7a": ("rec", "Aman would love to know: \"What was your wedding day like?\" Would you tell me about it?"),
    "g7": ("gurdev", WEDDING_ANSWER),
    "r7b": ("rec", "Thank you, I've kept that."),
    "n7b": ("narr", "Her answer is kept in her words, for him."),
    # 8 · timeline
    "n8": ("narr", "Every story lands on her life timeline, at the year she said, or the year her family confirmed. "
                   "Nothing is guessed."),
    # 9 · carer and doctor
    "n9a": ("narr", "Simran sees her day at a glance: tablets, visitors, and the questions that worried her."),
    "n9b": ("narr", "With consent from both, her everyday speech is compared only with her own baseline. This history is simulated. Only a four-week change is flagged, and it never diagnoses."),
    "n9c": ("narr", "It becomes a one-page report for her doctor, with questions worth asking."),
    "n9d": ("narr", "Recollect prepares the next steps for the family to approve, and checks on the carer too."),
    # 10 · how it's built
    "n10": ("narr", "Under the hood: a real MCP server for Alexa Plus, answering in milliseconds, with no AI writing what she hears; a FalkorDB graph; and Strands agents on Bedrock and AgentCore."),
    # 11 · close
    "n11": ("narr", "Recollect. Her story, in her words."),
}
