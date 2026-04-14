export const emojiMap: Record<string, string> = {
  ':thumbsup:': '👍', ':thumbsdown:': '👎', ':heart:': '❤️',
  ':fire:': '🔥', ':rocket:': '🚀', ':eyes:': '👀',
  ':100:': '💯', ':check:': '✅', ':x:': '❌',
  ':wave:': '👋', ':clap:': '👏', ':pray:': '🙏',
  ':laugh:': '😂', ':smile:': '😊', ':thinking:': '🤔',
  ':tada:': '🎉', ':star:': '⭐', ':warning:': '⚠️',
  ':bulb:': '💡', ':zap:': '⚡', ':gem:': '💎',
  ':chart:': '📈', ':money:': '💰', ':bitcoin:': '₿',
};

export function replaceShortcodes(text: string): string {
  return text.replace(/:[a-z_]+:/g, match => emojiMap[match] || match);
}
