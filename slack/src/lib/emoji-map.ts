export const emojiMap: Record<string, string> = {
  ':thumbsup:': '👍', ':thumbsdown:': '👎', ':heart:': '❤️',
  ':fire:': '🔥', ':rocket:': '🚀', ':eyes:': '👀',
  ':100:': '💯', ':check:': '✅', ':x:': '❌',
  ':wave:': '👋', ':clap:': '👏', ':pray:': '🙏',
  ':laugh:': '😂', ':laughing:': '😂', ':smile:': '😊', ':thinking:': '🤔',
  ':tada:': '🎉', ':star:': '⭐', ':warning:': '⚠️',
  ':bulb:': '💡', ':zap:': '⚡', ':gem:': '💎',
  ':chart:': '📈', ':money:': '💰', ':bitcoin:': '₿',
  ':ok_hand:': '👌', ':raised_hands:': '🙌', ':muscle:': '💪',
  ':sparkles:': '✨', ':memo:': '📝', ':link:': '🔗',
  ':pin:': '📌', ':bell:': '🔔', ':mute:': '🔇',
  ':search:': '🔍', ':gear:': '⚙️',
};

export function replaceShortcodes(text: string): string {
  return text.replace(/:[a-z_]+:/g, match => emojiMap[match] || match);
}
