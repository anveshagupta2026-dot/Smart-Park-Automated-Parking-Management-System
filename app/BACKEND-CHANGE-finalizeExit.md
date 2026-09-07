# finalizeExit — return pricing breakdown + timestamps (needed by exit.html)

In `functions/index.js`, inside `exports.finalizeExit`, there are TWO `return` statements
inside the transaction. Replace both so the exit page gets the breakdown, the bay, and the times.

## 1. The "already billed" early return

Find:
```js
if (ticket.status === "billed") {
  return { amount: ticket.amount, status: "billed", alreadyBilled: true, durationHours: ticket.durationHours || 1 };
}
```
Replace with:
```js
if (ticket.status === "billed") {
  return {
    amount: ticket.amount, status: "billed", alreadyBilled: true,
    durationHours: ticket.durationHours || 1,
    finalRate: ticket.pricingDetails?.finalRate ?? ticket.amount,
    pricingDetails: ticket.pricingDetails || null,
    slotId: ticket.slotId,
    entryTime: ticket.entryTime ? ticket.entryTime.toMillis() : null,
    exitTime: ticket.exitTime ? ticket.exitTime.toMillis() : null
  };
}
```

## 2. The normal return at the end of the transaction

Find:
```js
return { amount: pricing.total, status: "billed", durationHours: pricing.durationHours, finalRate: pricing.finalRate, alreadyBilled: false };
```
Replace with:
```js
return {
  amount: pricing.total, status: "billed", alreadyBilled: false,
  durationHours: pricing.durationHours, finalRate: pricing.finalRate,
  pricingDetails: {
    finalRate: pricing.finalRate,
    occupancyPercent: Math.round(occupancyPercent),
    isPeakHour: isPeak,
    breakdown: pricing.breakdown
  },
  slotId: ticket.slotId,
  entryTime: ticket.entryTime ? ticket.entryTime.toMillis() : null,
  exitTime: now.toMillis()
};
```

## 3. Deploy
```
cd server/functions
firebase deploy --only functions:finalizeExit
```

Nothing else changes. Same inputs, same Firestore writes, just a richer response.
