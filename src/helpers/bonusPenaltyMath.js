function toSignedAmount(amount, type) {
  const numeric = Number(amount || 0);
  const absolute = Number.isFinite(numeric) ? Math.abs(numeric) : 0;
  return type === 'penalty' ? -absolute : absolute;
}

module.exports = {
  toSignedAmount
};
