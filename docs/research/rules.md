# Codegeist 2026: Rules & Judging research

Retrieved 2026-11-19 by fetching the live Devpost pages (curl) and selected developer.atlassian.com pages. Unless a line is marked INFERRED or UNCERTAIN, it is VERIFIED: it was read on the cited official page that day. Rule text is quoted exactly where it constrains you.

---

## Key facts

| Item | Value | Source |
|---|---|---|
| Submission deadline | **Tue Dec 22, 2026, 12:00 pm Pacific = 3:00 pm EST** | [rules](https://codegeist2026.devpost.com/rules) section 1, [overview](https://codegeist2026.devpost.com/) |
| Submission period start | Tue Oct 27, 2026, 9:00 am PT (the schedule page says 9:15am PDT) | [rules](https://codegeist2026.devpost.com/rules), [dates](https://codegeist2026.devpost.com/details/dates) |
| Judging period | **Tue Jan 5, 2027, 1:00 pm PT – Wed Feb 3, 2027, 5:00 pm PT** | rules section 1 |
| Winners announced | "On or around Monday, February 15, 2027 (9:00 am Pacific Time)" | rules section 1 |
| Eligibility | Age of majority where you live; individuals, teams or organizations; **solo entry is allowed** | rules section 3 |
| Excluded locations | Brazil, Quebec, Russia, Belarus, Crimea, Cuba, Iran, North Korea, Syria, Sudan, Myanmar, plus other OFAC-designated places | rules section 3, overview |
| Platform | Must be a Forge app that integrates with at least one of Jira, Confluence, JSM, Bitbucket, Teamwork Graph or Rovo | rules section 4 |
| Categories | Software Teams / Business Teams / **Specialized Industries (automotive is named)** | rules section 4 |
| Video | Under 5 minutes, **public on YouTube** | rules section 4 |
| Judge access | **Installation link** (Forge distribution "Sharing") plus full setup instructions | rules section 4 |
| Prize stacking | "The same Submission can win up to one Grand Prize and one Bonus Prize." | rules section 8 |
| Grand prizes | 1st, 2nd and 3rd **per category** (3 categories, so 9 grand prizes): $15k / $8k / $5k | rules section 8 |
| Bonus prizes | 4 bonus types × **6 winners each** × $1,500 | rules section 8 |
| Swag | First 300 Entrants with an Eligible Submission, up to 4 per submission, 1 per person | rules section 8 |
| Edits | Drafts can be changed until the deadline. **No changes after the Submission Period ends** | rules section 5 |
| Judges' sites | Devpost manager says judges' sites **will have Rovo, the Teamwork Graph API and Forge LLMs** | [forum post](https://codegeist2026.devpost.com/forum_topics/45901-will-judges-test-environments-have-rovo-enabled) |
| Forge LLMs | Optional. No credits are provided | overview |
| Registered participants | 4,368 (as of 2026-11-19) | overview |

---

## Details

### 1. Dates (rules section 1, VERIFIED)
- Registration and Submission Periods: "Tuesday, October 27, 2026 (9:00 am Pacific Time) – Tuesday, December 22, 2026 (12:00 pm Pacific Time)".
- Judging Period: "Tuesday, January 5, 2027 (1:00 pm Pacific Time) – Wednesday, February 3, 2027 (5:00 pm Pacific Time)".
- Winners: "On or around Monday, February 15, 2027 (9:00 am Pacific Time)."
- The schedule page ([/details/dates](https://codegeist2026.devpost.com/details/dates)) lists Submissions as "October 27 at 9:15am PDT" to "December 22 at 12:00pm PST". Its Judging row is **blank**. Winners Announced: "February 15 at 9:00am PST".
- Build Session: Tue Nov 17, 2026, 12:00 pm ET. It has already happened, and the recording is at https://youtu.be/6h-utBbScWE ([updates](https://codegeist2026.devpost.com/updates)).

### 2. Eligibility (rules section 3, VERIFIED)
- Open to "Individuals who are at least the age of majority where they reside as of the time of entry", to Teams of such individuals, and to existing Organizations.
- One person may be on several teams and may also enter individually.
- Excluded: residents of the countries listed above; anyone on US denied-party lists; employees, agents and immediate family or household members of Atlassian, Devpost and anyone else involved in running the hackathon; Judges and their employers; affiliates of those entities; and "Any other individual or organization whose participation ... would create ... a real or apparent conflict of interest".
- "Financial or Preferential Support" (section 4): "A Project must not have been developed, or derived from a Project developed, with financial or preferential support from the Sponsor or Administrator ... funding or investment ..., were developed under contract, or received a commercial license, from the Sponsor or Administrator".
- INFERRED: a solo developer whose employer has no Atlassian or Devpost relationship is eligible. The developer must confirm that their country of residence is not excluded and that their employer does not employ a Codegeist judge.

### 3. What to build (rules section 4, VERIFIED)
> "Entrants must build an app using Atlassian's Forge platform and integrate with at least one Atlassian product or platform capability (Jira, Confluence, Jira Service Management, Bitbucket, Teamwork Graph, Rovo) ... in one of the following categories"

- **Apps for Software Teams**: "Think smarter code reviews, deployment awareness, issue triage that actually understands what matters."
- **Apps for Business Teams**: "marketing, sales, HR, finance, support, or legal".
- **Apps for Specialized Industries**: "Give experts in healthcare, finance, manufacturing, automotive, or other fields the context to do their best work. Turn insider knowledge into solutions built for your world."
- "The Sponsor and Administrator reserve the right to reassign an Project from one Category or Bonus Prize to another if applicable."
- Platforms: "A submitted Project must run on Atlassian Forge as specified in the Submission Requirements."
- Third-party: "If a Project integrates any third-party SDK, APIs and/or data, Entrant must be authorized to use them in accordance with any terms and conditions or licensing requirements of the tool."
- Developer tools are governed by the Atlassian developer terms: https://developer.atlassian.com/platform/marketplace/atlassian-developer-terms/

### 4. New vs existing code (rules section 4, VERIFIED)
> "Projects must be either newly created by the Entrant, not yet published prior to The Hackathon Submission Period, or, if the Project existed prior to the Hackathon Submission Period, must have been updated or rebuilt in the Forge platform after the start of the Hackathon Submission Period and must have a Forge manifest file and include at least one Forge module."

- The update post repeats this: "Building on an existing app? It needs to be updated or rebuilt on Forge during the submission period." ([update](https://codegeist2026.devpost.com/updates/47688-build-live-with-atlassian-on-nov-17-plus-how-to-plan-your-project))
- Open source (section 4, IP): "An Entrant may submit a Submission that includes the use of open source software or hardware, provided the Entrant complies with applicable open source licenses and, as part of the Submission, creates software that enhances and builds upon the features and functionality included in the underlying open source product."
- Outside help: "An Entrant may contract with a third party for technical assistance to create the Submission provided the Submission components are solely the Entrant's work product and the result of the Entrant's ideas and creativity, and the Entrant owns all rights to them."
- INFERRED: the developer's own pre-existing libraries (for example CV or Python code) can be reused if the Forge app is built during the period and the developer owns the code. Anything owned by a current or former employer (for example ADAS IP) is **not allowed**, because the Submission must be "solely owned by you ... with no other person or entity having any right or interest in it".

### 5. Submission requirements (rules section 4, VERIFIED)
1. A Project built with the required tools that meets the Project Requirements.
2. **Video**: "should be less than five (5) minutes. Judges are not required to watch beyond five minutes"; "should include footage that shows the Project functioning on the device for which it was built"; "must be uploaded to and made publicly visible on YouTube, and a link to the video must be provided"; "must not include third party trademarks, or copyrighted music or other material unless the Entrant has permission". The overview adds that the video should demonstrate "any relevant bonus prize specifics".
3. "Be the original work of the Entrant, be solely owned by the Entrant, and not violate the IP rights of any other person or entity."
4. **Installation link**: "Provide access to an installation link for the judges and review team to test your application." Instructions: https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app
5. "Include all necessary instructions to get the app working properly in a judges environment. Detailed instructions must be provided for all configuration steps that must be taken, and any integrations that must be installed and configured."
6. A text description of features and functionality.
7. "Explain how your project meets the main technology requirement."
8. "Select the Category and Bonus Prizes the Project is submitted into. Provide any applicable write-up associated with the Bonus Prize selected."
- Functionality: "The Project must be capable of being successfully installed in a judge's test environment via an installation link, it must run consistently on the platform for which it is intended, and it must function as depicted in the video and/or expressed in the text description."
- Testing: "Access must be provided to an Entrant's working Project for judging and testing by providing an installation link".
- Language: English, or English translations of every material.
- **Open-source repo requirement: NOT FOUND.** Neither the rules nor the overview requires a public repository or an open-source license. The only open-source mention is the optional "open-source skill.md files" in the MCP bonus. Whether the Devpost form asks for a repo URL is unknown (see Uncertainties).
- **Test credentials: not explicitly required.** Judges install the app on their own sites. The forum manager advises listing what the app needs, for example "Requires Atlassian Cloud site with Rovo enabled", plus any setup steps. INFERRED: if the app needs an external API key, the setup instructions must explain how judges get or configure one, so design the app to need none.

### 6. Installation link mechanics (developer.atlassian.com, page "Last updated Oct 30, 2026", VERIFIED)
Source: https://developer.atlassian.com/platform/forge/distribute-your-apps/
- Steps: deploy to the **production** environment, then open Developer console > app > Distribution > Edit. Choose "Sharing" (anyone with the link) or "Sharing within organization". Select the Atlassian apps it installs on, then copy the link.
- "if you select both Jira and Confluence, your user can only install it on sites running both Jira and Confluence."
- The installer "must be the admin of that site".
- **Conflict with the Marketplace bonus**: "Apps that already have a license in the app manifest or have been submitted for listing on Marketplace can't be shared via installation link; in order to share and test these apps, you'll need to copy the app's code, create a new, unlicensed version of the app, and share this version via installation link." The [Listing Forge apps](https://developer.atlassian.com/platform/marketplace/listing-forge-apps/) page (Last updated Aug 26, 2026) says the same, with an exception for Bitbucket apps. It also says: "Once your Forge app is submitted, we aim to provide a decision within one week."
- INFERRED: "Sharing" is the correct option for judges, because they sit outside your organization.

### 7. Judging (rules section 6, VERIFIED)
- Stage One, pass/fail: "whether the ideas meet a baseline level of viability, in that the Project reasonably fits the theme and reasonably applies the required APIs/SDKs featured in the Hackathon."
- Stage Two uses five equally weighted criteria, 20% each per the overview:
  - **Technological Implementation**: "Does the app feel like a genuine, working, non-trivial implementation when tested, not just a shallow wrapper or a single hardcoded demo path?"
  - **Design**: "Does the project deliver a complete, coherent product experience — not just a technical proof of concept?"
  - **Potential Impact**: "Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?"
  - **Innovation/Idea**: "How creative and novel is the concept and does the project differ from existing concepts?"
  - **Presentation**: "Does the video clearly demonstrate the project working end-to-end? Does the pitch communicate what problem is solved, who it's for, and why it matters? Is the overall presentation easy to follow?"
- Tie-break: scores are compared criterion by criterion in the listed order, so **Technological Implementation is the first tie-breaker**. If the tie remains, the judges vote.
- Judges "may be employees of the Sponsor or third parties"; there may be multiple rounds and panels.
- "The Entrant(s) that are eligible for a Prize, and whose Submissions earn the highest overall scores based on the applicable Judging Criteria, will become potential winners of that Prize."
- INFERRED: the same five criteria appear to score both grand and bonus prizes ("applicable Judging Criteria"). No separate bonus rubric was found.

### 8. Prizes and how they are awarded (rules section 8, VERIFIED)
- **Grand Prizes are awarded per Category**:
  - First Place: $15,000 USD, 2 tickets to Team 2027 (AMER) "for first-place winners (travel not included)", recognition on Atlassian's blog, and signed limited-edition Atlassian Williams Racing swag. Qty "3 (1 per Category)".
  - Second Place: $8,000 USD plus the "Opportunity to be featured" on the blog. Qty 3 (1 per Category).
  - Third Place: $5,000 USD plus the same. Qty 3 (1 per Category).
- There is **no overall winner across categories**. Each category has its own 1st, 2nd and 3rd.
- Bonus Prizes: $1,500 USD each, **6 winners per bonus**:
  - **Best Agents (Rovo/Assignable agents)**: "All Eligible Submissions that's a Forge app including the rovo:agent module, the rovo:agentConnector module, or apps with reusable rovo:skill and rovo:action modules that other agents can invoke as tools." The prize table words it "uses the rovo:agent module, the rovo:agentConnector module, or apps with reusable rovo:skill rovo:action that other agents can invoke as tools".
  - **Best app with Atlassian MCP**: "All Eligible Submissions that's a Forge app that exposes tools via the Atlassian MCP server using the rovo:mcp module. These can also be combined with open-source skill.md files which users can add to their third party agents." The overview words it more loosely: "projects that use a Forge app exposing an MCP server". The resources page says "Rovo MCP server".
  - **Best apps with Teamwork Graph integration**: "All Eligible Submissions that connects data into the graph and/or consumes data from the Teamwork Graph API." The resources page links "connects data into the graph" to the [TWG connector guide](https://developer.atlassian.com/platform/teamwork-graph/build-a-teamwork-graph-connector/) and "consumes data" to [Call the TWG API](https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/).
  - **Best Marketplace published app**: "All Eligible Submissions that are published to the Marketplace or submitted for listing. Provide either the link to the listing or link to the Marketplace review ticket."
- **Stacking**: "The same Submission can win up to one Grand Prize and one Bonus Prize." The maximum per submission is therefore 1 grand plus 1 bonus, which is $16,500 at most.
- Entrants may make multiple submissions, but each "must be unique and substantially different" from the Entrant's other Submissions.
- **Participation Prize**: an Atlassian Developer Swag Pack, 300 available, "Awarded on a first-come, first-serve basis to Entrants of Eligible Submissions ... while supplies last (max 4 per Submission)". "The same Entrant can only win up to one Participation Prize no matter how many unique Submissions." "Participation Prizes are available to the first 300 Entrants who submit an Eligible Submission".
- Winners must pass verification: affidavits are due within 10 business days, and W-8BEN (non-US) or W-9 (US) forms may be needed. Prizes are paid within 60 days of receipt of the forms. Winners pay their own fees and taxes, and withholding may apply.
- "Sponsor will not award a prize if there are no eligible Submissions ... for a specific prize."

### 9. Editing submissions (rules section 5, VERIFIED)
> "Prior to the end of the Submission Period, you may save draft versions of your Submission on Devpost ... Once the Submission Period has ended, you may not make any changes or alterations to your Submission, but you may continue to update the Project in your Devpost portfolio."

- After the deadline, only changes the Sponsor and Devpost permit are allowed (infringing material, PII, inappropriate content), and the Submission "must remain substantively the same".
- INFERRED: on Devpost you can normally keep editing a submitted entry until the deadline. The rules say only "save draft versions", so this is not explicitly stated.

### 10. Keeping the app working through judging (INFERRED, not explicit)
- No rule says "the app must remain available until X". However, judges test during the **Judging Period (Jan 5 to Feb 3, 2027)**, and the app "must run consistently". The installation link must therefore keep working, and the Forge production deployment must stay live, until at least Feb 3, 2027, and ideally until winners are verified around mid-Feb 2027.
- RISK: the Resources page says the provisioned Codegeist dev site "is available for **90 days**". Only the judges' sites matter for judging, not yours. But if you provision around Nov 19, your own site expires around mid-Feb 2027. Keep demo assets elsewhere. INFERRED: the app itself lives in your developer account, not on the site.
- Do not push breaking deploys to production during Jan 5 to Feb 3. The video and description must keep matching the app's behavior.

### 11. Forge LLM / Rovo usage rules (overview, VERIFIED)
> "Using Forge LLMs is completely optional, and you do not need them to enter or win. Forge LLMs are not turned on by default when you install the Forge CLI, and you are only charged if your app's code calls the Forge LLM APIs. Codegeist does not provide credits for Forge LLM usage. Many AI-powered use cases can be built with Rovo instead."

- Judges' environments, per the Devpost manager Janet Fang on 2026-11-16 ("3 days ago"): "judges reviewing Rovo entries will have test sites with Rovo enabled. Atlassian has also confirmed that judges' sites will have Rovo, the Teamwork Graph API and Forge LLMs available. In your testing instructions, list what the app needs (for example, "Requires Atlassian Cloud site with Rovo enabled") and any setup steps." Note that this is a forum reply, not a rules amendment. The Official Rules prevail where they conflict.
- The rovo:mcp docs (Last updated Oct 29, 2026) carry this condition: "When you use Rovo APIs, you must comply with the Atlassian Acceptable Use Policy ... Atlassian performs safety screening on Agents at our sole discretion" ([rovo:mcp](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)).
- Status labels found: Rovo MCP is "(Preview)", and only one `rovo:mcp` module is allowed per app. The Teamwork Graph API is in "Preview" (page dated Feb 11, 2026). For new apps it says: "Raw cypherQuery is unavailable to new apps", so use curated queries or persisted Cypher queries.
- Dev site from the resources page: `forge site provision` creates a free site "with Jira, Confluence, Jira Service Management, Rovo Enterprise, Studio, and seeded demo data", available for 90 days, with one active site at a time. Install with `forge install --demo-site`. Requires Node.js 20 or later.

### 12. "Runs on Atlassian"
- **Not a hackathon requirement.** It does not appear in the rules, overview or resources (searched 2026-11-19). It is a Marketplace badge "automatically applied to eligible apps on the Atlassian Marketplace" ([Runs on Atlassian](https://developer.atlassian.com/platform/forge/runs-on-atlassian/), Last updated Aug 24, 2026).
- INFERRED: it may help the Design, Impact or Marketplace story, because it means no egress to external hosts. It is not scored explicitly.

### 13. IP and publicity (rules section 7 and section 10, VERIFIED)
- "All Submissions remain the intellectual property of the individuals or organizations that developed them." Atlassian gets "a fully paid, non-exclusive license to use such Submission for judging".
- Atlassian and Devpost may promote the Submission and use entrants' "name, likeness, voice and image" for 3 years after the hackathon.
- Entrants warrant that the content contains no third-party IP without permission and no malware.

### 14. Other pages
- Project gallery: "The hackathon managers haven't published this gallery yet" ([gallery](https://codegeist2026.devpost.com/project-gallery)).
- Discussions ([forum_topics](https://codegeist2026.devpost.com/forum_topics)): one topic, the Rovo question above. The URL /discussions returns 404, and the real path is /forum_topics.
- Updates: two posts, the Nov 12 and Nov 16 Build Session announcements. No rule changes announced.
- FAQ page: not found. No FAQ link exists in the site navigation.
- Help channel: Atlassian Developer Community with the tag `codegeist-2026` (https://community.developer.atlassian.com/).

---

## Uncertainties / open questions
1. **Exact Devpost submission form fields** (for example whether a repo URL, a "built with" list or a bonus write-up box is required). Viewing the form needs a login. NOT FOUND. ACTION: open "Enter a Submission" early and check.
2. **MCP bonus wording varies by page.** The rules say "Atlassian MCP server using the rovo:mcp module", the overview says "a Forge app exposing an MCP server", and the resources page says "Rovo MCP server". The Official Rules prevail (rules section 11), so use `rovo:mcp`.
3. **Marketplace bonus and installation link.** A listed or submitted app cannot be shared by installation link, so you would need a separate unlicensed copy for judges. Unclear whether judges accept that the two apps differ. Unclear whether "submitted for listing" counts if review is still pending or ends in rejection. The rules say "submitted for listing" qualifies.
4. **Which judging criteria apply to bonus prizes.** No separate bonus rubric was found.
5. **Whether one submission is considered for several bonuses.** You can select several, but only one bonus can be won. Whether choosing many dilutes the entry is unknown.
6. **Judging row on the schedule page is empty.** The Official Rules give the judging dates.
7. **How long the app must stay working** is not stated. Assume through Feb 15, 2027.
8. **Forum statement on judges' sites** (Rovo, TWG API and Forge LLMs available) is an informal manager reply, not a rules text.
9. **Judge sites' product mix.** If the app needs both Jira and Confluence, the installer site must have both. Unknown whether every judge site has all products. INFERRED: likely, given the dev-site template, but not confirmed.
10. **Swag eligibility timing.** "First 300 Entrants who submit an Eligible Submission". Unclear whether the order is by submit time or determined after eligibility review. With 4,368 registrants, an early valid submission is the safer choice.
11. The Teamwork Graph API page shows "Last updated Feb 11, 2026", which is older than the other pages. The connector guide is dated Sep 18, 2026. Recheck the TWG Preview status and limitations before relying on them.

---

## Implications for idea selection
- **The Specialized Industries category explicitly names "automotive"** and asks experts to "Turn insider knowledge into solutions built for your world". This fits the developer's ADAS background. Prizes are per category, so they compete only against that category's entries. INFERRED: probably fewer entries than Software Teams.
- **Plan for one grand prize plus one bonus.** Building for several bonuses adds Stage One safety and lets Atlassian reassign the entry, but only one bonus can pay out. Choose one primary bonus and build it deeply. Rovo agent, rovo:mcp and TWG are all Forge-native and verifiable on judges' sites.
- **Be careful with the Marketplace bonus.** It needs a listing submission (about one week for review) and a duplicate unlicensed app for the installation link. That is extra overhead for a solo developer.
- **Avoid external API keys and services.** Judges must install from a link and follow written instructions. Every configuration step adds failure risk, and Stage One is pass/fail. Prefer Forge storage, Rovo and Forge LLMs (available on judges' sites per the forum), and bundled seed data that a single admin action creates.
- **Technological Implementation is the first tie-breaker** and explicitly penalizes "a single hardcoded demo path". The app must work on the judge's own site data, not only on the dev site's seeded data.
- **The video drives Presentation.** Keep it under 5 minutes, public on YouTube, with no copyrighted music. Show "bonus prize specifics" on screen.
- **Original, solely owned code only.** Do not reuse employer ADAS code, datasets or proprietary standards text. Public standards (for example ISO 26262 or ASPICE concepts) are fine to reference, but do not include copyrighted text without permission (INFERRED).
- **Freeze production during Jan 5 to Feb 3, 2027.** Submit early (target Dec 20) so the swag order and any form issues can be handled.

---

## ACTION ITEMS
1. **Join the hackathon on Devpost** (the "Join hackathon" button): https://codegeist2026.devpost.com/
2. **Create an Atlassian API token** at https://id.atlassian.com/manage/api-tokens, then run `npm i -g @forge/cli`, `forge login` and `forge site provision` (free dev site, 90 days). Guide: https://codegeist2026.devpost.com/resources and https://developer.atlassian.com/platform/forge/getting-started/
3. **Check eligibility**: confirm your country of residence is not excluded and your employer has no conflict (rules section 3).
4. Watch the Build Session recording: https://youtu.be/6h-utBbScWE
5. Open the "Enter a Submission" form early to see the required fields. Save a draft.
6. Before submitting, **enable "Sharing"** in the Developer console and test the installation link on a second, clean site: https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app
7. If you go for the Marketplace bonus, start the listing early (review takes about one week) and keep a separate unlicensed copy for the judges' link: https://developer.atlassian.com/platform/marketplace/listing-forge-apps/
8. Ask rule-ambiguity questions in writing (rules section 11 requires a written request): https://codegeist2026.devpost.com/forum_topics or the community tag `codegeist-2026`.

---

## Sources (all accessed 2026-11-19)
- Official Rules: https://codegeist2026.devpost.com/rules
- Overview: https://codegeist2026.devpost.com/
- Resources: https://codegeist2026.devpost.com/resources
- Schedule: https://codegeist2026.devpost.com/details/dates
- Updates: https://codegeist2026.devpost.com/updates and https://codegeist2026.devpost.com/updates/47688-build-live-with-atlassian-on-nov-17-plus-how-to-plan-your-project
- Discussions: https://codegeist2026.devpost.com/forum_topics and https://codegeist2026.devpost.com/forum_topics/45901-will-judges-test-environments-have-rovo-enabled
- Project gallery: https://codegeist2026.devpost.com/project-gallery (unpublished)
- Distribute your apps (Last updated Oct 30, 2026): https://developer.atlassian.com/platform/forge/distribute-your-apps/
- Listing Forge apps (Last updated Aug 26, 2026): https://developer.atlassian.com/platform/marketplace/listing-forge-apps/
- rovo:mcp module (Last updated Oct 29, 2026): https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/
- Call the Teamwork Graph API (Last updated Feb 11, 2026): https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/
- Build a Teamwork Graph connector (Last updated Sep 18, 2026): https://developer.atlassian.com/platform/teamwork-graph/build-a-teamwork-graph-connector/
- Runs on Atlassian (Last updated Aug 24, 2026): https://developer.atlassian.com/platform/forge/runs-on-atlassian/
- Atlassian developer terms (referenced, not read in full): https://developer.atlassian.com/platform/marketplace/atlassian-developer-terms/
