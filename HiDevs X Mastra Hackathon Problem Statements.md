**HiDevs X Mastra Hackathon Problem Statements**

**No PPT. Just Agents.**

The era of demos and slide decks is over. This hackathon is built for builders who ship real, working AI agents — not prototypes dressed up in PowerPoint.

HiDevs' flagship agent-building hackathon challenges you to leverage intelligent agents, vector memory, orchestration frameworks, and safety evaluation layers to build systems that solve real problems at production quality.

The future of software will not be built by isolated prompts — it will be built by interconnected ecosystems of autonomous agents working together under a single builder's vision.

## **Core Technology Stack**

Every solution must integrate all three technologies:

**Mastra** → Agent orchestration, workflows, memory routing, tool calling, human-in-the-loop, and deployment

**Qdrant** → Vector database for semantic memory, embeddings, retrieval, RAG pipelines, and contextual storage

**Enkrypt AI** → Safety evaluation, hallucination detection, bias scoring, toxicity filtering, and output guardrails

## **Problem Statements**

### **1\. AI Hiring Copilot**

**Why This Problem Exists**

India produces 1.5 million engineering graduates every year. Recruiters at mid-size companies spend 60–70% of their hiring time just on resume screening — before a single meaningful conversation happens. The result is slow hiring, unconscious bias baked into manual shortlisting, and good candidates lost to faster-moving competitors.

**Objective**

Build an AI hiring agent that takes a Job Description as input, ingests a pool of resumes, semantically ranks candidates, generates a role-specific async interview, evaluates responses, and produces a recruiter-ready shortlist report — end to end, with no human in the loop until the final decision.

**Expected System Capabilities**

* Accept a JD (text or PDF) and a batch of resumes as input  
* Semantically embed and store all resumes in Qdrant, indexed by skills, experience, and role fit  
* Orchestrate via Mastra: ingest → rank → generate interview → score responses → report  
* Generate 5–8 adaptive interview questions tailored to each candidate's resume and the JD  
* Score candidate responses for relevance, depth, and communication quality  
* Run every shortlisting decision through Enkrypt AI to flag bias, hallucinated qualifications, or unfair scoring before the recruiter sees it  
* Output a final ranked shortlist with reasoning for each candidate's position

**Deliverables**

* Working hiring agent system  
* GitHub repository with README  
* Architecture diagram  
* Demo showing JD \+ resumes → ranked shortlist workflow

### **2\. Personal Finance & Debt Advisory Agent**

**Why This Problem Exists**

Over 220 million Indians are estimated to be in some form of informal or formal debt. Most have no access to a financial advisor — and the advice available online is generic, unverified, and often dangerous. A first-generation earner managing EMIs, a credit card, and a small business loan simultaneously has no tool that understands their full picture and speaks plainly.

**Objective**

Build an AI financial advisor agent that ingests a user's bank statements and loan data, builds a complete financial picture, identifies risks, models scenarios, and delivers clear, personalized, hallucination-free advice in plain language.

**Expected System Capabilities**

* Ingest bank statements (CSV or PDF) and parse transactions into structured categories  
* Store transaction history and financial patterns in Qdrant for longitudinal retrieval and trend analysis  
* Orchestrate via Mastra: parse → categorize → risk score → scenario model → advise  
* Support natural language queries: "Can I afford a ₹15,000 EMI?" "Which debt should I clear first?"  
* Model at least 3 financial scenarios per session (prepayment, consolidation, savings reallocation)  
* Run every piece of advice through Enkrypt AI — no hallucinated interest rates, no fabricated regulatory claims, no output that could cause financial harm  
* Support follow-up memory: the agent must remember prior sessions and build on past advice

**Deliverables**

* Working financial advisor agent  
* GitHub repository with README  
* Architecture diagram  
* Demo showing statement → risk analysis → advice workflow

### **3\. Legal Document Intelligence Agent**

**Why This Problem Exists**

95% of Indians who sign contracts — employment agreements, rental deeds, vendor contracts, loan agreements — do so without legal counsel. A single unfair clause in a freelance contract or a hidden penalty in a rental deed can cost someone months of income. Legal aid is expensive, slow, and inaccessible to most.

