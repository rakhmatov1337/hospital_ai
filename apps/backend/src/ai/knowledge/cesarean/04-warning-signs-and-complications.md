---
surgeryType: cesarean
section: warning-signs
title: C-section warning signs, complications & when to call a doctor
sources:
  - NHS Recovery: Caesarean section (OGL v3.0)
  - MedlinePlus: Going home after a C-section (Public Domain)
---

# C-Section Warning Signs & Complications

**Contact a doctor or midwife promptly if any of these occur.** These map to the recovery check-in fields (temperature, pain level, symptoms).

## Infection — wound or womb (endometritis)
- **Fever 38°C (100.4°F) or higher** (MedlinePlus advises calling for a temperature above 100°F / 37.8°C).
- Incision becomes **increasingly red, warm, swollen, or more painful**, **leaks pus/fluid**, or **opens up**.
- **Foul-smelling vaginal discharge** or worsening lower-abdominal pain → possible womb infection.
- **Painful or burning urination**, or leaking urine → possible urinary infection.

## Blood clots
- **Deep vein thrombosis (DVT):** swelling, redness, or warmth in **one leg/calf**, often with pain. *(One leg redder and warmer than the other.)*
- **Pulmonary embolism (emergency):** sudden **shortness of breath, chest pain, or a cough** → seek emergency care immediately.

## Bleeding — postpartum hemorrhage
- **Heavy vaginal bleeding** — e.g., soaking a maternity pad in under an hour, or passing **large clots**.
- Bleeding that is **still heavy after 4 days**, or **continues beyond 4 weeks**.

## Severe pain
- **Severe or worsening abdominal pain** not relieved by your prescribed pain medication.

## Mood (see also emotional recovery)
- **Severe mood changes, or any thoughts of harming yourself or the baby** → urgent help.

---

## Risk-scoring cues (for the AI engine)
Used to ground AI-04 risk scoring against this surgery. Higher risk when, for a post-cesarean patient:
- `temperature ≥ 38.0°C` (especially with wound symptoms) → **infection risk (HIGH)**.
- `painLevel ≥ 8` or rapidly worsening abdominal pain → escalate.
- symptoms include `bleeding` (heavy), `pus`/`wound drainage`, `wound opening` → **infection / hemorrhage (HIGH)**.
- symptoms include `leg swelling`/`calf pain` (one side) → **DVT risk (HIGH)**.
- symptoms include `shortness of breath`/`chest pain` → **PE — emergency (CRITICAL)**.
- symptoms include `burning urination` → UTI (MEDIUM).
- mood = very low + self-harm mention → **mental-health escalation (HIGH)**.
Low/expected: mild tenderness, lochia fading red→yellow, fatigue, normal temperature.
