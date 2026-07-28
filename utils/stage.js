function classifyStage(currentStage, messageCount, daysSinceFirst) {
  if (currentStage === 'convert') return 'convert';

  if (daysSinceFirst <= 2) return 'catch';
  if (daysSinceFirst <= 5) return 'warm';
  if (daysSinceFirst >= 5 && messageCount >= 4) return 'convert';
  return 'warm';
}

module.exports = { classifyStage };
