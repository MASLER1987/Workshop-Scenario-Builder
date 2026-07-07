# Legal Tech Workshop Presentation Notes

Source index: https://thisisthejay.github.io/legal-tech-workshop/presentations/

Purpose: extracted structure and content notes for turning the Prompt Playground podium view into a presentation surface.

## Overall Presentation Structure

- Part 1, 10:00-11:15: What is Legal Technology?
- Section A, 11:30-12:00: Process Mapping the Matter
- Section B, 12:05-12:25: Requirements Gathering
- Section B, 12:25-12:40: Agentic Development
- Section B, 12:40-12:45: Product Walkthrough
- Section C, 12:45-13:00: Wrap-Up and Careers

The current presentation materials are web-first draft pages, designed for fast iteration. The workshop narrative moves from shared concepts, to process mapping, to requirements, to AI-assisted build thinking, to a prototype walkthrough, then closes with careers and reflection.

## Deck 1: What is Legal Technology?

Source: https://thisisthejay.github.io/legal-tech-workshop/presentations/what-is-legal-technology/

Deck intent: establish shared foundation, introduce who is in the room, explain why legal technology matters, define core terms, and locate legal tech roles across the market.

Status note: draft needs team review. Jay, Martin, El and Mercy should tune personal examples, VWV context and terminology.

Slides:

1. Legal technology is legal work changing shape
   - Opening message: legal tech is a practical bridge between legal expertise, better processes and tools that help useful legal work get done.
   - It is not a coding lecture.
   - It is not a product sales pitch.
   - It is a way to think about legal work, systems and AI.
   - Facilitator note: set the tone that legal tech is not separate from legal work; it is one way legal work gets designed, delivered and improved.

2. How we each got here
   - Facilitators introduce route into legal tech, role, background, and moment legal tech became interesting.
   - Prompts: what did you study or do before this; what does your role involve now; what surprised you about legal tech?
   - Activity: three minutes each from Jay, Martin, El and Mercy.
   - Keep stories personal and concrete.
   - Visual idea: four profile tiles with photo, role line and unexpected pathway detail.

3. Where are we starting from?
   - Room confidence and curiosity check before concepts.
   - Ask who has used AI for work, study or personal tasks.
   - Ask where people already see value.
   - Ask which concerns or risks feel most real.
   - Activity: hands, quick poll or sticky notes; capture concerns without solving them immediately.

4. Legal tech is not just software
   - Definition: legal tech includes tools, processes, data, people and design choices shaping legal service delivery.
   - Examples: document automation, better intake workflow, chatbot plus surrounding process.
   - Facilitator note: move away from shiny tools and toward systems thinking.

5. Prompting is instruction design
   - Prompting means giving an AI enough context, task direction, constraints and examples.
   - Recipe: context, task, constraints, examples.
   - Visual idea: prompt recipe equation.

6. Legal operations makes legal work run better
   - Legal ops focuses on business and delivery side of legal work.
   - Topics: process, data, vendors, budgets, reporting, continuous improvement.
   - Questions: how does work arrive; who handles it; where does it slow down; what evidence shows improvement?

7. Legal engineering turns legal knowledge into systems
   - Legal engineering structures legal knowledge to power repeatable tools, workflows, documents or decision support.
   - Break legal reasoning into steps.
   - Define rules, exceptions and escalation points.
   - Design outputs people can trust and use.
   - Facilitator note: legal engineering does not replace judgment; it creates a better route to apply judgment consistently.

8. Systems thinking asks what surrounds the task
   - A legal task sits inside people, handoffs, deadlines, documents, incentives, risks and feedback loops.
   - Questions: if one step changes, what else changes; where does information enter; where do people need reassurance, review or escalation?
   - Visual idea: simple system map showing client, lawyer, matter data, output, review and next action.

9. The legal tech market has several homes
   - Legal tech appears in vendor products, in-house legal teams, law firms and hybrid innovation roles.
   - Vendors build for many customers.
   - In-house teams manage demand and risk.
   - Law firms improve delivery and client experience.
   - Legal ops and AI engineering roles connect pieces.

