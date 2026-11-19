# Marketplace path for Codegeist 2026 ("Best Marketplace published app" bonus)

Research date: 2026-11-19. Pages were fetched live with curl from developer.atlassian.com, codegeist2026.devpost.com and marketplace.atlassian.com. Each page's "Last updated" date is given in brackets. community.developer.atlassian.com was **blocked** in this session, so community evidence below comes only from search-result snippets and is marked UNVERIFIED.

Legend: **[V]** = VERIFIED, read on an official page. **[I]** = INFERRED or UNCERTAIN.

---

## 1. Key facts

1. **[V] What the bonus needs.** The prize is "6 Best Marketplace published app: $1500 to 6 projects that must be published to the Marketplace or submitted for listing. Provide either the link to the listing or link to the Marketplace review ticket." The Rules say the same. **Approval is not required. A review-ticket link is enough.** (codegeist2026.devpost.com overview + /rules + /resources)
2. **[V] One bonus per project.** "The same Submission can win up to one Grand Prize and one Bonus Prize." (Rules). This means the Marketplace bonus competes with the Rovo, MCP and TWG bonuses for the same project.
3. **[V] Deadline.** Dec 22, 2026 12:00pm PT (3:00pm ET). Judging runs Jan 5 to Feb 3, 2027. (Rules)
4. **[V] Conflict between the judges' link and a Marketplace submission.** Devpost requires an **installation link** for judges, created via developer-console sharing (Rules). Atlassian docs say: "Apps that already have a license in the app manifest **or have been submitted for listing on Marketplace can't be shared via installation link**; in order to share and test these apps, you'll need to copy the app's code, create a new, unlicensed version of the app, and share this version via installation link." (distribute-your-apps [Oct 30 2026]; listing-forge-apps [Aug 26 2026]). **So you need two Forge app IDs:**
   - one app, kept shared via link, for the judges
   - one copy that you submit to Marketplace
5. **[V] How listing works for Forge now (Developer Space flow).**
   - Enable sharing for the app.
   - Publish your Developer Space to Marketplace. This creates the partner (vendor) profile and makes you Marketplace admin.
   - Create the listing and pick the Forge app from a dropdown. The dropdown only shows apps that are in that published Developer Space, deployed to **production**, and set to **Sharing**.
   (listing-forge-apps; publish-developer-space [Jan 6 2026])
6. **[V] Prerequisites for publishing a Developer Space:**
   - you are the space admin
   - "the space has a billing account setup, and you've provided billing consent"
   - the space name is complete and unique
   - you accept the Marketplace Partner Agreement

   A published space **cannot be unpublished**, and its name plus your email contact become public. (publish-developer-space)
7. **[V] Review timelines. Official pages disagree:**
   - "we aim to provide a decision within one week" (listing-forge-apps [Aug 26 2026])
   - "usually takes 5-10 business days for our team to start a review" (creating-a-marketplace-listing [Apr 9 2026])
   - "Approvals take 10-15 business days" (app-approval-guidelines [May 15 2026])
   - new apps 5-10 business days, partner verification 2-3 business days (app-approval-security-workflow [Jul 24 2025])
   - Only Platinum, Gold and Silver partners get expedited SLAs. **No page says free apps are reviewed faster** (searched approval guidelines, listing pages and FAQ).
8. **[V] Ticket creation.** The submission is tracked as an **ECOHELP** ticket in the "Developer and Marketplace Support" Jira project (ecosystem.atlassian.net). The vulnerability scan runs "when you submit your app for approval" and findings are reported "on the ECOHELP ticket". **[I]** This implies the ticket is created right after submission, not when a reviewer picks it up. UNVERIFIED search snippets of 2026 community posts agree: one says a ticket was created the day after submission (Sep 16 to Sep 17, 2026). They also show **many submitters could not open their ECOHELP ticket** ("Forbidden/No access", the password-reset link returns 404).
9. **[V] A one-time Partner Verification (KYC/KYB) is required for a new app.**
   - It runs as a separate ticket. You fill an Identity Information Collection form and the Partner Security Questionnaire **within 14 days**, otherwise the ticket is rejected.
   - You then do a Stripe Identity check: photo ID, a selfie and a phone with a camera.
   - Business details are also asked for.
   - Expected time: 2-3 business days.
   (partner-due-diligence [Apr 21 2026]; security workflow)
