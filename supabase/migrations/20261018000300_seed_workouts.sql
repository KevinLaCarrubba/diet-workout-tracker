-- Shared exercise catalog and example plans (user_id null = shared, copied on use).

insert into public.exercises (name, primary_muscles, secondary_muscles, equipment, difficulty, is_bodyweight, instructions)
values
  ('Barbell Bench Press', '{chest}', '{triceps,shoulders}', 'Barbell', 'intermediate', false,
   'Lie on the bench with eyes under the bar. Grip slightly wider than shoulders, lower the bar to mid-chest with control, then press back up.'),
  ('Incline Dumbbell Press', '{chest}', '{shoulders,triceps}', 'Dumbbells', 'beginner', false,
   'Set the bench to 30-45°. Press the dumbbells up over the upper chest, lower until elbows are just below the bench.'),
  ('Dumbbell Bench Press', '{chest}', '{triceps,shoulders}', 'Dumbbells', 'beginner', false,
   'Lie flat, dumbbells at chest level. Press up until arms are straight, lower slowly.'),
  ('Push-Up', '{chest}', '{triceps,shoulders,core}', 'Bodyweight', 'beginner', true,
   'Hands under shoulders, body in a straight line. Lower chest toward the floor and press back up.'),
  ('Cable Fly', '{chest}', '{shoulders}', 'Cable', 'beginner', false,
   'With a slight bend in the elbows, bring the handles together in front of the chest, then return under control.'),
  ('Machine Chest Press', '{chest}', '{triceps,shoulders}', 'Machine', 'beginner', false,
   'Adjust the seat so handles are at mid-chest. Press forward, return slowly.'),
  ('Dip', '{chest,triceps}', '{shoulders}', 'Bodyweight', 'intermediate', true,
   'Support yourself on parallel bars, lower until shoulders are just below elbows, press back up.'),
  ('Deadlift', '{back,hamstrings,glutes}', '{forearms,core}', 'Barbell', 'advanced', false,
   'Bar over mid-foot, hinge and grip. Brace, push the floor away and stand tall with a neutral spine. Lower under control.'),
  ('Barbell Row', '{back}', '{biceps,rear delts}', 'Barbell', 'intermediate', false,
   'Hinge to about 45°, pull the bar to the lower ribs, squeeze the shoulder blades, lower with control.'),
  ('Pull-Up', '{back}', '{biceps}', 'Bodyweight', 'intermediate', true,
   'Hang with an overhand grip, pull until the chin clears the bar, lower fully.'),
  ('Chin-Up', '{back,biceps}', '{}', 'Bodyweight', 'intermediate', true,
   'Hang with an underhand grip, pull until the chin clears the bar, lower fully.'),
  ('Lat Pulldown', '{back}', '{biceps}', 'Cable', 'beginner', false,
   'Pull the bar to the upper chest while keeping the torso tall, return slowly.'),
  ('Seated Cable Row', '{back}', '{biceps,rear delts}', 'Cable', 'beginner', false,
   'Sit tall, pull the handle to the stomach, squeeze shoulder blades, return with control.'),
  ('Dumbbell Row', '{back}', '{biceps,rear delts}', 'Dumbbells', 'beginner', false,
   'One hand and knee on a bench, row the dumbbell to the hip, lower slowly.'),
  ('Face Pull', '{rear delts}', '{upper back}', 'Cable', 'beginner', false,
   'Rope at face height. Pull toward the forehead with elbows high, rotating hands apart.'),
  ('Overhead Press', '{shoulders}', '{triceps,core}', 'Barbell', 'intermediate', false,
   'Bar at the collarbones, brace and press overhead until arms lock out, lower to the start.'),
  ('Dumbbell Shoulder Press', '{shoulders}', '{triceps}', 'Dumbbells', 'beginner', false,
   'Seated or standing, press dumbbells from shoulder height to overhead.'),
  ('Lateral Raise', '{shoulders}', '{}', 'Dumbbells', 'beginner', false,
   'Raise dumbbells out to the sides to shoulder height with a slight elbow bend, lower slowly.'),
  ('Rear Delt Fly', '{rear delts}', '{upper back}', 'Dumbbells', 'beginner', false,
   'Hinge forward, raise the dumbbells out to the sides, squeeze, lower slowly.'),
  ('Arnold Press', '{shoulders}', '{triceps}', 'Dumbbells', 'intermediate', false,
   'Start palms facing you, rotate the palms forward as you press overhead.'),
  ('Back Squat', '{quads,glutes}', '{hamstrings,core}', 'Barbell', 'intermediate', false,
   'Bar on the upper back, brace, sit down between the hips to at least parallel, drive up.'),
  ('Front Squat', '{quads}', '{glutes,core}', 'Barbell', 'advanced', false,
   'Bar on the front of the shoulders, elbows high, squat down with an upright torso, drive up.'),
  ('Goblet Squat', '{quads,glutes}', '{core}', 'Dumbbells', 'beginner', false,
   'Hold a dumbbell at the chest, squat down between the knees, stand back up.'),
  ('Romanian Deadlift', '{hamstrings,glutes}', '{back}', 'Barbell', 'intermediate', false,
   'Soft knees, hinge at the hips and slide the bar down the thighs until hamstrings stretch, stand up.'),
  ('Leg Press', '{quads,glutes}', '{hamstrings}', 'Machine', 'beginner', false,
   'Feet shoulder-width on the platform, lower until knees are about 90°, press back up.'),
  ('Walking Lunge', '{quads,glutes}', '{hamstrings}', 'Dumbbells', 'beginner', false,
   'Step forward and lower the back knee toward the floor, push through the front foot into the next step.'),
  ('Bulgarian Split Squat', '{quads,glutes}', '{hamstrings}', 'Dumbbells', 'intermediate', false,
   'Rear foot on a bench, lower straight down on the front leg, drive back up.'),
  ('Leg Extension', '{quads}', '{}', 'Machine', 'beginner', false,
   'Extend the knees until legs are straight, lower slowly.'),
  ('Lying Leg Curl', '{hamstrings}', '{}', 'Machine', 'beginner', false,
   'Curl the pad toward the glutes, lower slowly.'),
  ('Hip Thrust', '{glutes}', '{hamstrings}', 'Barbell', 'intermediate', false,
   'Upper back on a bench, bar over the hips. Drive the hips up until the body is flat, lower.'),
  ('Standing Calf Raise', '{calves}', '{}', 'Machine', 'beginner', false,
   'Rise onto the balls of the feet, pause, lower into a full stretch.'),
  ('Barbell Curl', '{biceps}', '{forearms}', 'Barbell', 'beginner', false,
   'Elbows at the sides, curl the bar to the shoulders, lower slowly.'),
  ('Dumbbell Curl', '{biceps}', '{forearms}', 'Dumbbells', 'beginner', false,
   'Curl dumbbells with palms up, keep elbows still, lower slowly.'),
  ('Hammer Curl', '{biceps,forearms}', '{}', 'Dumbbells', 'beginner', false,
   'Palms facing each other, curl to the shoulders, lower slowly.'),
  ('Triceps Pushdown', '{triceps}', '{}', 'Cable', 'beginner', false,
   'Elbows pinned to the sides, push the bar or rope down until arms are straight.'),
  ('Skull Crusher', '{triceps}', '{}', 'Barbell', 'intermediate', false,
   'Lying on a bench, lower the bar toward the forehead by bending the elbows, extend back up.'),
  ('Overhead Triceps Extension', '{triceps}', '{}', 'Dumbbells', 'beginner', false,
   'Hold one dumbbell overhead with both hands, lower behind the head, extend.'),
  ('Plank', '{core}', '{shoulders}', 'Bodyweight', 'beginner', true,
   'Forearms on the floor, body in a straight line. Hold. Log seconds as reps.'),
  ('Hanging Leg Raise', '{core}', '{hip flexors}', 'Bodyweight', 'intermediate', true,
   'Hang from a bar, raise the legs to hip height or higher without swinging, lower slowly.'),
  ('Cable Crunch', '{core}', '{}', 'Cable', 'beginner', false,
   'Kneel facing the cable, crunch the ribs toward the hips, return slowly.'),
  ('Ab Wheel Rollout', '{core}', '{shoulders}', 'Ab wheel', 'intermediate', true,
   'Kneel, roll the wheel forward as far as you can with a flat back, roll back.')