10. Now we turn the ideas into a workflow
    - Transition to build session.
    - Before reaching for AI or software, understand the legal journey being improved.
    - Map the matter.
    - Spot friction and repetition.
    - Gather requirements.
    - Use AI to move from concept to prototype.
    - Facilitator note: Part 2 should feel like the natural next step.

## Deck 2: Process Mapping the Matter

Source: https://thisisthejay.github.io/legal-tech-workshop/presentations/process-mapping/

Deck intent: introduce mapping a legal matter so participants can see handoffs, decisions, risks and automation opportunities.

Status note: draft needs example matter; current draft assumes a generic matter flow.

Slides:

1. Before we build, we map
   - A process map shows what actually happens, who is involved, what information moves and where decisions are made.
   - It gives everyone the same picture.
   - It exposes hidden work.
   - It helps choose the right intervention.

2. A process is a story with handoffs
   - Legal work stages: request, intake, triage, advice, document work, review, communication, next action.
   - Questions: what starts the matter; what happens next; who needs to do or approve something; what is produced?
   - Visual idea: horizontal timeline with swimlanes for client, legal team and operations.

3. Map the matter at human level first
   - First map should be broad, not exception-heavy.
   - Goal is core journey.
   - Start with trigger.
   - Add main legal and administrative steps.
   - Mark decision points.
   - End with output or next action.
   - Facilitator note: avoid edge-case traps; park exceptions.

4. Friction points are clues
   - Automation opportunities appear where work is repeated, delayed, copied, manually checked or unclear.
   - Examples: duplicate data entry, waiting for missing information, manual document drafting, repeated status updates, unclear escalation rules.

5. What happens after the interaction?
   - Post-interaction steps matter as much as the front door.
   - Map how input becomes legal output.
   - Questions: what does the user receive; what does the legal team review; what evidence is recorded; what prepares the next consultation?

6. Not every step should be automated
   - Aim is balance between automation, assistance, review and human judgment.
   - Automate repeatable collection and formatting.
   - Assist summaries and drafts.
   - Escalate risk, ambiguity and judgment-heavy issues.
   - Keep record of what changed and why.

7. Build the first map
   - Participants map matter from first contact to next useful legal action.
   - Use sticky notes or cards.
   - Mark people or roles above each step.
   - Add pain points in different colour.
   - Circle one automation opportunity.
   - Activity: 8-10 minutes sketching, then each group shares one friction point and one opportunity.

8. The map becomes the brief
   - Process tells us what happens.
   - Requirements tell us what the tool must support.
   - AI can help draft from both but needs clear inputs.

## Deck 3: Requirements Gathering

Source: https://thisisthejay.github.io/legal-tech-workshop/presentations/requirements-gathering/

Deck intent: show legal operations/product thinking for gathering requirements for an app, chatbot or automation.

Status note: draft needs final scenario. Placeholder personas and Jeff Bezos anchor should be tuned before external sharing.

Slides:

1. A process map is not yet a product
   - Requirements turn the map into a practical brief.
   - Questions: who needs help; what do they need to do; what does the legal team need; what would make it safe and useful?

2. Different users need different design choices
   - A lawyer-facing tool can fail for a client.
   - A confident-user tool can fail for someone anxious, busy or not tech savvy.
   - User groups: external client, internal legal team, BAU team, reviewer/approver/escalation contact.

3. Mrs Smith: capable, busy, not tech savvy
   - Persona reminds participants that legal tools need clarity, reassurance and simple language.
   - Needs to understand what is being asked.
   - May not know legal terminology.
   - Needs confidence that next step is safe.
   - May abandon cold or confusing flows.
   - Facilitator note: name is not the point; design for someone outside legal/technical language.

4. The legal team needs usable inputs
   - Internal users need enough structure to review, advise and act without reconstructing facts.
   - Outputs: clean request summary, key facts and missing information, risk flags and urgency, suggested next steps with review points.