10. **[V] Automatic vulnerability scan at submission.** Critical or certain high findings **reject the ECOHELP ticket**. You must fix and resubmit, which **creates a new ECOHELP ticket**. (security workflow)
11. **[V] Rovo, MCP and TWG apps can be listed, and Preview features are OK.**
    - The security requirements contain an "AI Security" section written specifically for apps using Forge Rovo actions and agents (security-requirements [Feb 19 2026]).
    - Preview features "can be enabled on production environments". EAP features "can only be enabled on development environments" and are "not supported or recommended for production use" (whats-coming [Aug 28 2026]).
    - In Preview now: `rovo:mcp` [Oct 29 2026], `rovo:skill` [Oct 29 2026] ("you can deploy apps that use rovo:skill to development, staging, and production"), the Teamwork Graph API [Feb 11 2026] and Containers.
    - The Forge LLMs page says admins "will be informed (via Marketplace listing and during installation) when an app uses Forge LLMs" [Jul 23 2026], so LLM apps are expected on Marketplace.
    - **[I]** No page found bans Rovo, MCP, TWG or Forge LLM modules in Marketplace apps. EAP-only features would effectively block a listing, because Marketplace needs a production deploy.
    - Marketplace search finds live apps that market Rovo agents, MCP and "Connector for Rovo Teamwork Graph" (marketplace REST search, 2026-11-19). I did not check which Forge modules those apps actually use.
12. **[V] Runs on Atlassian (RoA) badge.** It is applied automatically, with no application step. To qualify, the app must:
    - use only Atlassian-hosted compute and storage
    - support data residency
    - have no egress except analytics that carries no in-scope End-User Data

    You can check eligibility with the Forge CLI (`forge eligibility`, see cli-reference/eligibility). (runs-on-atlassian [Aug 24 2026])

---

## 2. Details

### 2.1 Step-by-step listing flow for a free Forge app [V unless marked]

| # | Step | Source |
|---|---|---|
| 1 | Have an Atlassian account and a Developer Space. Turn on 2-step verification (2SV, the onboarding hub lists "Enable 2-step verification"). Register at least one contact with the Atlassian Developer Community (approval criterion). | onboarding-hub/plan/register… [May 19 2026]; app-approval-guidelines |
| 2 | Set up a billing account and give billing consent on the Developer Space. The billing page says usage within the free threshold costs $0. A payment method is needed "to be charged for Forge usage above the free threshold". **[I]** Whether billing consent requires entering a card is not stated explicitly. | publish-developer-space; billing-for-developer-spaces [Aug 25 2026] |
| 3 | Deploy to production with `forge deploy -e production`. In developer console, go to Distribution, then Sharing. | publish-developer-space troubleshooting table; distribute-your-apps |
| 4 | Developer Console, Space, Settings, "Make public on Marketplace", Review & publish, accept the Partner Agreement. This creates the vendor profile automatically. Older alternative: marketplace.atlassian.com, Manage vendor account, Create vendor. An individual can use their own name ("Joe Bloggs"). **[I]** For Forge apps use the Developer Space flow, because the vendor must be the same Developer Space that owns the app. | publish-developer-space; become-a-partner [Aug 24 2026]; creating-a-marketplace-listing |
| 5 | Create the listing at https://marketplace.atlassian.com/manage/apps/create. Choose the vendor (your published space) and the Forge app. | creating-a-marketplace-listing; publish-developer-space |
| 6 | Fill in the metadata, assets, links (privacy policy, EULA/terms, documentation, support), the Privacy & Security tab and the scope justifications. Accept the Partner Agreement and submit. | onboarding-hub/launch/create-your-marketplace-listing… [May 19 2026] |
| 7 | When you submit, you are asked for "the API scope permissions that your app requires, and why each scope is necessary" and "the remote hostnames or IP addresses that your Forge app sends requests to (if any), what data is sent to these hosts, and why". | listing-forge-apps |
| 8 | An ECOHELP ticket is created and the vulnerability scan runs. A separate Partner Verification ticket follows (one time). Security questionnaires are added to the ticket. | security workflow; partner-due-diligence |
| 9 | The listing is **locked while it is pending review**. Changes go through the approval ticket and a reviewer makes them for you. | knowledge-base/i-cant-edit-my-listing… [Sep 3 2019, old] |
| 10 | Reviewers test on clean sites, check function, security, performance, support info and branding. A few rounds of review are "common". | creating-a-marketplace-listing; approval guidelines; onboarding-hub submit-for-review |

