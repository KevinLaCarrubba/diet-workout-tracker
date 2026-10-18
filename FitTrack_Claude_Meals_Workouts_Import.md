# FitTrack — Coach Meal Plan & Training Protocol Import

Source: screenshots of plans prepared by Garrett Lopez, dated October 18, 2026. This is a faithful transcription where visible, with proposed times clearly marked. Do not invent exercise weights, workout duration, exact meal times, rice measurement basis, or missing instructions.

## Instructions for Claude Code

You are working in my **existing React + Supabase + Mantine PWA**. First inspect the actual repository, existing Supabase schema, migrations, data models, user identity and UI conventions. **Do not scaffold a new app.** Add this plan to my account as editable, user-owned seed/import data. Use idempotent upserts or a one-time import so re-running does not duplicate records. Respect RLS and do not expose other users' data. Preserve coach-provided labels, ordering, alternatives, tempo, and exceptions. Meal reminders must be editable and support push notifications where permitted. Do **not** create calories, macros, nutrition facts, food databases, or supplement purchase links. The app needs meal titles, descriptions, quantities, relative timing, reminders, and completed/skipped state, plus water logging. Workouts need day, muscle group, exercise order, default 3x10, special prescriptions, tempo, optional notes, editable weight and actual sets/reps, rest timer, and completed/skipped state. Distinguish the coach's instructions from the proposed clock schedule below. Ask me to confirm timing conflicts rather than silently changing meal quantities or workout instructions.

## Proposed Daily Schedule (wake 4:30 AM; gym starts 5:00 AM)

**These clock times are proposed UI defaults, not times specified by the coach.** The original meal plan does not give exact times for Meals 2, 5, or 6. The 5:00 AM workout conflicts with the coach's Meal 3 instruction to eat 60–90 minutes before training; do not claim both are satisfied.

| Time                | Item                                      | Implementation                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4:30 AM             | Wake                                      | Daily schedule anchor                                                                                                                                                                                                    |
| 4:35 AM             | Meal 1: 2 scoops whey                     | Coach says within 30 min of waking **or immediately after fasted cardio**; choosing before gym is a proposed option, not fasted cardio                                                                                   |
| 5:00 AM             | Begin gym                                 | Scheduled workout on training days                                                                                                                                                                                       |
| During workout      | Water / optional intra-workout supplement | Coach: 1 serving BCAAs **or** EAAs in 16–24 oz water, sip during training, **weight-training days only**                                                                                                                 |
| ~6:30 AM (editable) | Meal 4: post-workout meal                 | Trigger reminder from actual workout/cardio completion where possible, rather than assume gym ends at 6:30                                                                                                               |
| 9:00 AM (editable)  | Meal 2: beef                              | Suggested time only                                                                                                                                                                                                      |
| 12:30 PM (editable) | Meal 3: chicken, rice, peanut butter      | Coach calls this _pre-workout_ and says 60–90 minutes before training. At 5 AM training, this placement is **not** pre-workout. Mark as timing conflict and request user/coach approval for moving/switching meal slots. |
| 4:30 PM (editable)  | Meal 5: protein and rice                  | Suggested time only                                                                                                                                                                                                      |
| 8:00 PM (editable)  | Meal 6: egg whites or whey                | Suggested time only                                                                                                                                                                                                      |

**Important:** Meal numbering remains the coach's original numbering. Do not silently relabel Meal 4 as Meal 2 even if eaten earlier. Provide an editable schedule with a `display_order` separate from `meal_number`. The coach says swap pre-/post-workout meals with whichever meals you train around if workout time changes. Get confirmation of how to implement this for a 5 AM start; the user may want to eat Meal 3 the prior evening, move wake-up earlier, or ask the coach for a different arrangement. Do not choose for them.

## Meal Templates — Daily (all 7 days unless user changes schedule)

### Meal 1 — Upon Waking

- **2 scoops whey protein**.
- Coach note: Eat within 30 minutes of waking or immediately after fasted cardio.
- No other food prescribed.

### Meal 2 — Beef

- **6 oz** of **90% lean grass-fed beef OR sirloin steak OR bison**.
- Optional: **4–8 spears asparagus OR 1 cucumber**.
- Optional: **1 digestive enzyme tablet by NOW Nutrition** with meal.
- **No rice or other side required.**

### Meal 3 — Pre-Workout Meal

- **6 oz** lean white protein: **chicken OR 99% lean ground turkey**.
- **5.5 oz jasmine rice**.
- **36 g peanut butter**, specified as **Skippy**, with simple sugars, **not organic peanut butter**.
- Coach timing: **60–90 minutes before training**.
- Coach note: When training at a different time, switch pre-/post-workout meals with meals around the actual training time.

### Meal 4 — Post-Workout Meal

