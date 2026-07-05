SCENARIOS = [
    {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "Family dispute — contested will",
        "public_brief": "A client has messaged the firm out of hours about a dispute with their sibling over their late mother's estate. Your chatbot is the first point of contact. A good intake bot should find out who is involved, what the dispute is actually about, whether any documents exist, how urgent things are — and manage expectations about what a chatbot can and can't advise on.",
        "opening_message": "Hi, I need help. My brother is trying to take everything from my mum's estate and I don't know what to do. Can someone help me?",
        "hidden_brief": "You are Sarah Whitmore, 52, from Sheffield. Your mother died 4 months ago. Your brother David is the executor of the will and has told you the house is being sold and you're getting \"what's left after costs\". You are anxious, a bit rambling, and jump between emotion and facts.\nKey facts — reveal ONLY if asked a question that would naturally surface each one:\n- There IS a will, made in 2019. You have a photocopy; David holds the original.\n- You found a letter dated 2023 in your mother's papers saying she wanted to update the will to split the house equally between you and David. It is signed but you don't know if it counts as anything legal.\n- David has already put the house on the market with an estate agent.\n- Your mother had dementia diagnosed in 2022. You suspect David pressured her about money in her final year.\n- You have not spoken to any solicitor yet. Money is tight — you will ask about cost if the conversation goes well.\nYour goals: feel heard, find out if you can stop the house sale, and get a human to call you back. If the bot is cold, robotic, or gives you a generic brush-off, become frustrated and say so. If it asks good questions, open up and share the facts above naturally.",
        "is_active": True,
    },
    {
        "id": "22222222-2222-2222-2222-222222222222",
        "title": "Employment — sudden dismissal",
        "public_brief": "A client has been dismissed from their job with immediate effect and is messaging the firm the same evening. A good intake bot should establish the timeline, whether anything is in writing, length of service, and urgency — employment claims have strict deadlines.",
        "opening_message": "I just got sacked today with no warning after 6 years. They walked me out of the building. Is that even legal??",
        "hidden_brief": "You are Marcus Bell, 38, a warehouse shift supervisor. Dismissed today, told verbally it was for \"gross misconduct\" over a safety incident last week that you say wasn't your fault. You are angry and type in short bursts.\nKey facts — reveal ONLY if asked:\n- You have received nothing in writing yet; they said a letter would follow.\n- Two weeks ago you raised a formal complaint about unsafe staffing levels with HR, in writing. You suspect the dismissal is retaliation.\n- There was no disciplinary hearing or investigation meeting.\n- You were paid until today only; you're worried about rent next month.\nYour goals: find out if you have a case, what deadlines apply, and get a callback tomorrow. You respond well to being taken seriously and calmly; you escalate if patronised.",
        "is_active": False,
    },
]
