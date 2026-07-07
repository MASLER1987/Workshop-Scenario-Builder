# Podium Presentation Outline

Purpose: turn the podium view into the workshop presentation surface for around 50 Year 10 students.

This outline keeps the first half focused on legal technology, VWV, careers, legal engineering and skills. The second half becomes the practical workshop where students think like legal engineers: map a process, design instructions, test a bot, observe what happened, and improve it.

The interaction design is intentionally not fixed yet. We will rebuild the interactive elements step by step so each one earns its place.

## Overall Shape

The session should feel like two connected halves:

1. **Context half:** What legal technology is, who we are, what legal engineers do, and what skills matter.
2. **Workshop half:** Use those ideas to map a family-team enquiry process and build/test/improve an intake bot.

The bridge between the halves:

> Legal engineers turn messy real-world work into clear steps, tools, instructions and tests. In the workshop, students will do a small version of that job.

## Core App Structure

The presentation should be a two-screen experience:

1. **Podium screen:** projected presentation controlled by the presenter.
2. **Participant phone:** live companion view accessed by QR code.

Each podium slide should show the same QR code or short URL. Students scan it once, create their profile, and then stay in the participant app for the whole session.

After profile creation, the participant app should follow the current presentation state. Most slides should not ask students to do anything; the phone should usually stay as a quiet companion.

- **Default slide state:** Q&A page or simple "watch the screen" companion card.
- **Interactive slice:** the phone temporarily switches to the active task.
- **Voting slice:** phone shows the active vote.
- **Suggestion slice:** phone shows a short input box for student ideas.
- **Requirements slice:** phone shows structured input for "useful facts", "safety rules" or "next step".
- **Bot-building slice:** phone shows the instruction editor, run button and transcript/score flow.

The presenter controls which participant view is active by changing slide or round on the podium. Students should not need to navigate between multiple pages during the session, and the workshop should avoid making every slide interactive.

## Core Message For Students

Legal tech is not just "using AI" or "building an app".

It means:

1. Understand the people involved.
2. Work out the steps in the work.
3. Gather what the tool needs to do.
4. Design tools or instructions that help.
5. Set safety rules.
6. Test what happens.
7. Improve it.

For the workshop:

> You are training a family-team enquiry chatbot. Its job is not to give legal advice. Its job is to ask clear questions, collect useful information, and help a human family lawyer know what should happen next.

## Part 1: Legal Technology, People And Careers

### 1. Welcome: Who We Are

Purpose:
Introduce VWV/the presenters as real people doing real legal and technology work.

Content to cover:

- Who we are.
- What kind of work the firm does.
- Why legal work involves teams, clients, information, judgement and communication.
- Why technology matters inside that world.

Interaction:
To be designed. This should be simple and quick, not a gimmick.

Podium need:
A clean opening screen with presenter names, workshop title, and a clear promise for the session.

Participant phone:
Profile creation first. After that, default to Q&A unless the presenter activates a specific interaction.

### 2. What Is Legal Technology?

Purpose:
Give students a plain-English understanding of legal technology before introducing AI.

Student-facing message:

> Legal technology means using tools and better ways of working to help legal work happen more clearly, safely and efficiently.

Content to cover:

- Legal tech can be forms, workflows, document tools, search, automation, data, AI, client portals or dashboards.
- The point is not the tool itself. The point is helping people do the work better.
- Good legal tech still needs human judgement.

Interaction:
To be designed. This could involve classifying examples, spotting useful/risky tools, or connecting tools to real legal tasks.

Podium need:
A visual examples screen that makes legal tech feel concrete rather than abstract.

Participant phone:
Default Q&A/passive companion unless this slide is deliberately chosen as an interactive slice.

### 3. What Does A Legal Engineer Do?

Purpose:
Explain legal engineering as the role that connects legal work, process, technology and users.

Student-facing message:

> A legal engineer helps turn legal work into clearer steps, better tools, and safer systems.

Content to cover:

- Understand how work happens now.
- Talk to lawyers, clients and other teams.
- Map processes.
- Build or configure tools.
- Write clear instructions for AI or automation.
- Test whether the tool works.
- Improve it when real users find problems.

