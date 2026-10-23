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
    # 1 · opening: her life line (animated)
    "n1a": ("narr", "Gurdev is seventy-eight. She remembers her wedding day in 1966: the bus to Patiala, the trunk on her lap."),
    "n1b": ("narr", "But not whether she took her tablet this morning."),
    "n1c": ("narr", "This is dementia. The newest memories go first. Fifty-seven million people live with it."),
    # 2 · the problem (animated)
    "n2a": ("narr", "So she asks, again and again. Did I take my tablet? Where is my grandson? And she can feel people tiring of the answer."),
    "n2b": ("narr", "Her family is busy, or far away. They miss the small changes, until they become big ones."),
    "n2c": ("narr", "And her doctor sees her for ten minutes, a few times a year."),
    # 3 · what we built (animated)
    "n3a": ("narr", "So we built Recollect: an Alexa Plus companion for people living with dementia, and the families who care for them."),
    "n3b": ("narr", "Calm answers, her life story in her own words, and early notice when something changes. In English, Hindi, or both."),
    # 4 · her morning
    "n4a": ("narr", "Her morning. Every answer comes from her family's schedule and today's tablet log. Nothing is guessed."),
    "g4a": ("gurdev", "Did I take my BP tablet?"),
    "r4a": ("rec", "Yes, you took your BP tablet at 8:10 today."),
    "g4b": ("gurdev", "Where is Aman?"),
    "r4b": ("rec", "Aman is in London and calls you on Sundays."),
    "n4b": ("narr", "She asks again, and hears the same gentle answer. Never, you already asked."),
    # 5 · her story + memory graph
    "n5a": ("narr", "And Recollect is where her life story lives."),
    "g5a": ("gurdev", "I want to tell you a story."),
    "r5a": ("rec", "I'm listening. Take your time, and say \"that's all\" when you're done."),
    "g5b": ("gurdev", STORY_SPOKEN),
    "r5b": ("rec", "Thank you, I've kept that."),
    "n5b": ("narr", "Her words are kept exactly as she said them. An agent on Amazon Bedrock finds the people and places, her father, Patiala, the radio, and links them to everything she has told before."),
    # 6 · her memories, given back
    "n6a": ("narr", "So when a memory slips away, Recollect can give it back, in her own words."),
    "g6a": ("gurdev", "How did I come to Patiala?"),
    "r6a": ("rec", "You told me on 3 August 2026: \"I came to Patiala in 1966, two days after my wedding. I was eighteen years old.\""),
    "g6b": ("gurdev", "What was my school like?"),
    "r6b": ("rec", "I don't have anything saved about that yet. Would you like to tell me about it?"),
    "n6b": ("narr", "If she never told it, Recollect says so. It never invents a memory."),
    # 7 · her family and her doctor
    "n7a": ("narr", "Simran, her daughter-in-law, sees her day at a glance: the tablets, and the worries she kept coming back to."),
    "n7b": ("narr", "Over months, her everyday talk shows what a short appointment can't. With consent, it's compared only with her own usual pattern. This history is simulated."),
    "n7c": ("narr", "When a change lasts four weeks, the family gets a gentle note, and her doctor a one-page report. It never diagnoses. It helps them notice early."),
    # 8 · how it's built (animated)
    "n8a": ("narr", "Under the hood, Alexa Plus calls our MCP server, which answers from her memory graph in milliseconds."),
    "n8b": ("narr", "No AI writes what she hears about her past or her medicine."),
    "n8c": ("narr", "In the background, Strands agents on Amazon Bedrock and AgentCore build the graph and watch for change."),
    # 9 · close (animated)
    "n9a": ("narr", "Dementia takes memories, one by one. Recollect keeps them safe, so she can feel at home in her own day, and her family can stay close."),
    "n9b": ("narr", "Recollect. Her story, in her words."),
}
