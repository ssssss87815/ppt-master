---
version: alpha
name: PPT Master Productization
description: Design tokens and UI guidance for the PPT Master workbench and productization surfaces.
colors:
  primary: "#111827"
  secondary: "#6B7280"
  accent: "#2563EB"
  neutral: "#F9FAFB"
  surface: "#FFFFFF"
  success: "#059669"
typography:
  h1:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  label-sm:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 10px
  lg: 16px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 12px
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 16px
  panel-muted:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: 16px
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 8px
---

## Overview

PPT Master productization surfaces should feel efficient, calm, and precise. The UI should support long-running generation workflows, checkpoint visibility, and artifact review without visual noise.

## Colors

- **Primary** anchors headlines, key metrics, and the most important labels.
- **Secondary** is for supporting text, metadata, and lower-priority controls.
- **Accent** is reserved for the main call to action and the current active step.
- **Neutral** supports page backgrounds and low-emphasis panels.
- **Surface** is used for cards, editors, and floating panels.
- **Success** highlights completed workflow stages and healthy system status.

## Typography

Use Inter throughout the product UI. Headlines should be compact and high-contrast. Body text should prioritize readability during long review sessions. Small labels should stay restrained and consistent.

## Layout

Prefer stable panel layouts, explicit hierarchy, and generous whitespace around workbench content. Dense data should live inside cards or tables rather than free-floating on the canvas.

## Components

Primary buttons should be the only high-emphasis action in a local area. Default cards should carry most structured content, including checkpoints, previews, and workflow summaries.

## Do's and Don'ts

- Do keep one clear primary action per panel.
- Do preserve strong contrast for workflow-critical status text.
- Don't mix multiple accent colors in the same view.
- Don't use decorative surfaces that compete with preview or checkpoint content.