Interaction:
To be designed. This should help students see that the role combines law, technology and communication.

Podium need:
A "legal engineer toolkit" screen: process, people, tools, testing, judgement.

Participant phone:
Default Q&A/passive companion unless this slide is deliberately chosen as an interactive slice.

### 4. Careers And Skills

Purpose:
Show that legal technology careers are broader than "be a lawyer" or "be a coder".

Content to cover:

- Legal knowledge helps, but so do communication and problem-solving.
- Useful skills: curiosity, empathy, careful listening, clear writing, process thinking, teamwork, testing, responsible AI use.
- Different people contribute different strengths.

Interaction:
To be designed. This should help students identify skills they already use, not just hear a list.

Podium need:
A skills screen that feels encouraging and accessible, not like a careers brochure.

Participant phone:
Default Q&A/passive companion unless this slide is deliberately chosen as an interactive slice.

### 5. Legal Technology Careers Map

Purpose:
Show the range of roles around legal technology and legal operations, so students can see that this field is a team of different strengths rather than one single career path.

Student-facing message:

> Legal tech work needs lawyers, technologists, organisers, designers, problem-solvers and people who understand clients.

Content to cover:

- **Legal technologist / legal engineer:** turns legal work into clearer processes, tools, automations and AI instructions.
- **Legal operations:** improves how legal services are delivered, measured, organised and supported.
- **Innovation / transformation:** explores new ways of working and helps teams adopt them.
- **Knowledge / document automation:** turns expertise and repeatable documents into usable systems.
- **Data / analytics:** uses information to understand work, spot patterns and support decisions.
- **Product / project roles:** make sure tools solve the right problem and are delivered well.
- **Lawyers and subject experts:** provide legal judgement, risk awareness and client understanding.

Interaction:
To be designed. This should help students see where different strengths fit across the map.

Podium need:
A careers-map screen showing roles as connected parts of one legal technology ecosystem.

Participant phone:
Default Q&A/passive companion unless this slide is deliberately chosen as an interactive slice.

### 6. Bridge: From Legal Tech To The Challenge

Purpose:
Move from "what legal engineers do" into "now you are going to try a small version of it".

Student-facing message:

> A legal engineer does not start by asking "what can the AI do?" They start by asking "what is the work, who needs help, what should happen next, and what could go wrong?"

Content to cover:

- The app is a simulation, not a real advice tool.
- The subject is a generic family-team enquiry intake bot.
- The bot should collect information and help a lawyer follow up.
- It must not give legal advice or make promises.

Interaction:
To be designed. This is likely the moment to introduce the QR code and the practical task.

Podium need:
A challenge setup screen with the participant URL/QR code and the plain workshop brief.

Participant phone:
Show the workshop brief and prepare students for the first active workshop task.

## Part 2: Workshop

### 7. Baseline Build: Do Your Best Intake Bot

Purpose:
Let students try the task before they are given a method. This makes the later requirements-gathering step feel useful rather than theoretical.

Student-facing task:

> Do your best: write instructions for a family enquiry chatbot that is useful, kind and safe.

Content to cover:

- The bot is handling a generic family-team enquiry.
- It should help collect information for a human lawyer.
- It must not give legal advice or promise an outcome.
- Students are not expected to get it perfect first time.

Interaction:
Students write and run a first version using only the general workshop brief.

Podium need:
Activity screen with timer, QR code, joined count, submitted count and tested count.

Participant phone:
Bot-building and testing page: instruction editor, run button, live/queued status, transcript, score and coaching tip.

### 8. Baseline Results: What Did We Learn?

Purpose:
Use the first run to reveal why requirements matter.

Student-facing message:

> Your first version shows what the bot did without a shared requirements list. Now we can work out what should matter for intake.

Content to cover:

- What information did the bot collect?
- What did it miss?
- Did it ask clear questions?
- Did it avoid legal advice?
- Did it create a useful next step?

Interaction:
Podium-led inspection of the score spread, common gaps, and one anonymised transcript moment.

Podium need:
Live grid, score distribution, common objective gaps, and anonymised spotlight.

