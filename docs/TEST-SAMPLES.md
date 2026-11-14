# Writeflow test samples

Paste these into Writeflow to see each feature work. They are made up for testing.

## 1. The AI-sounding draft (paste into the Draft box)

```
In today's fast-paced world, it is important to note that renewable energy plays a crucial role in shaping our future. Moreover, Dr. Maria Santos from the University of Texas stated on March 14, 2024 that "solar panels reduced energy costs by 37 percent" across 12 school districts. This multifaceted landscape serves as a testament to human innovation, highlighting the pivotal need to leverage cutting-edge solutions. Furthermore, it is worth noting that students in Austin saved $2,450 in the first year, and experts agree that the future looks bright. In conclusion, renewable energy continues to evolve, paving the way for a sustainable tomorrow.
```

How the flow works: **paste, Scan, review the score, then Humanize**.

1. Paste the text into **Your text** (left). The status line says "Press Scan to check it."
2. Press **Scan** (bottom right of the left card, next to **Humanize all**). The left card turns into a review view where AI-sounding sentences and phrases are highlighted. The right card opens on the **Score** tab.

What the Score tab shows for this paragraph (no scrolling needed):
- A gauge around **68** with "Strong AI-sounding habits", **12 flagged phrases in 5 sentences**, reading grade about 11.
- **Most AI-sounding sentences**, each with a **Humanize** button.
- Flagged phrases, reading level and (if you saved one) "Sounds like you" below.

3. Humanize part of it: click a highlighted sentence, or select any text, and press **Humanize selection**. Or press **Humanize** next to a sentence in the list. The result appears on the **Rewrite** tab as a "Selection rewrite" with **Replace in my text**, **Try again** and a close button. After you replace, the text is re-scanned and **Undo** appears in the status line.
4. Humanize everything: press **Humanize all** (same row as Scan; it turns into **Stop** while the model is writing, and Ctrl or ⌘ + Enter also works). The right card switches to the **Rewrite** tab. A slim strip on top shows the score change ("68 → 51"), **Facts ✓ kept** or **⚠ review** (click it for details), grade and "Like you". Below it is the rewrite with the app's own "Show changes" view.
5. **Use as my text** puts the rewrite in the text box and scans it again, so you can keep improving it.

If you edit the text after a scan, the status line says "Text changed since the scan. Press Re-scan."

## 2. Test "Create fact"

Select `"solar panels reduced energy costs by 37 percent"` in the draft and click the lock button (Create fact). The quote then comes back word for word.

## 3. Test "Sounds like you" (open "My writing style" below the score and paste this)

```
I don't really like mornings. My alarm goes off at six and I just lie there. Mom yells up the stairs, so I get up. Breakfast is toast, mostly. I'm usually late for the bus, which is annoying, but the driver knows me now. Today I forgot my lunch again, and I had to borrow a sandwich from Jake.
```

On the Score tab, scroll to "My writing style" at the bottom, paste it and click Save my style. A "Like you" chip then appears, with "Sounds like you" for the draft and the rewrite, and lists where they differ (for example sentence length, "I" and "my", contractions).

## 4. Test reading level

On the Score tab, change "Target reading level" to Middle school. It says the draft is above that level. Switch to College and the message changes.

## 5. A human-sounding control (scores about 7, low)

```
I spent Saturday fixing the bike. The chain had rusted through, so I swapped it for a $14 one from the shop on Elm Street. It took two hours, mostly because I lost a bolt. Found it under the fridge, of all places. Rides fine now, though the left pedal clicks.
```

## 6. Test a cloud model

Menu (three dots) → Cloud model (API key) → pick a provider, paste a key, Test connection, pick a model, tick the box, Save and use. The header pill then says "Cloud" and a notice shows above the editor. Use the menu again → Use the local model to switch back.
