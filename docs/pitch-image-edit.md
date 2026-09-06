# Pitch image cleanup

Mode: built-in image generation tool, image edit.

Source: `public/hockey-pitch-reference.png` (retained).
App asset: `public/hockey-pitch-clean.png`.

Prompt:

> Edit this existing hockey pitch image. Remove only the small dark circular camera/search overlay clipped into the extreme bottom-left corner. Fill its area with the same uninterrupted blue outer pitch surround, seamlessly matching the surrounding flat blue. Preserve the entire remaining image exactly: same blue colours, rectangular pitch, all white lines and dots, goals, composition, dimensions and framing. Do not redesign, crop, add text, add icons or change any pitch markings. This is a precise local removal for an application background asset.

Visually inspected: the corner overlay is removed. The generated image retains the pitch layout but is a higher-resolution rendering rather than a pixel-identical patch.
