/**
 * Demo seed resolver services (ARCHITECTURE §9, SEED_DATA §15.1). The implementation lives in
 * `services/seed/`; the `tt-seed` consumer chain is `consumers/seed-job.ts`.
 */
export { startSeed, getSeedJob, getSeedReport, removeDemoData, seedJobView, type SeedJobDetail, type StartSeedInput, type StartSeedMode } from "./seed/service";