### 2.2 Listing asset and text specs [V, from a page dated Jun 5 2020, so treat as possibly stale]
Source: building-your-presence-on-marketplace.
- App name: 60 characters or fewer, Title Case. Do not start with an Atlassian product name: "App X for Jira" is OK, "Jira App X" is rejected. Infringing trademarks means automatic rejection (approval guidelines).
- Tagline: 130 characters or fewer. Summary (legacy): 250 characters or fewer. Long description: 1000 characters or fewer.
- App logo: 144x144 PNG/JPG. The icon is generated from it. No Atlassian logos.
- Banner: 1120x548 (or 560x274) PNG/JPG.
- **3 highlights are required.** Each has:
  - a title (50 characters or fewer)
  - a summary (220 characters or fewer)
  - a screenshot, 1840x900 (or 920x450)
  - a cropped screenshot, 580x330
  - a caption (220 characters or fewer)
- Up to 5 more screenshots per highlight.
- Optional YouTube video. 30 seconds or less is suggested.
- Release summary: 80 characters or fewer, required.
- Documentation URL: "Required for paid via Atlassian apps; optional for others". But the approval criteria (May 2026) say the listing **should reference documentation**. Provide it.
- Partner support: optional for free listings (2020 page). But the onboarding hub (May 2026) says "Marketplace requires a working support channel before listing" and recommends a generic support email. Provide one.
- Partner profile: name of 40 characters or fewer, description of 750 characters or fewer, logo 144x144.
- Approval criteria say marketing assets are "recommended but not required for free apps". The 2020 page says branding materials are required "whether your app is free or paid". **Treat them as required.**

### 2.3 Approval criteria for all apps, free or paid [V, app-approval-guidelines May 15 2026]
The app must:
- not break the host UI
- not degrade performance
- not infringe Atlassian trademarks
- perform as described
- provide marketing assets
- provide documentation
- have source public if it is open source
- contain no ads
- make it clear if a third-party account is needed ("If your app listing is free, ensure your app provides some useful function … 'as is'")

The partner must:
- accept the Partner Agreement
- meet the security workflow
- **create a privacy policy**
- use secure authentication (no Basic auth in public apps)
- have at least one contact registered in the Developer Community

The pre-requisites that "could delay the app review" are the Privacy & Security tab and ticket approval, the Partner verification ticket, and any pending vulnerability ticket. A company-domain email is required **only for paid-via-Atlassian apps**, so a free app avoids that.