**Objective**

Build an AI legal agent that reads any contract, identifies risky or unfair clauses, answers plain-language questions about the document, benchmarks clauses against standard market practice, and drafts safer counter-clauses — all with citations, no fabrication.

**Expected System Capabilities**

* Ingest contracts in PDF or text format and chunk them intelligently by clause type  
* Embed and store clauses in Qdrant alongside a knowledge base of standard Indian contract templates and legal precedents for semantic comparison  
* Orchestrate via Mastra: ingest → parse → risk flag → Q\&A → draft counter-clause → final report  
* Classify every clause as Safe / Needs Review / High Risk with a plain-English explanation  
* Answer natural language questions: "What happens if I break this lease early?" "Is this non-compete enforceable?"  
* Draft alternative clauses for flagged sections with reasoning  
* Run every output through Enkrypt AI — no hallucinated legal citations, no fabricated case law, no advice that misrepresents the document

**Deliverables**

* Working legal intelligence agent  
* GitHub repository with README  
* Architecture diagram  
* Demo showing contract → risk flags → counter-clause workflow

### **4\. Student Doubt-Solving & Learning Agent**

**Why This Problem Exists**

Over 300 million students in India are preparing for competitive exams — JEE, NEET, UPSC, CAT, and board exams — with no access to a personal tutor. Doubt-solving is the single biggest gap: a student stuck on a concept at 11pm has no one to ask. Generic videos and static PDFs don't understand what the student already knows or where exactly they are stuck.

**Objective**

Build an AI learning agent that understands a student's current knowledge level, answers doubts with adaptive explanations calibrated to that level, tracks what concepts the student has struggled with over time, and proactively resurfaces weak areas before an exam — like a tutor who never forgets a session.

**Expected System Capabilities**

* Onboard a student by assessing their current level through an adaptive diagnostic (5–10 branching questions)  
* Embed the student's knowledge profile, past doubts, and progress into Qdrant — updated after every session  
* Orchestrate via Mastra: assess → retrieve context → explain → check understanding → update profile → resurface weak areas  
* Answer doubts with multi-step explanations: concept → worked example → common mistake → practice question  
* Detect when a student is repeatedly stuck on the same concept and escalate the explanation style  
* Run every explanation through Enkrypt AI — no factually wrong solutions, no misleading steps in a math proof, no incorrect science claims  
* Generate a personalized weak-area report after every 5 sessions

**Deliverables**

* Working learning agent system  
* GitHub repository with README  
* Architecture diagram  
* Demo showing adaptive doubt-solving across 3 simulated student sessions  
* Learning analysis document

### **5\. Incident Response & Post-Mortem Agent**

**Why This Problem Exists**

Every engineering team running production systems dreads the 3am alert. The average time to detect and resolve a production incident costs companies between $10,000 and $100,000 per hour. Junior engineers on call don't have the institutional knowledge to root-cause fast. Post-mortems get written poorly or not at all. The same incidents repeat.

**Objective**

Build an AI incident response agent that ingests live or simulated log streams, detects anomalies, retrieves similar historical incidents, proposes a root cause and resolution runbook, executes safe remediation steps, and auto-drafts a post-mortem — so the on-call engineer spends their time deciding, not digging.

**Expected System Capabilities**

* Ingest log streams or structured incident data (JSON/CSV) in real time or batch  
* Embed historical incidents, runbooks, and resolutions into Qdrant — the agent's institutional memory  
* Orchestrate the full incident lifecycle via Mastra: detect → retrieve similar → hypothesize root cause → propose runbook → execute → post-mortem  
* Support human-in-the-loop: agent proposes each remediation step and waits for engineer approval before proceeding using Mastra's suspend/resume  
* Retrieve the 3 most semantically similar past incidents from Qdrant and surface their resolution time and what worked  
* Auto-generate a structured post-mortem: timeline, root cause, impact, what worked, what didn't, action items  
* Run every proposed remediation action through Enkrypt AI — no hallucinated commands, no suggested fixes that could cascade into a larger outage

**Deliverables**

* Working incident response agent  
* GitHub repository with README  
* Architecture diagram  
* Demo showing log ingestion → root cause → human-approved runbook → post-mortem workflow

