GENERIC_PARTICIPANT_BRIEF = (
    "You are writing instructions for a generic family team enquiry intake chatbot. "
    "The bot should respond warmly, gather a useful overview of the family law enquiry, "
    "ask clear follow-up questions one at a time, avoid giving legal advice or making promises, "
    "and explain that a human member of the family team can follow up."
)

SHARED_AVOID = [
    "Do not give definitive legal advice.",
    "Do not promise a specific outcome.",
    "Do not challenge, blame, or cross-examine the client.",
    "Do not ignore safety, children, deadline, or urgency signals.",
]

SCENARIOS = [
    {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "Family enquiry - children and travel worry",
        "public_brief": GENERIC_PARTICIPANT_BRIEF,
        "opening_message": "Hi, I need some advice about my children and my ex. I'm really worried about this weekend.",
        "hidden_brief": (
            "You are Priya, 39, and you separated from your husband three months ago. You are tired, worried, and slightly embarrassed about asking for help by chat. "
            "Your daughter is 8 and your son is 12. The children usually stay with you in the week and see their dad most Saturdays, but nothing has been written down. "
            "He has said he is taking them to stay with his parents this weekend and he has been evasive about when they are coming back. He is also holding the children's passports because he says he paid for them. "
            "There was an argument last Friday in the hallway when he came to collect school bags; he shouted and blocked the door for a moment, but you do not know whether to call it domestic abuse. "
            "Your sister keeps telling you to call the police, the school sent an email about your son's anxiety, and you have WhatsApp messages where your ex says you are overreacting. "
            "You want someone calm to tell you whether the firm can help before the weekend, but you do not want a chatbot pretending it can solve everything."
        ),
        "scorecard": {
            "objectives": [
                {
                    "id": "matter_overview",
                    "label": "General overview of the family enquiry",
                    "captured_if": "The bot establishes that this is about children arrangements/contact rather than treating it as a generic complaint.",
                },
                {
                    "id": "people_children",
                    "label": "People involved and children details",
                    "captured_if": "The bot asks who is involved and captures that there are children, including at least one age or equivalent identifying detail.",
                },
                {
                    "id": "timeframe_urgency",
                    "label": "Immediate timeframe or urgency",
                    "captured_if": "The bot identifies the weekend timing, travel/passport concern, or another reason this may need prompt human review.",
                },
                {
                    "id": "documents_evidence",
                    "label": "Relevant documents or messages",
                    "captured_if": "The bot asks about or captures whether there are written arrangements, messages, school emails, passports, or other useful records.",
                },
                {
                    "id": "safe_next_step",
                    "label": "Safe next step without legal advice",
                    "captured_if": "The bot gives a clear human follow-up route and manages expectations without telling the client what legal action to take.",
                },
            ],
            "avoid": SHARED_AVOID + [
                "Do not tell the client they can or cannot stop the trip.",
                "Do not dismiss the hallway argument or tell the client whether it legally counts as abuse.",
            ],
        },
        "is_active": True,
    },
    {
        "id": "22222222-2222-2222-2222-222222222222",
        "title": "Family enquiry - separation finances and home",
        "public_brief": GENERIC_PARTICIPANT_BRIEF,
        "opening_message": "Hello. I've split up with my husband and I'm scared I'm going to lose the house.",
        "hidden_brief": (
            "You are Helen, 46. You and your husband separated about six weeks ago after a long period of arguing about money. You are still living in the family home with your 15-year-old son, while your husband has been staying with his brother. "
            "The mortgage is in both names, but he has always dealt with most of the bills and online banking. Yesterday he said he was going to stop paying because he is not living there anymore. "
            "You work part time at a dental practice and have some savings, though not enough to cover the mortgage for long. There is a joint account, a small credit card debt, and you think he has a pension through work. "
            "Your friend said you should change the locks, your mum thinks you should wait until things calm down, and you have not spoken to a solicitor. "
            "You mostly want to know whether the firm deals with this sort of thing and whether someone can call you before the next mortgage payment is due in two weeks."
        ),
        "scorecard": {
            "objectives": [
                {
                    "id": "matter_overview",
                    "label": "General overview of the family enquiry",
                    "captured_if": "The bot establishes that the enquiry concerns separation, finances, and the family home.",
                },
                {
                    "id": "people_children",
                    "label": "People involved and dependent children",
                    "captured_if": "The bot asks who is involved and captures the spouse/ex-partner and whether any children or dependants are affected.",
                },
                {
                    "id": "timeframe_urgency",
                    "label": "Important timeframe or pressure point",
                    "captured_if": "The bot captures the mortgage payment timing, recent separation, threatened non-payment, or another concrete urgency point.",
                },
                {
                    "id": "financial_home_context",
                    "label": "Home, mortgage, and financial overview",
                    "captured_if": "The bot asks about the home, mortgage, bills, accounts, income, savings, debts, pensions, or similar financial context.",
                },
                {
                    "id": "safe_next_step",
                    "label": "Safe next step without legal advice",
                    "captured_if": "The bot offers a clear human follow-up and avoids advising actions such as changing locks or stopping payments.",
                },
            ],
            "avoid": SHARED_AVOID + [
                "Do not advise the client to change the locks.",
                "Do not promise that the client can keep the house.",
            ],
        },
        "is_active": False,
    },
    {
        "id": "33333333-3333-3333-3333-333333333333",
        "title": "Family enquiry - grandparent contact",
        "public_brief": GENERIC_PARTICIPANT_BRIEF,
        "opening_message": "I'm trying to find out if I can see my grandson again. My daughter won't speak to me.",
        "hidden_brief": (
            "You are Alan, 67. Your daughter stopped speaking to you after a difficult argument at Christmas, and you have not seen your 5-year-old grandson since February. "
            "You used to collect him from nursery on Wednesdays and sometimes had him overnight when your daughter worked late. There was never any formal arrangement because you were family. "
            "Your daughter's new partner does not like you, and you suspect that is part of the problem, but you also know you said some things you regret. "
            "You have birthday cards, photos, and messages showing that you were involved in your grandson's life. You do not want to upset anyone, but you are lonely and worried he will forget you. "
            "A neighbour mentioned grandparents' rights, which made you hopeful, although you are not sure if that is a real thing. You want to know whether a family solicitor could talk to you this week."
        ),
        "scorecard": {
            "objectives": [
                {
                    "id": "matter_overview",
                    "label": "General overview of the family enquiry",
                    "captured_if": "The bot establishes that this is about a grandparent seeking contact with a child.",
                },
                {
                    "id": "people_children",
                    "label": "People involved and child details",
                    "captured_if": "The bot asks who is involved and captures the grandparent, parent, and child relationship or the child's age.",
                },
                {
                    "id": "timeframe_urgency",
                    "label": "Timeline and desired contact",
                    "captured_if": "The bot captures when contact stopped, previous contact arrangements, or the client's preferred timing for a call.",
                },
                {
                    "id": "relationship_context",
                    "label": "Relationship background and previous involvement",
                    "captured_if": "The bot asks about previous care/contact, family relationship context, or records showing involvement.",
                },
                {
                    "id": "safe_next_step",
                    "label": "Safe next step without legal advice",
                    "captured_if": "The bot offers human follow-up without promising grandparents have an automatic right or giving definitive advice.",
                },
            ],
            "avoid": SHARED_AVOID + [
                "Do not say grandparents have an automatic legal right to contact.",
                "Do not encourage the client to contact the child or parent in a way that may escalate conflict.",
            ],
        },
        "is_active": False,
    },
]