5. The BAU team needs repeatability
   - Solution must be maintainable, measurable and fit existing work.
   - Needs: clear ownership, simple handover, reusable templates, reporting on volume/time saved/outcomes.

6. Jeff Bezos is a stress test
   - Exaggerated high-profile persona tests whether requirements hold under urgency, complexity and scrutiny.
   - Questions: what if client is time-poor; facts are sensitive; senior review needed; output must be board-ready?
   - Facilitator note: memorable stress test, not literal scenario.

7. Good requirements are testable
   - Requirements should let someone later decide whether the prototype meets them.
   - Examples: submit key facts under five minutes, legal team receives structured summary, high-risk answers trigger escalation, tool explains next step.

8. Turn the map into a mini brief
   - Groups choose one automation opportunity and write a short requirements brief.
   - Name primary user.
   - Name one internal user.
   - Write three must-have requirements.
   - Write one risk or escalation rule.
   - Activity: one-page brief handed to agentic build section.

## Deck 4: Agentic Development

Source: https://thisisthejay.github.io/legal-tech-workshop/presentations/agentic-development/

Deck intent: bridge requirements/process maps into AI-assisted development with Codex, Claude or similar agents.

Status note: draft needs final tool choice. Add live Codex or Claude example once demo path is decided.

Slides:

1. Agents can help turn legal design into working prototypes
   - AI development agents are useful when problem, users, workflow and constraints are clear enough.
   - They can draft pages, forms, logic and tests.
   - They can refactor and iterate quickly.
   - They still need human direction and review.

2. The agent needs a good brief
   - Build quality depends on context quality.
   - Process map and requirements become agent working material.
   - Inputs: purpose, journeys/personas, data to collect, outputs to generate, risks, boundaries and review rules.

3. From vague request to build instruction
   - Useful agent instruction describes desired experience, constraints and success checks.
   - Example content: build client intake page, plain English, accessible design, collect facts/flag risks, generate summary for review, run and verify flow.
   - Visual idea: weak prompt vs build-ready prompt.

4. The lawyer stays in the loop
   - Agentic development accelerates implementation but does not remove legal responsibility, judgment or quality control.
   - Review legal assumptions.
   - Check language and expectations.
   - Test edge cases.
   - Approve risk handling.
   - Decide what can go live.

5. Build speed needs guardrails
   - Fast prototypes need clear forbidden behaviours.
   - No final advice without review.
   - No unsupported outcome claims.
   - No hidden unnecessary data collection.
   - No automation of judgment-heavy escalation points.

6. A simple agentic build loop
   - Short cycles: brief, build, inspect, test, refine.
   - Agent helps with work; team decides rightness.
   - Steps: give brief, ask for first prototype, inspect journey, test against requirements, refine copy/logic/review points.
   - Visual idea: loop diagram.

7. What can an agent produce for this workshop?
   - Web pages as fast presentation format and prototype bridge.
   - Outputs: presentation pages, client intake mockups, internal summary screens, workflow diagrams, draft requirements and test cases.

8. Now we walk through the product idea
   - Product walkthrough shows how map and requirements become user-facing experience and internal legal output.
   - Focus: what user sees, what legal team receives, where review happens, how feedback improves next version.

## Deck 5: Product Walkthrough

Source: https://thisisthejay.github.io/legal-tech-workshop/presentations/product-walkthrough/

Deck intent: scaffold a short walkthrough from user entry through legal review and next action.

Status note: draft needs final prototype; replace placeholder screens with actual prototype.

Slides:

1. A product walkthrough is a story of use
   - Show how a person moves through the tool and how the legal team receives something more useful than an unstructured request.
   - Start with user problem.
   - Show flow in sequence.
   - Explain design decisions.
   - Invite reactions on usefulness and risk.

2. The user knows what this is for
   - Opening screen should set expectations.
   - Explain what the tool can help with and cannot do.
   - Explain what happens after submission.
   - Needs plain English purpose, no false promise of instant legal advice, clear next step, reassuring tone.
   - Visual idea: landing screen with purpose, boundaries and start action.