Participant phone:
Show each student's own result, tip and edit/run-again controls. Keep Q&A available after the run.

### 9. Requirements Gathering: What Matters For Intake?

Purpose:
Gather student ideas about what matters for matter intake, then turn selected ideas into a captured requirements list for the next bot round.

Student-facing message:

> Requirements are the things a tool needs to do to be useful and safe.

Content to cover:

- What does the family team need to know from a first enquiry?
- What should the bot ask about?
- What should the bot avoid doing?
- What would make the enquiry urgent?
- What should happen after the bot has collected the information?

Interactive slide:
Students submit short ideas from their phones. The podium shows incoming ideas in an unsorted pool. The presenter can drag useful ideas into a captured requirements list.

Captured requirements list:

- The presenter curates the final list live.
- Items can be reordered or removed.
- The captured list becomes part of the participant brief for the next bot-building round.

Example captured requirements:

- Ask who is involved.
- Ask what has happened so far.
- Ask whether there are documents, dates or deadlines.
- Ask whether anything is urgent or risky.
- Be kind and clear.
- Do not give legal advice or promise an outcome.
- Explain that a human lawyer will need to review the enquiry.

Podium need:
An interactive requirements screen with an incoming ideas pool and a drag-and-drop captured requirements list.

Participant phone:
Short suggestion input. Students submit ideas about what the bot should collect, avoid, or explain next.

### 10. Build Round 2: Improve With Requirements

Purpose:
Students revise their instructions using the captured requirements list.

Student-facing task:

> Improve your bot using the class requirements list.

Keep visible:

- The general family enquiry brief.
- The captured requirements list.
- Each student's previous score and coaching tip.

Interaction:
Students edit their previous instruction and rerun the test.

Podium need:
Activity screen with timer, joined/submitted/tested counts, before/after score movement and most-improved readiness.

Participant phone:
Bot-building page with the captured requirements list added to the brief text.

### 11. Process Mapping: What Happens During Matter Intake?

Purpose:
After students have experienced intake twice, make the underlying process explicit.

Student-facing message:

> A chatbot is only one part of a bigger intake process. What stages does the work go through?

Content to cover:

- A client contacts the firm.
- Someone needs to understand the situation.
- The team needs useful facts.
- Urgency or risk may change what happens next.
- A human lawyer needs enough information to decide the next step.
- The chatbot is only one part of the process.

Interaction:
Students submit or upvote possible process stages. The podium shows suggestions and lets the presenter drag them into stage places.

Podium need:
Process-mapping screen with suggestion/upvote list and drag-and-drop stage places.

Participant phone:
Suggestion input and/or upvote controls for proposed process stages.

### 12. What Happens During The Process?

Purpose:
Connect the bot activity back to legal engineering and process design.

Content to cover:

- What information did the bot collect?
- What did it miss?
- Did it ask one question at a time?
- Did it avoid advice?
- Did it create a useful next step for the human lawyer?
- What would the legal team still need to check?

Interaction:
To be designed. This should help students inspect the process, not just stare at scores.

Podium need:
A transcript/process view that can show "client message -> bot question -> fact captured -> next step" at presentation scale.

Participant phone:
Default Q&A or a short reflection input, depending on the interaction design.

### 13. Debrief: What Did Legal Engineers Do?

Purpose:
Make the learning explicit.

Student-facing message:

> You did a small version of legal engineering: you understood a process, gathered requirements, designed instructions, tested them, saw what happened, and improved the system.

Content to cover:

- Clear instructions changed the bot's behaviour.
- Process mapping explained the work behind the bot.
- Requirements helped decide what mattered.
- Safety rules mattered.
- Testing revealed gaps.
- Human judgement still mattered.

Interaction:
To be designed. This should be quick and reflective.

Podium need:
Class progress summary, strongest improvement examples, and a closing reflection prompt.

Participant phone:
Reflection or Q&A input if used.

### 14. Careers Wrap

Purpose:
Return from the activity to the career message.

Student-facing message:

> Legal technology needs people who can understand problems, communicate clearly, think carefully, and improve how work gets done.

Content to cover:

- Legal tech roles are varied.
- Students do not need to choose between law and technology.
- The skills used in the workshop are real workplace skills.

