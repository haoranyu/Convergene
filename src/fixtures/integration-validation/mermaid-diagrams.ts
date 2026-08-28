export const mermaidValidationDiagrams = {
  flowchart: `flowchart LR
    objective[Choose a launch approach] --> decision[Guided workflow]
    decision --> action[Run the release smoke matrix]`,
  timeline: `timeline
    title Outcome formation
    Minute 0 : Meeting started
    Minute 15 : Decision recorded
    Minute 30 : Action recorded`,
  pie: `pie showData
    title Person-hours
    "Outcome formation" : 3
    "Unattributed" : 2`,
} as const;