3. The intake asks for the right facts
   - A good intake collects facts in a way that makes sense to the user and is structured enough for legal team.
   - One question at a time or grouped sections.
   - Definitions where legal terms unavoidable.
   - Progressive disclosure for complex areas.
   - Save or handoff where appropriate.

4. Risk flags are handled early
   - Flow should identify urgency, complexity or sensitive issues before confident output.
   - Flags: urgent deadlines, sensitive information, conflicting facts, senior legal review areas.

5. The legal team gets a structured summary
   - Internal output should help legal team move faster while still applying judgment.
   - Includes matter summary, key facts, missing information, risk flags, suggested next action.
   - Visual idea: internal review panel with summary, risk status and next-step checklist.

6. Ask what would make this trustworthy
   - Walkthrough should invite critique, not simple approval.
   - Questions: what would a client misunderstand; what would a lawyer need to check; where could this fail; what should next prototype improve?
   - Activity: one thing that works, one risk, one improvement.

7. A prototype is a conversation starter
   - First version is not finished product.
   - Concrete object to test, critique and improve.
   - Makes assumptions visible.
   - Reveals gaps in requirements.
   - Helps legal and technical people collaborate.

## Deck 6: Wrap-Up and Careers

Source: https://thisisthejay.github.io/legal-tech-workshop/presentations/wrap-up-careers/

Deck intent: connect activities to legal careers, transferable skills and practical confidence with AI in law.

Status note: draft needs final closing ask and follow-up plan.

Slides:

1. Today moved from concepts to build thinking
   - Recap movement from legal tech landscape to mapping, requirements and AI-assisted prototyping.
   - Covered legal tech language, process mapping, requirements gathering, agentic development, product walkthrough.

2. Legal careers are broadening
   - Modern legal work includes process design, product thinking, operations, data, automation and AI.
   - You can be legal and operational, technical, design-focused, or translator between disciplines.

3. Process mapping is a legal career skill
   - Showing how legal work happens helps improve it, explain it and choose right tools.
   - See hidden work.
   - Spot bottlenecks.
   - Compare current and future state.
   - Give technical teams better context.

4. Requirements gathering is translation
   - Turns messy human needs into a brief a team or agent can build from.
   - Listen for user needs.
   - Separate must-haves from nice-to-haves.
   - Define risk and review points.
   - Make success testable.

5. AI is useful when the work is well framed
   - AI drafts, structures, summarises and prototypes.
   - Works best with context, judgment and clear constraints.
   - Better questions produce better outputs.
   - Clear workflows produce better tools.
   - Human review remains essential.
   - Skill is directing and evaluating the system.

6. You do not need to know everything to start
   - Legal tech rewards curiosity, clarity and iteration.
   - First map, brief or prototype need not be perfect.
   - Start with real problem.
   - Map what happens now.
   - Choose one useful improvement.
   - Test with affected people.

7. What will you notice differently now?
   - Ask participants to name one legal process they now see as candidate for improvement.
   - Activity: one-minute reflection: one process, one user, one improvement opportunity.

8. Legal tech is a way of making legal work more usable
   - Strong legal technology is grounded in legal understanding, user empathy and careful systems design.
   - Know the work.
   - Understand the user.
   - Design the process.
   - Use AI and tools with judgment.

## Implications For Our Podium Presentation Mode

The app should not just show scores. It can become the live proof of the workshop argument:

1. Legal tech is legal work changing shape.
2. Prompting is instruction design.
3. A chatbot is only useful if the surrounding process works.
4. Good requirements are testable.
5. Build speed needs guardrails.
6. The prototype is a conversation starter.

Potential podium sections:

- Title / room framing
- Generic family intake task brief
- Prompt recipe slide
- Process map: client message -> bot intake -> transcript -> scorecard -> lawyer follow-up
- Requirements slide: warm tone, one question at a time, useful facts, urgency, no advice, clear next step
- Live build instructions screen
- Live participant grid
- Selected participant transcript
- Scorecard and coaching tip
- Class progress / most improved
- Reflection and careers close

