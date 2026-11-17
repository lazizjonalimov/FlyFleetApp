// While someone who manages the team previews a dispatch team, every API request carries the team, and the API
// answers as it would for that team's dispatchers and refuses any change.
let team: string | null = null;

export function setPreviewTeam(id: string | null): void {
  team = id;
}

export function previewTeam(): string | null {
  return team;
}
