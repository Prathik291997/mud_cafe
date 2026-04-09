/** Build a UPI deep link for QR (PhonePe, GPay, etc.). */
export function buildUpiPayUri(args: {
  upiPa: string;
  payeeName: string;
  amount: string;
  transactionNote: string;
}) {
  const q = new URLSearchParams();
  q.set("pa", args.upiPa);
  q.set("pn", args.payeeName);
  q.set("am", args.amount);
  q.set("cu", "INR");
  q.set("tn", args.transactionNote.slice(0, 80));
  return `upi://pay?${q.toString()}`;
}
