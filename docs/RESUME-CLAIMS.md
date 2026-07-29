# Resume claims → evidence map

The resume bullet for this project currently reads (bracketed placeholders are
literal — they are in the `.tex` file):

> **Browser AI Agent**: Autonomous web agent that completes natural-language
> tasks across unseen sites, scoring **[X]% on [N] tasks** from the WebVoyager
> benchmark. Serializes pages via [accessibility tree / set-of-marks] to fit a
> **[X]-token** per-step budget, with a vision fallback triggered on **[X]%** of
> pages where DOM structure alone was insufficient. Replans after failed actions
> using a bounded retry policy; [dominant failure mode] accounted for most
> remaining failures.

**Do not send the resume with brackets in it.** Every one is a measurement this
project owes.

**Rule: no number goes in the resume until it comes out of a run.** If the pass
rate is 38%, the bullet says 38%. A number that cannot survive "how did you
measure that?" is worse than no project at all.

---

## The six placeholders

| Placeholder | Filled by | Interview question to survive |
|---|---|---|
| **[X]% pass rate** | feat-016, the benchmark run | "Judged how? By what protocol?" → LLM judge, plus human agreement on a sample |
| **[N] tasks** | ~100, stratified across all 15 sites | "Why not all 643?" → know the real answer: hand-labeling every failure is the differentiator, and it doesn't scale to 643 |
| **[a11y tree / set-of-marks]** | feat-018 ablation, chosen with data | "Why that one?" → because it measured better, and here is the other arm's number |
| **[X]-token budget** | feat-006, measured distribution | "What happens when a page exceeds it?" → know the truncation policy |
| **[X]% vision fallback rate** | feat-012, deterministic trigger | "What counts as 'DOM was insufficient'?" → a defined trigger, not a judgment call |
| **[dominant failure mode]** | feat-017 taxonomy | "How did you classify them?" → hand-labeled, with the category definitions written down first |

---

## Claims that must hold structurally

| Claim | Justified by | Watch out for |
|---|---|---|
| "across unseen sites" | no site-specific code, anywhere | If you write an Amazon-specific selector, this claim dies. No per-site branches. |
| "bounded retry policy" | explicit constants: max retries, max replans, step cap, wall-clock cap | "What are the bounds?" — know all four numbers |
| "replans after failed actions" | the replan path is distinct from the retry path in code | Be able to explain when it retries vs when it replans |

---

## The credibility problem, and the fix

WebVoyager scores with an LLM judge. This project's agent runs on GLM and the
obvious judge is also GLM — **a model family grading its own homework.** An
interviewer who knows the benchmark will raise this, and "I didn't think about
it" is a bad answer.

The fix is cheap: hand-label a stratified sample of episodes yourself and report
**judge-vs-human agreement** alongside the pass rate. That single extra number
converts the weakest point of the project into evidence that you think about
measurement properly.

Owed: agreement rate on ≥30 hand-labeled episodes (feat-015).

## Agent failures vs benchmark failures

The WebVoyager task set is from 2024. Sites have changed, some tasks are no
longer possible, and some sites block automated browsers outright. Those are
**not agent failures**, and lumping them in understates the agent while
overstating the benchmark's validity.

Report the split explicitly: pass rate over *attempted* tasks, and pass rate
over *reachable* tasks, with the difference explained. Being the person who
noticed this is worth more than a higher number.