### 2.4 Privacy, legal, EULA [V]
- If you store personal data you must comply with GDPR etc. Follow the Forge user-privacy guidelines (report and erase personal data). (listing-forge-apps)
- Customer terms: "To transact with customers in cloud, you'll need End User Terms". Atlassian offers a **standard customizable end-user agreement** (https://www.atlassian.com/licensing/marketplace/end-user-agreement-v1). You need a DPA if you are a GDPR data processor. (listing-forge-apps)
- **Privacy & Security tab:**
  - The security workflow page (Jul 2025) calls it mandatory for cloud app onboarding. The older FAQ on the security-privacy-tab page says "not mandatory". **Treat it as mandatory.**
  - Questions include: storing or processing End-User Data outside Atlassian, logging, third-party sharing (sub-processors), data residency, retention after uninstall, GDPR controller or processor, CCPA, DPA, EEA transfers, security contact email, CAIQ Lite (optional), PAT/credential use, **scope justification**, and an optional Trust Center link.
  - For a no-egress Forge app most answers are "No" or "App stores End-User Data exclusively within Atlassian…". (security-privacy-tab [Aug 24 2026])
  - The old "Security Self Assessment" program is being deprecated in favour of the P&S tab (same page).

### 2.5 Security requirements and questionnaire (Forge) [V]
Source: security-requirements [Feb 19 2026]; app-security-questionnaires [Jul 16 2025].
- Default to `asUser()`. Check permissions before `asApp()`.
- Least-privilege scopes.
- Secrets only in encrypted env vars or `storage.setSecret`.
- No PII in logs.
- Tenant isolation.
- Parameterized Forge SQL.
- No `child_process` or shell execution.
- **No dependencies with known critical or high vulns.**
- No EOL Node runtimes.
- Never collect Atlassian passwords or API tokens.
- At least one **security contact with an ecosystem.atlassian.net account**, so that person can see Atlassian Marketplace Security (AMS) tickets.
- **AI security:**
  - treat Rovo action inputs as untrusted (prompt injection)
  - set `actionVerb` accurately (read vs mutate)
  - agents that can perform admin-level actions must do their own permission checks, "as Rovo agents are accessible to all users"
- Questionnaire answers that **fail** (and block listing):
  - not validating the FIT on Forge Remote
  - not checking permissions before `asApp()`
  - no TLS 1.2+ on egress
  - not reviewing dependencies with automated tools
  - collecting Atlassian credentials
  - secrets in plain text
- Warnings only (do not block): wildcard egress (`*.com`), no `asUser`, no web-trigger auth, logging PII, weak input validation.

### 2.6 Data residency and RoA [V]
- Forge-hosted storage (KVS, Custom Entities, Forge SQL, Object Store) is data-residency enabled. The app gets **PINNED** status if all in-scope End-User Data stays in Forge storage, or if remote storage uses region-pinned URLs. (forge/data-residency [Sep 28 2026])
- RoA criteria are in Key fact 12. A Forge-LLM app "is badged as Runs on Atlassian" (forge-llms-api).
- Teamwork Graph API apps are "recommended" to be RoA, and egress controls on TWG data are planned. Installing TWG scopes needs an **org admin**. The TWG API works only for Jira/Confluence installs, and TWG connectors only for Jira. An app can't both call the TWG API and provide a connector. (teamwork-graph/limitations [Sep 18 2025]; teamwork-graph overview [Nov 19 2025])

### 2.7 Marketplace-relevant module notes [V]
- `rovo:agentConnector`: needs a remote A2A 1.0 server, which means egress, so **no RoA badge** [I]. Non-production apps may fail for users who are not contributors. (rovo-agent-connector [Oct 9 2026])
- Rovo agents: Atlassian "performs safety screening on Agents at our sole discretion" and may block deployment. (rovo-agent [Oct 2 2026])
- Adding Forge LLMs to an existing app triggers a **major version upgrade** that needs admin approval (forge-llms-api). Major versions also go back through full review with scans and questionnaires (security workflow). Cloud minor updates have "no security checks".
- **[I]** Decide early whether the Marketplace copy will use Forge LLM or new egress. Adding them after approval forces a major-version re-review.

### 2.8 Past-edition precedent (UNVERIFIED, search snippets only)
- Codegeist 2022's Marketplace bonus required a submitted ticket labelled `codegeist2022`. It did not require approval.
- 2026 community threads report: ECOHELP access problems, reviews "stuck for months", "over 2 weeks", rejections after 20 days. One reported fix was to ask support to update the ticket Reporter.
- Sources: community.developer.atlassian.com threads 98756, 99096, 100270, 102735, 97567 and the Codegeist 2022 bonus page via search. Not opened directly because the host was blocked.

---

## 3. Uncertainties and open questions

1. **When exactly the ECOHELP ticket is created** and whether the submitter can see it straight away. Inferred: right at submission. Community reports access failures. Test early so there is time to raise a support request.
2. **Whether billing consent requires a payment method.** Not stated explicitly. Plan for possibly adding a card. Cost stays $0 within the free threshold.
3. **What KYB asks of an individual with no company.** The due-diligence page asks for "business name, physical address, registration number and/or tax identification number". The become-a-partner page allows an individual partner profile. How a sole individual is verified was **not found**.
4. **Whether the judges' copy and the Marketplace copy can share one Developer Space.** **[I]** Likely yes, since both are just apps in the space, but not confirmed.
5. **Deploying new code to the submitted app during review.** The listing is locked. Whether new production deploys during review are allowed or reset the review is **not found**. [I] Freeze the Marketplace copy at submission and iterate only on the judges' copy.
6. **No official "free apps are faster" statement was found.** Timelines on official pages range from 1 week to 15 business days. The December holidays may slow review further [I].
7. **Whether judges actually check a ticket or listing link they cannot open.** ECOHELP tickets are private. **[I]** Include screenshots of the ticket, the submission confirmation email and the listing draft in the Devpost write-up and video.
8. The asset-spec page is dated 2020. Check the specs in the live submission form.

---

## 4. Implications for idea selection

- **Prefer a zero-egress Forge app** (Forge storage, plus Rovo or Forge LLM if needed). Reasons:
  - a short P&S tab with mostly "No" answers
  - no FIT/TLS questionnaire fail risks
  - no remote hostnames to justify
  - RoA badge eligibility
  - PINNED data residency
  - the smallest review surface
- **Avoid in the Marketplace copy:**
  - Forge Remote or external services, unless they are core to the idea
  - `rovo:agentConnector`, which needs an external A2A server
  - anything EAP-only
  - Preview modules (`rovo:mcp`, `rovo:skill`, TWG API) are allowed in production
- **TWG API scopes need an org admin to install.** This makes reviewer and judge setup harder, so document it clearly. If you also want the Marketplace bonus, remember one project can win only one bonus. Pick the bonus you are most likely to win:
  - The Marketplace bonus is the most mechanical: submission plus a ticket link.
  - Competition for it is likely lower [I].
  - It is compatible with any idea that has a credible free listing.
- **Avoid names starting with "Jira", "Confluence" or "Rovo".** Use "X for Jira".
- **Keep scopes minimal.** Each scope needs a written justification.
- Pin dependencies and run `npm audit` with zero critical or high findings before submitting. A scan failure rejects the ticket and forces a new one.
- Plan **two app IDs from day one**: `appname` for judges (shared via link) and `appname-mp` for Marketplace. Script deploys of both from one codebase, for example with two manifests or a manifest template, so the copy is cheap to keep in sync.

---

## 5. Recommended dated timeline (target: ECOHELP ticket URL in hand by Mon Dec 8, 2026)

The plan is to submit on **Thu Dec 3**. That leaves 3 business days of buffer for ticket-access problems or a vulnerability-scan rejection and resubmission.

| Date | Action |
|---|---|
| **Thu Nov 19 – Fri Nov 21** | Account setup (Action Items 1-5): Developer Space, billing consent (check whether a card is needed), 2SV, Developer Community account, ecosystem.atlassian.net account. Pick the app name and **check it is free** on Marketplace. Check you have photo ID and a phone with a camera for KYC. |
| **Mon Nov 23 – Fri Nov 27** | Build the MVP on the judges' app. Settle the manifest **scopes and egress** (aim for zero egress). Run `forge eligibility` (RoA check). Draft the privacy policy, EULA (adopt Atlassian's standard EUA), documentation page and support email or page. Host them on a public URL, for example GitHub Pages. |
| **Mon Nov 30** | **Publish the Developer Space to Marketplace** (accept the Partner Agreement). This is irreversible and public. Fill in the vendor profile (name, logo 144x144, generic contact email). Add yourself as the Security contact role. |
| **Tue Dec 1** | `forge register` the Marketplace copy (`appname-mp`) in the same space. Run `forge deploy -e production`. Set Distribution to **Sharing**. Install it on a **fresh** dev site and smoke-test. Get `npm audit` to zero critical or high. |
| **Wed Dec 2** | Make the assets: logo, banner, 3 highlights (1840x900 + 580x330 crops), captions, tagline, description, release summary. Pre-fill the P&S tab answers and the per-scope justification text. |
| **Thu Dec 3** | Create the listing at https://marketplace.atlassian.com/manage/apps/create and fill in the P&S tab. **Submit.** Save the confirmation email. |
| **Fri Dec 4** | Confirm the ECOHELP ticket exists and **you can open it**. If you can't, raise a support request right away (https://ecosystem.atlassian.net/servicedesk/customer/portal/34) and ask for the Reporter to be fixed. Start the **Partner Verification** ticket forms and the Partner Security Questionnaire (14-day limit) and do the Stripe ID check. |
| **Mon Dec 7 – Tue Dec 8** | If the scan rejected the ticket: fix, resubmit, and record the **new** ticket URL. **Dec 8 is the hard target for having a ticket URL.** Answer reviewer questions promptly. |
| Dec 8 – Dec 20 | Keep building on the **judges' copy** only. Do not change the Marketplace copy unless the reviewer asks. Record the video, including a short segment showing the listing or ticket. |
| **Sun Dec 20** | Submit on Devpost (internal target). Include the installation link (judges' copy), the ticket or listing URL, and screenshots of the ticket and listing. |
| Dec 22, 12:00pm PT | Official deadline. |

---

## 6. ACTION ITEMS (sign-ups and access)

1. Make sure you have an Atlassian account plus Developer Console access, and create a **Developer Space**: https://developer.atlassian.com/console/myapps/ (Developer Spaces overview is linked from the publish page below).
2. Set up a billing account and give billing consent on the space: https://developer.atlassian.com/platform/forge/developer-space/billing-for-developer-spaces/
3. Turn on **2-step verification** on your Atlassian account (2SV for partners: https://developer.atlassian.com/platform/marketplace/security-partners-2sv/).
4. Register on the **Atlassian Developer Community** (approval criterion; also needed for help): https://community.developer.atlassian.com/
5. Create an **ecosystem.atlassian.net** account (security contact, AMS, and ECOHELP ticket access): https://ecosystem.atlassian.net/servicedesk/customer/portal/34
6. Publish the Developer Space (accept the Partner Agreement): https://developer.atlassian.com/platform/forge/developer-space/publish-developer-space/
7. Create the listing: https://marketplace.atlassian.com/manage/apps/create
8. Partner Verification help or ticket: https://ecosystem.atlassian.net/servicedesk/customer/portal/34/group/110/create/4219 (linked as "Submit Partner Verification" from the onboarding hub)
9. Have ready a government photo ID, a phone with a camera, a physical address and a tax ID (if you have one) for Stripe Identity KYC.
10. Allow community.developer.atlassian.com in session network settings if you want deeper community evidence on review times (it was blocked here).

---

## 7. Sources (fetched 2026-11-19; page "Last updated" in brackets)

Devpost (live):
- https://codegeist2026.devpost.com/ (bonus prizes, requirements)
- https://codegeist2026.devpost.com/rules (dates, bonus text, installation-link requirement, "one Grand Prize and one Bonus Prize")
- https://codegeist2026.devpost.com/resources (bonus links to listing-forge-apps)
- https://codegeist2026.devpost.com/updates

Atlassian Marketplace docs:
- https://developer.atlassian.com/platform/marketplace/listing-forge-apps/ [Aug 26 2026]
- https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/ [May 15 2026]
- https://developer.atlassian.com/platform/marketplace/app-approval-security-workflow/ [Jul 24 2025]
- https://developer.atlassian.com/platform/marketplace/partner-due-diligence/ [Apr 21 2026]
- https://developer.atlassian.com/platform/marketplace/creating-a-marketplace-listing/ [Apr 9 2026]
- https://developer.atlassian.com/platform/marketplace/building-your-presence-on-marketplace/ [Jun 5 2020]
- https://developer.atlassian.com/platform/marketplace/security-requirements/ [Feb 19 2026]
- https://developer.atlassian.com/platform/marketplace/app-security-questionnaires/ [Jul 16 2025]
- https://developer.atlassian.com/platform/marketplace/security-privacy-tab/ [Aug 24 2026]
- https://developer.atlassian.com/platform/marketplace/runs-on-atlassian/ [Aug 24 2026]
- https://developer.atlassian.com/platform/marketplace/become-a-partner/ [Aug 24 2026]
- https://developer.atlassian.com/platform/marketplace/knowledge-base/i-cant-edit-my-listing-during-the-review-process/ [Sep 3 2019]
- https://developer.atlassian.com/platform/marketplace/onboarding-hub/plan/register-as-an-atlassian-marketplace-partner/ [May 19 2026]
- https://developer.atlassian.com/platform/marketplace/onboarding-hub/launch/prepare-branding-support-privacy-and-security/ [May 19 2026]
- https://developer.atlassian.com/platform/marketplace/onboarding-hub/launch/create-your-marketplace-listing-and-link-your-forge-app/ [May 19 2026]
- https://developer.atlassian.com/platform/marketplace/onboarding-hub/launch/submit-for-review/ [May 19 2026]

Forge platform docs:
- https://developer.atlassian.com/platform/forge/developer-space/publish-developer-space/ [Jan 6 2026]
- https://developer.atlassian.com/platform/forge/developer-space/billing-for-developer-spaces/ [Aug 25 2026]
- https://developer.atlassian.com/platform/forge/distribute-your-apps/ [Oct 30 2026]
- https://developer.atlassian.com/platform/forge/data-residency/ [Sep 28 2026]
- https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/ [Jul 14 2026]
- https://developer.atlassian.com/platform/forge/whats-coming/ (EAP, Preview, GA) [Aug 28 2026]
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-index/ [Oct 29 2026]
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/ [Oct 29 2026]
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/ [Oct 29 2026]
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/ [Oct 2 2026]
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent-connector/ [Oct 9 2026]
- https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/ [Jul 23 2026]
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/teamwork-graph-connector/ [Apr 14 2026]

Teamwork Graph docs:
- https://developer.atlassian.com/platform/teamwork-graph/ [Nov 19 2025]
- https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/ [Sep 18 2025]
- https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/ [Feb 11 2026]

Marketplace search and legal:
- https://marketplace.atlassian.com/rest/2/addons?text=rovo%20agent&hosting=cloud (also `text=mcp` and `text=teamwork%20graph`). Live search showing listed Rovo, MCP and TWG-connector apps.
- https://www.atlassian.com/licensing/marketplace/end-user-agreement-v1

UNVERIFIED (search snippets only, host blocked):
- https://community.developer.atlassian.com/t/blocked-no-access-to-ecohelp-marketplace-review-ticket-ecohelp-109282-for-forge-app/98756
- https://community.developer.atlassian.com/t/two-forge-apps-stuck-in-marketplace-review-for-months-no-feedback-provided/99096
- https://community.developer.atlassian.com/t/no-access-to-ecohelp-120428-sprintinsite-rejected-4x-for-timeout/100270
- https://community.developer.atlassian.com/t/no-access-to-my-ecohelp-tickets-after-app-submission-ecohelp-165970-ecohelp-165965-reset-link-returns-404/102735
- https://kelaenderkoe.pages.dev/patterns-https-codegeist2022.devpost.com/details/bonusprizes (Codegeist 2022 bonus precedent)
