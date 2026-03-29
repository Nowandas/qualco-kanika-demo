export const avatarStyles = ["adventurer", "adventurer-neutral", "bottts", "avataaars", "thumbs", "initials"] as const;

export function randomAvatarSeed() {
  return Math.random().toString(36).slice(2, 12);
}

export function randomAvatarStyle() {
  return avatarStyles[Math.floor(Math.random() * avatarStyles.length)];
}

export function avatarUrl(seed?: string | null, style = "adventurer-neutral") {
  const safeSeed = seed && seed.length > 0 ? seed : "user";
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(safeSeed)}`;
}