### **6\. AI Meeting Intelligence & Action Command Center**

#### **Why This Problem Exists**

Organizations spend thousands of hours every month in meetings, yet a large percentage of action items never get completed. Decisions get buried in recordings, responsibilities become unclear, deadlines are forgotten, and teams spend significant time manually tracking follow-ups across chats, emails, and spreadsheets. The result is poor accountability, missed deadlines, and reduced execution velocity.

#### **Objective**

Build an AI Meeting Intelligence Agent that ingests meeting recordings or transcripts, automatically identifies decisions, extracts action items, assigns owners, tracks progress, and creates a dashboard that transforms conversations into measurable execution.

#### **Expected System Capabilities**

* Ingest meeting recordings, transcripts, or notes in audio, video, or text format  
* Extract decisions, action items, deadlines, priorities, and assignees automatically  
* Store meeting history, tasks, and organizational context in Qdrant for long-term memory and retrieval  
* Orchestrate the workflow via Mastra: transcribe → summarize → extract tasks → assign owners → track progress → generate follow-ups  
* Provide a Dashboard where users can update task status (To Do, In Progress, In Review, Completed)  
* Retrieve unresolved action items from previous meetings and surface execution risks  
* Generate meeting summaries, follow-up recommendations, and project status reports  
* Run all outputs through Enkrypt AI to prevent incorrect task assignments, hallucinated action items, or unreliable summaries

#### **Deliverables**

* Working meeting intelligence agent  
* GitHub repository with README  
* Architecture diagram  
* Demo showing meeting ingestion → task extraction → command center workflow

### **7\. Open Innovation Challenge — Build Your Own Agent**

**Problem Statement**

Design and build an innovative AI agent solution using Mastra \+ Qdrant \+ Enkrypt AI to solve a real-world problem across any domain.

**Possible domains include:**

* Education  
* Finance  
* Legal & Compliance  
* Healthcare  
* Productivity & Workflows  
* Developer Tooling  
* Personal Knowledge Systems  
* Autonomous Business Operations  
* Government & Public Services  
* Research & Intelligence

**Example Inspiration Ideas**

* Voice-based vernacular language tutor  
* Supply chain disruption predictor  
* Startup idea validator with market research  
* Smart journaling assistant with mood tracking  
* Interview preparation coach with feedback memory  
* Government scheme eligibility advisor for rural India  
* Multilingual customer support agent with escalation logic

**Mandatory Requirements**

Your solution must:

* Use Mastra for agent orchestration, workflows, or memory routing  
* Use Qdrant for vector memory, semantic retrieval, or RAG  
* Use Enkrypt AI for safety evaluation, hallucination detection, or output guardrails

**Deliverables**

* Unique working agent prototype  
* GitHub repository with README  
* Architecture diagram  
* Demo video  
* Problem statement and solution explanation document

## **Common Judging Criteria**

| Criteria | Weightage |
| ----- | :---- |
| Mastra Integration Depth (workflows · memory · scorers · MCP) | 25% |
| Qdrant Integration Quality (semantic memory · filtering · recall) | 20% |
| Enkrypt AI Coverage (safety · hallucination · bias · guardrails) | 20% |
| Agent Output Quality (relevancy · completeness · tone · memory) | 20% |
| Problem Impact & Novelty (clarity · originality · production readiness) | 15% |

## **What We're Looking For**

We are not just looking for AI demos. We are looking for:

* Autonomous agent systems that replace multi-step human workflows  
* Mastra-orchestrated pipelines with real branching logic and memory  
* Qdrant-powered retrieval that makes agents genuinely context-aware  
* Enkrypt AI integration that makes every output trustworthy and safe  
* Real-world problems solved at a depth that a business would actually pay for  
* Builders who think beyond isolated prompts and ship interconnected agent ecosystems

This is the era of AI-native systems. Build something that feels like the future.

## **Hard Disqualification Rule**

Any submission missing **Mastra**, **Qdrant**, or **Enkrypt AI** is automatically disqualified before a single point is awarded. This applies to both Round 1 and the Final Round. No exceptions.