- **6 oz** lean white protein: **chicken OR 93% lean ground turkey OR white fish**, **OR 2 scoops whey protein**.
- **1 serving cream of rice**.
- Coach timing: Immediately after post-workout cardio / upon finishing training.
- Coach note: Adjust placement around actual training time.

### Meal 5 — Protein and Rice

- **6 oz** lean white protein: **chicken OR 99% lean ground turkey OR white fish**.
- **5 oz jasmine rice**.
- Optional: **4–8 spears asparagus OR 1 cucumber**.

### Meal 6 — Egg Whites or Whey

- **11 oz egg whites**, optional **4–8 spears asparagus**, **OR 1.5 scoops whey protein**.

### Supplements — Weight-Training Days Only

- Optional pre-workout: any pre-workout of choice, **15–30 minutes before training**.
- Intra-workout: **1 serving BCAAs OR EAAs** with **16–24 oz water**, sip throughout workout.
- Post-workout: Eat post-workout meal immediately after training.
- Supplements are informational coach notes, not mandatory checklist items; no assumption that BCAAs and EAAs must both be used.

### Water Tracker

- Support daily water goal configurable by user, manual add amounts in oz or mL, quick add 8/12/16/24 oz, daily total and history.
- Intra-workout 16–24 oz can be logged as water without double counting. No daily water target is specified by the coach.

### Meal Tracking Data Requirements

- `meal_number`, `title`, `description`, `ingredients` as free-text structured quantity/option records, `coach_timing_note`, `scheduled_time` nullable, `relative_event` (wake/workout_start/workout_end), `relative_offset_minutes` nullable, `is_optional`, `day_of_week`, `completion_status`, `completed_at`, `user_id`.
- Editable reminders and optional snooze; never send missed-meal shaming messages.
- Store quantity units literally. **Raw vs cooked weights are not specified**; do not convert or assume. Cream-of-rice serving size not specified.

## Training Protocol

Coach: Garrett Lopez, October 18, 2026. Primary goal: build muscle. Experience: intermediate.

**Global default:** **3 sets x 10 reps for every exercise unless otherwise stated**. Each exercise needs a set logger for actual reps and weight. Tempo is grouped by muscle and provided below. No default rest intervals are specified; make rest duration user-configurable. AMRAP means as many reps as possible with appropriate form; record actual reps.

### Sunday — Back + Biceps

**Back — Tempo 2-1-2-0**

1. Cable Lat Pushdowns — 3x10
2. Seated Neutral Grip Lat Pulldown — 3x10
3. Seated Close Grip Row — 3x10
4. Bent-over Cable High Elbow Row — 3x10
5. Seated Machine High Row w/ Twist (Single Hand) — 3x10

**Biceps** (no separate tempo specified) 6. Standing Single Arm Bicep Cable Curl — 3x10; _step forward to start with tension pulling_ 7. Standing Alternating Dumbbell Curl — 3x10 8. Standing Dumbbell Hammer Curls — 3x10; _+5 lb over previous curls_ (coach instruction, not a fixed load) 9. Seated Bicep Preacher Curl Machine — 3x10

### Monday — Shoulders + Chest

**Shoulders — Tempo 1-2-1-0**

1. Cable Rope Face Pulls — 3x10
2. Bent Over Cable Rear Delt Flyes — 3x10
3. Cable Side Lateral Raise — 3x10
4. Cable Front Raise — 3x10
5. Seated Machine Overhead Press — 3x10
6. Standing Viking Press — **1 set AMRAP**
7. Seated Dumbbell Lateral Raise — **2 sets AMRAP**

**Chest — Tempo 2-3-1-0** 8. Incline Dumbbell Chest Flyes — 3x10 9. Cable Crossovers — 3x10 10. Barbell Bench Press — 3x10 11. Incline Bench Press — 3x10 12. Smith Machine Incline Bench — 3x10 13. Push-ups — **3 sets AMRAP**

### Tuesday — Legs + Glutes + Calves

**Legs** (tempo not specified)

1. Quad Extensions — 3x10
2. Hamstring Curls — 3x10
3. Heavy Lunges — 3x10
4. Pendulum Squat — 3x10
5. Hack Squat — 3x10; _wide stance, toes out, push through glutes_
6. Hips Adductors (Close Legs) — 3x10

**Glutes** 7. Hip Abductors (Open Legs) — 3x10 8. Heavy Hip Thrusts — 3x10 9. Wall Sits — **5 rounds, 30+ seconds each** (duration-based, not 3x10) 10. Dumbbell Split Squats **OR** Kettlebell Split Squats — 3x10 (one alternative exercise slot)

**Calves — 3x20 each** 11. Seated Calf Raise — **3x20** 12. Standing Calf Raise — **3x20**

### Wednesday — Back

**Back — Tempo 2-1-2-0**

