// What background.js stores and the page reads, so the two can't drift apart.
//
// Storage (chrome.storage.local): "start" is the day counting began, and each day has its own
// "day:YYYY-MM-DD" key holding { trackers, ads, other, sources: { name: [counts in KINDS order] } }.
// "historyRemoved" is when history was last deleted, and "activity" the page's browsing
// activity cache (see activity.js), which the worker drops whenever history is deleted.

// A day's sources hold counts per kind in this order, as a company like Google can be both
export const KINDS = ["trackers", "ads", "other"];
// Days of blocked requests kept. Chrome keeps as much history.
export const KEEP_DAYS = 90;

// YYYY-MM-DD, local time. Takes a Date or a timestamp.
export const dayOf = (t) => new Date(t).toLocaleDateString("en-CA");
// The day n days before from, by the calendar, so a day with a clock change is still one day
export const daysAgo = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return dayOf(d);
};