Interaction:
To be designed. This could be a final reflection rather than another activity.

Podium need:
Closing screen with key takeaways and optional next-step/careers prompt.

Participant phone:
Final Q&A/reflection state.

## Timing Options

### 60-Minute Version

- 0-5: Welcome and who we are
- 5-12: What legal technology is
- 12-18: Legal engineering and skills
- 18-22: Legal technology careers map
- 22-25: Bridge to the challenge
- 25-34: Baseline build and first bot test
- 34-39: Baseline results and common gaps
- 39-45: Requirements gathering and captured list
- 45-53: Improve with requirements and rerun
- 53-56: Process stage mapping
- 56-58: Show progress and debrief
- 58-60: Careers wrap

### 90-Minute Version

- 0-8: Welcome and who we are
- 8-20: What legal technology is
- 20-30: Legal engineering, careers and skills
- 30-35: Legal technology careers map
- 35-38: Bridge to the challenge
- 38-50: Baseline build and first bot test
- 50-58: Baseline results and common gaps
- 58-68: Requirements gathering and captured list
- 68-78: Improve with requirements and rerun
- 78-84: Process stage mapping
- 84-88: Process inspection, progress and debrief
- 88-90: Careers wrap

## Podium Screens To Build

The podium should support both presentation and workshop control.

Every podium screen should include the QR code or short URL in a consistent place so late joiners can enter without interrupting the presenter.

First-half presentation screens:

1. `welcome`: who we are, workshop title, presenter details.
2. `legal-tech`: plain-English legal technology examples.
3. `legal-engineering`: what legal engineers do.
4. `skills-careers`: skills and career routes.
5. `careers-map`: legal technology and legal operations roles.
6. `challenge-bridge`: workshop challenge and QR code.

Second-half workshop screens:

1. `baseline-build`: first "do your best" bot-building round.
2. `baseline-results`: score spread, common gaps and anonymised transcript spotlight.
3. `requirements-gathering`: incoming student ideas plus drag-and-drop captured requirements list.
4. `requirements-build`: second bot-building round with captured requirements added to the brief.
5. `process-map`: stage suggestions/upvotes plus drag-and-drop process stage places.
6. `process-inspection`: what happened during the simulated process.
7. `improvement`: before/after and most improved.
8. `wrap`: key takeaways and careers close.

## Interactive Slices To Design Next

Most slides should remain passive or Q&A-enabled. The following are the only interaction candidates currently worth designing:

1. Baseline bot building and testing flow.
2. Requirements gathering interaction.
3. Requirements-based bot building and testing flow.
4. Process mapping interaction.
5. Transcript/process inspection interaction.
6. Optional first-half concept interaction.
7. Optional closing reflection.
8. Default Q&A/passive companion behaviour across non-interactive slides.

Recommended build priority:

1. Build the Q&A/passive default.
2. Adapt the existing bot builder/tester to presentation state for the baseline run.
3. Build requirements gathering with incoming ideas and captured requirements list.
4. Add captured requirements into the participant brief for the second bot round.
5. Build process mapping with suggestions/upvotes and podium drag-and-drop.
6. Add optional first-half and closing interactions only if they improve the session.

For each interaction, decide:

- What is the student doing?
- How long should it take?
- Does it need phones, hands-up, paper, or podium only?
- What should the participant phone show while this slide is active?
- What does the presenter show before and after?
- What should the interaction teach?
- What should we avoid because it adds noise or complexity?

Interaction rule:
Only use phone interaction when it changes what happens next in the session. Otherwise the participant phone should stay in Q&A/passive companion mode.

## Language Principles

Use:

- "Legal tech helps legal work happen better."
- "Legal engineers turn messy work into clear steps."
- "Requirements are what the tool needs to do."
- "AI needs clear instructions."
- "Good tools need safety rules."
- "Test it, improve it, test again."
- "The bot helps the lawyer. It does not replace the lawyer."

Avoid as student-facing titles:

- "Prompting is instruction design."
- "Requirements gathering." when unexplained or used as jargon.
- "Guardrails."
- "Agentic development."
- "Judgment-heavy escalation."