on conflict do nothing;

-- Example plans.
do $$
declare
  t uuid;
  ord integer;
  item record;
  plans jsonb := '[
    {"plan": "Push/Pull/Legs", "title": "Push", "description": "Chest, shoulders, triceps", "rest": 120, "items": [
      ["Barbell Bench Press", 4, 6, 10, 150], ["Overhead Press", 3, 6, 10, 120], ["Incline Dumbbell Press", 3, 8, 12, 90],
      ["Lateral Raise", 3, 12, 15, 60], ["Triceps Pushdown", 3, 10, 15, 60], ["Overhead Triceps Extension", 2, 10, 15, 60]]},
    {"plan": "Push/Pull/Legs", "title": "Pull", "description": "Back, rear delts, biceps", "rest": 120, "items": [
      ["Deadlift", 3, 4, 6, 180], ["Pull-Up", 3, 6, 10, 120], ["Barbell Row", 3, 8, 10, 120],
      ["Face Pull", 3, 12, 15, 60], ["Barbell Curl", 3, 8, 12, 60], ["Hammer Curl", 2, 10, 12, 60]]},
    {"plan": "Push/Pull/Legs", "title": "Legs", "description": "Quads, hamstrings, glutes, calves", "rest": 120, "items": [
      ["Back Squat", 4, 5, 8, 180], ["Romanian Deadlift", 3, 8, 10, 120], ["Leg Press", 3, 10, 12, 90],
      ["Lying Leg Curl", 3, 10, 15, 60], ["Standing Calf Raise", 4, 10, 15, 60]]},
    {"plan": "Upper/Lower", "title": "Upper", "description": "Upper-body strength", "rest": 120, "items": [
      ["Barbell Bench Press", 4, 6, 8, 150], ["Barbell Row", 4, 6, 10, 120], ["Overhead Press", 3, 8, 10, 120],
      ["Lat Pulldown", 3, 10, 12, 90], ["Dumbbell Curl", 2, 10, 12, 60], ["Triceps Pushdown", 2, 10, 12, 60]]},
    {"plan": "Upper/Lower", "title": "Lower", "description": "Lower-body strength and core", "rest": 120, "items": [
      ["Back Squat", 4, 5, 8, 180], ["Romanian Deadlift", 3, 8, 10, 120], ["Walking Lunge", 3, 10, 12, 90],
      ["Lying Leg Curl", 3, 10, 12, 60], ["Standing Calf Raise", 3, 12, 15, 60], ["Plank", 3, 30, 60, 60]]},
    {"plan": "Full Body", "title": "Full Body A", "description": "Squat, press, row", "rest": 90, "items": [
      ["Back Squat", 3, 5, 8, 150], ["Barbell Bench Press", 3, 6, 10, 120], ["Barbell Row", 3, 8, 10, 120],
      ["Lateral Raise", 2, 12, 15, 60], ["Plank", 2, 30, 60, 60]]},
    {"plan": "Full Body", "title": "Full Body B", "description": "Hinge, overhead press, pull", "rest": 90, "items": [
      ["Deadlift", 3, 4, 6, 180], ["Overhead Press", 3, 6, 10, 120], ["Pull-Up", 3, 6, 10, 120],
      ["Walking Lunge", 2, 10, 12, 90], ["Hanging Leg Raise", 2, 8, 12, 60]]}
  ]';
  p jsonb;
begin
  for p in select * from jsonb_array_elements(plans) loop
    if exists (select 1 from public.workout_templates where user_id is null and plan_name = p ->> 'plan' and title = p ->> 'title') then
      continue;
    end if;
    insert into public.workout_templates (user_id, title, description, default_rest_seconds, plan_name)
    values (null, p ->> 'title', p ->> 'description', (p ->> 'rest')::integer, p ->> 'plan')
    returning id into t;
    ord := 0;
    for item in select value as v from jsonb_array_elements(p -> 'items') loop
      insert into public.workout_template_exercises (template_id, exercise_id, sort_order, target_sets, rep_min, rep_max, rest_seconds)
      select t, e.id, ord, (item.v ->> 1)::integer, (item.v ->> 2)::integer, (item.v ->> 3)::integer, (item.v ->> 4)::integer
        from public.exercises e
       where e.owner_user_id is null and e.name = item.v ->> 0;
      ord := ord + 1;
    end loop;
  end loop;
end;
$$;