1. Machine Seated Pullover — 3x10
2. Incline Bench Chest Supported Cable Rows — 3x10
3. Cable Seated High Row — 3x10
4. Single Arm Alternating Dumbbell Row (Bench Supported) — 3x10
5. Bent Over Barbell Row — 3x10
6. Pull-ups — **3 sets AMRAP**
7. Dead Weight Hangs — **4 rounds, 20+ seconds each** (duration-based)

### Thursday — Rest

- Scheduled rest day. No missed-workout reminder.

### Friday — Shoulders + Triceps + Chest

**Shoulders — Tempo 1-2-1-0**

1. Incline Y-Raise — 3x10
2. Lying Dumbbell Rear Delt Flyes — 3x10
3. Hammer Dumbbell Front Raise — 3x10
4. Seated Dumbbell Lateral Raise — 3x10

**Triceps** (no separate tempo specified) 5. Cable Pushdown w/ Rope — 3x10 6. Single Hand Cable Pushdown — 3x10; _supinated grip, start from opposite pec, push outward_ 7. Overhead Cable Tricep Extension — 3x10 8. Seated Triceps Pushdown Machine — 3x10 9. Cable Tricep Kickback — 3x10

**Chest — Tempo 2-3-1-0** 10. Pec Deck Machine Chest Flyes — 3x10 11. Seated Machine Press — 3x10 12. Incline Machine Press — 3x10 13. Smith Machine Flat Bench — 3x10 14. Chest Dips — **3 sets AMRAP**

### Saturday — Legs + Glutes + Calves

**Legs** (tempo not specified)

1. Quad Extensions — 3x10
2. Hamstring Curls — 3x10
3. Bodyweight Lunges — 3x10
4. Weighted Step-ups (on bench or box) — 3x10
5. Hack Squat (Light Weight) — 3x10
6. Hips Adductors (Close Legs) — 3x10

**Glutes** 7. Hip Abductors (Open Legs) — 3x10 8. Light Hip Thrusts — 3x10 9. Wall Sits — **5 rounds, 30+ seconds each** 10. Bodyweight Squats **OR** Kettlebell Squats — 3x10 (one alternative exercise slot)

**Calves — 3x20 each** 11. Seated Calf Raise — **3x20** 12. Standing Calf Raise — **3x20**

## Workout App Import Requirements

- Weekly schedule repeats Sunday–Saturday; Thursday is rest. Default workout start time is **5:00 AM**, editable per user/day.
- Group exercises by body part while preserving listed order. Preserve tempo at group/exercise level; no tempo supplied for biceps/triceps/legs/glutes/calves, so don't invent it.
- Represent AMRAP as `rep_mode=amrap` with no fixed target reps; log actual reps.
- Represent wall sits and dead hangs as timed sets (`duration_seconds_min=30` or `20`, `set_count=5` or `4`).
- Alternatives (`OR`) should be selectable, not duplicated into mandatory exercises.
- Weight values start unset; user logs their actual load. Hammer curl note is a coach cue, not an automatically assigned weight.
- Workouts can be edited/skipped/rescheduled; scheduled rest is not missed.
- Record session timestamps, exercise sets, weights, reps, completion, and optional notes.
- Notify for a missed workout only after a configurable grace period and only if it was scheduled, not completed, and not explicitly skipped/rescheduled.
- The coach's schedule is high volume. Allow users to disable or modify exercises and discuss suitability with their clinician/coach, especially for joint or back discomfort. Do not automatically prescribe additional training.

## Acceptance Criteria

1. My account shows 6 daily meal templates, exact foods/quantities/alternatives, optional items, and editable reminder times.
2. I can tap **Ate**, **Skip**, or **Snooze** for each meal; no calories or macros anywhere in this workflow.
3. Water logging is separate, with daily progress and history.
4. Workout calendar contains exactly six training days and Thursday rest, with all exercises above in correct order.
5. Every ordinary exercise defaults to 3x10; AMRAP, calf 3x20, wall sits, and hangs use their special prescription.
6. Exercise set logging supports actual weight/reps and timed holds; completed workouts appear in history.
7. Coach tempo and form cues appear in workout details.
8. All clock times are editable, and Meal 3 vs 5 AM timing conflict is visibly flagged for confirmation.
9. Push reminders are permission-aware, deduplicated, and respect user's timezone and quiet hours.
10. Import is repeatable without duplicate data, RLS protects personal data, and existing app functionality remains intact.

## Questions to confirm (do not guess)

- Does the coach mean meat and rice weights **raw or cooked**?
- How should the coach's Meal 3 pre-workout requirement be handled with a **5:00 AM** gym start?
- What time does the workout/cardio normally end? Use actual completion when possible.
- Does the coach intend all six meals every day, including Thursday rest day? The screenshot lists supplements only on weight-training days but does not specify a different rest-day diet.
- Does the coach want the high-volume leg routine modified for any knee/back limitations?
